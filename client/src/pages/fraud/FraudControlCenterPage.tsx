import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  Badge,
  Input,
  Label,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ShieldAlert, AlertTriangle, CheckCircle2, MapPin, Activity, RefreshCw,
  MessageSquare, XCircle, ArrowUpCircle, TrendingUp, Radio, Calculator, Sparkles,
} from 'lucide-react';

const REFRESH_MS = 20000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QueueRow {
  txn_id: string; customer_id: string; account_id: string; channel: string;
  merchant_category: string; amount: number; txn_ts: string; region: string;
  device_id: string; ip_country: string; home_distance_km: number;
  is_night: boolean; is_new_device: boolean; is_foreign_ip: boolean;
  fraud_score: number; top_reason: string; risk_band: string; is_fraud: boolean;
}
interface Kpis {
  queue_size: number; critical: number; high: number; medium: number;
  amount_at_risk_bn: number; customers: number; avg_score: number;
}
interface RegionRow { region: string; cases: number; critical: number; amount_bn: number; avg_score: number; }
interface DailyRow { day: string; txns: number; fraud_txns: number; fraud_amount_bn: number; fraud_rate_pct: number; }
interface TxnRow {
  txn_id: string; customer_id: string; channel: string; txn_time: string;
  amount: number; direction: string; status: string;
  is_fraud: boolean; is_night: boolean; is_foreign_ip: boolean;
}
interface CaseAction {
  id: string; txn_id: string | null; customer_id: string | null; action: string;
  actor: string; note: string | null; created_at: string;
}

const N = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const B = (v: unknown) => v === true || String(v) === 'true';
const rp = (v: unknown) => {
  const n = N(v);
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)} jt`;
  return `Rp ${n.toLocaleString()}`;
};
const BAND_TONE: Record<string, string> = {
  CRITICAL: 'text-red-600 dark:text-red-400',
  HIGH: 'text-orange-600 dark:text-orange-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
};
const bandBadge = (b: string) => (b === 'CRITICAL' ? 'destructive' : 'secondary');

// ---------------------------------------------------------------------------
// Data feeders — fetch-based (Lakebase) and analytics-based (warehouse stream).
// Remounted via a changing `key` to re-run on each poll tick.
// ---------------------------------------------------------------------------
function useFetchFeed<T>(url: string, onData: (d: T[]) => void) {
  useEffect(() => {
    let alive = true;
    fetch(url).then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d)) onData(d as T[]); })
      .catch(() => { /* keep previous data on transient error */ });
    return () => { alive = false; };
  }, [url, onData]);
}
function QueueFeeder({ onData }: { onData: (d: QueueRow[]) => void }) { useFetchFeed<QueueRow>('/api/lakebase/fraud-queue', onData); return null; }
function KpiFeeder({ onData }: { onData: (d: Kpis[]) => void }) { useFetchFeed<Kpis>('/api/lakebase/fraud-kpis', onData); return null; }
function RegionFeeder({ onData }: { onData: (d: RegionRow[]) => void }) { useFetchFeed<RegionRow>('/api/lakebase/fraud-by-region', onData); return null; }
function DailyFeeder({ onData }: { onData: (d: DailyRow[]) => void }) { useFetchFeed<DailyRow>('/api/lakebase/fraud-daily', onData); return null; }
function ActionsFeeder({ onData }: { onData: (d: CaseAction[]) => void }) { useFetchFeed<CaseAction>('/api/ops/case-actions', onData); return null; }
function TxnFeeder({ onData }: { onData: (d: TxnRow[]) => void }) {
  const { data } = useAnalyticsQuery('txn_stream', {});
  useEffect(() => {
    if (!data) return;
    onData(data.map((r) => ({
      txn_id: String(r.txn_id), customer_id: String(r.customer_id), channel: String(r.channel),
      txn_time: String(r.txn_time), amount: Number(r.amount), direction: String(r.direction),
      status: String(r.status),
      is_fraud: String(r.is_fraud) === 'true', is_night: String(r.is_night) === 'true',
      is_foreign_ip: String(r.is_foreign_ip) === 'true',
    })));
  }, [data, onData]);
  return null;
}

// ---------------------------------------------------------------------------
// Region hotspot map — CARTO raster tiles laid out by hand (Web-Mercator math),
// zero map libraries. One circle marker per region: size = case count, color =
// severity. Indonesia region centroids are fixed.
// ---------------------------------------------------------------------------
const REGION_CENTROID: Record<string, { lat: number; lng: number }> = {
  'Sumatera': { lat: -0.5, lng: 101.6 },
  'Jawa': { lat: -7.3, lng: 110.2 },
  'Bali & Nusa Tenggara': { lat: -8.7, lng: 118.0 },
  'Kalimantan': { lat: 0.2, lng: 114.0 },
  'Sulawesi': { lat: -2.0, lng: 120.6 },
};
const TILE = 256;
const MAP_H = 380;
const MAP_PAD = 60;
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const worldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
function hotColor(cases: number): string {
  if (cases >= 500) return '#dc2626';
  if (cases >= 150) return '#f97316';
  if (cases >= 90) return '#f59e0b';
  return '#10b981';
}

function RegionMap({ regions }: { regions: RegionRow[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(680);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth || 680);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(
    () => regions.map((r) => ({ ...r, c: REGION_CENTROID[r.region] })).filter((r) => r.c),
    [regions],
  );

  const view = useMemo(() => {
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.c.lat), lngs = pts.map((p) => p.c.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    let z = 8;
    for (; z > 2; z--) {
      const spanX = worldX(maxLng, z) - worldX(minLng, z);
      const spanY = worldY(minLat, z) - worldY(maxLat, z);
      if (spanX <= w - 2 * MAP_PAD && spanY <= MAP_H - 2 * MAP_PAD) break;
    }
    const originX = worldX((minLng + maxLng) / 2, z) - w / 2;
    const originY = worldY((minLat + maxLat) / 2, z) - MAP_H / 2;
    return { z, originX, originY };
  }, [pts, w]);

  const maxCases = useMemo(() => Math.max(...pts.map((p) => N(p.cases)), 1), [pts]);

  const tiles = useMemo(() => {
    if (!view) return [];
    const { z, originX, originY } = view;
    const n = 2 ** z;
    const out: { key: string; src: string; left: number; top: number }[] = [];
    for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + w) / TILE); tx++) {
      for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + MAP_H) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        const sub = 'abcd'[Math.abs(tx + ty) % 4];
        out.push({
          key: `${z}-${tx}-${ty}`,
          src: `https://${sub}.basemaps.cartocdn.com/light_all/${z}/${wx}/${ty}@2x.png`,
          left: tx * TILE - originX, top: ty * TILE - originY,
        });
      }
    }
    return out;
  }, [view, w]);

  return (
    <div ref={wrapRef} className="relative w-full rounded-lg overflow-hidden border bg-muted/30" style={{ height: MAP_H }}>
      {!view ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No fraud activity to map.</div>
      ) : (
        <>
          {tiles.map((t) => (
            <img key={t.key} src={t.src} alt="" draggable={false}
                 style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }} />
          ))}
          {pts.map((p) => {
            const x = worldX(p.c.lng, view.z) - view.originX;
            const y = worldY(p.c.lat, view.z) - view.originY;
            const col = hotColor(N(p.cases));
            const r = 12 + Math.sqrt(N(p.cases) / maxCases) * 26;
            const hot = N(p.cases) >= 500;
            return (
              <div key={p.region}
                   title={`${p.region} · ${N(p.cases)} cases · ${N(p.critical)} critical · ${rp(N(p.amount_bn) * 1e9)} at risk`}
                   className={`absolute ${hot ? 'animate-pulse' : ''}`}
                   style={{
                     left: x, top: y, width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)',
                     borderRadius: '9999px', background: `${col}55`, border: `2px solid ${col}`, zIndex: 5,
                   }}>
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-foreground"
                      style={{ top: r * 2 + 2, textShadow: '0 1px 2px rgba(255,255,255,0.9)' }}>
                  {p.region} · {N(p.cases)}
                </span>
              </div>
            );
          })}
          <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground/80 bg-background/70 px-1 rounded" style={{ zIndex: 6 }}>
            © OpenStreetMap © CARTO
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------
function StatTile({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${tone ?? 'text-foreground'}`}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What-if: score a transaction against the live Mosaic AI fraud endpoint.
// The UI collects a few human-friendly inputs and derives the 17 all-double
// features the endpoint expects; the exactly-one-hot ch_* fields come from the
// selected channel. Scoring runs through the serving() plugin (useServingInvoke).
// ---------------------------------------------------------------------------
const CHANNELS = ['QRIS', 'TRANSFER', 'ATM', 'CARD', 'TOPUP', 'BILLPAY'] as const;
type Channel = (typeof CHANNELS)[number];

interface WhatIfState {
  amount: number; channel: Channel; night: boolean; foreign: boolean;
  newDevice: boolean; highRisk: boolean; distance: number; velocity: number; zscore: number;
}
const PRESETS: { label: string; icon: ReactNode; state: WhatIfState }[] = [
  { label: 'Normal QRIS payment', icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    state: { amount: 48000, channel: 'QRIS', night: false, foreign: false, newDevice: false, highRisk: false, distance: 3, velocity: 1, zscore: 0.2 } },
  { label: 'Late-night foreign cashout', icon: <TrendingUp className="h-3.5 w-3.5" />,
    state: { amount: 5200000, channel: 'TRANSFER', night: true, foreign: true, newDevice: true, highRisk: true, distance: 940, velocity: 6, zscore: 4.0 } },
  { label: 'New-device account takeover', icon: <ShieldAlert className="h-3.5 w-3.5" />,
    state: { amount: 3000000, channel: 'TRANSFER', night: true, foreign: true, newDevice: true, highRisk: true, distance: 620, velocity: 4, zscore: 3.0 } },
];

function scoreBand(s: number): { label: string; tone: string; bar: string; badge: 'destructive' | 'secondary' } {
  if (s >= 0.8) return { label: 'CRITICAL', tone: 'text-red-600 dark:text-red-400', bar: 'bg-red-600', badge: 'destructive' };
  if (s >= 0.5) return { label: 'HIGH', tone: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500', badge: 'destructive' };
  if (s >= 0.3) return { label: 'MEDIUM', tone: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', badge: 'secondary' };
  return { label: 'LOW — cleared', tone: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', badge: 'secondary' };
}

function extractScore(data: unknown): number | null {
  const preds = (data as { predictions?: unknown })?.predictions;
  if (!Array.isArray(preds) || preds.length === 0) return null;
  const arr: unknown[] = preds;
  const first = arr[0];
  if (typeof first === 'number') return first;
  if (first && typeof first === 'object' && 'fraud_score' in first) {
    const v = (first as { fraud_score: unknown }).fraud_score;
    return typeof v === 'number' ? v : Number(v);
  }
  return null;
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`text-xs rounded-md px-2.5 py-1.5 border transition-colors ${
        on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  );
}

function WhatIfScore() {
  const [st, setSt] = useState<WhatIfState>(PRESETS[0].state);
  const set = <K extends keyof WhatIfState>(k: K, v: WhatIfState[K]) => setSt((s) => ({ ...s, [k]: v }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  // Score via the backend route, which invokes the endpoint as the app SP (no OBO scope).
  function run() {
    setLoading(true);
    setError(null);
    fetch('/api/score/txn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(st),
    })
      .then((r) => r.json())
      .then((res: unknown) => {
        if (res && typeof res === 'object' && 'error' in res) {
          setError(String((res as { error: unknown }).error));
          return;
        }
        const s = extractScore(res);
        if (s !== null) setScore(s);
        else setError('No score returned');
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  const band = score !== null ? scoreBand(score) : null;
  const pct = score !== null ? Math.round(score * 1000) / 10 : 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> What-if: score a transaction</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Score a hypothetical transaction against the live Mosaic AI endpoint <span className="font-mono">amarbank-txn-fraud</span>.
          Pick a preset or adjust the inputs — the 17 model features are derived automatically.
        </p>

        {/* presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setSt(p.state); setScore(null); }}
              className="flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 bg-card hover:border-primary/50 hover:bg-accent transition-colors">
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* inputs */}
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Amount (IDR)</Label>
              <Input type="number" value={st.amount} min={0} step={10000}
                onChange={(e) => set('amount', Math.max(0, Number(e.target.value) || 0))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <div className="flex flex-wrap gap-1">
                {CHANNELS.map((c) => (
                  <button key={c} onClick={() => set('channel', c)}
                    className={`text-xs rounded-md px-2 py-1 border transition-colors ${
                      st.channel === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:border-primary/50'
                    }`}>{c}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Signals</Label>
              <div className="flex flex-wrap gap-1.5">
                <Toggle label="New device" on={st.newDevice} onChange={(v) => set('newDevice', v)} />
                <Toggle label="Foreign IP" on={st.foreign} onChange={(v) => set('foreign', v)} />
                <Toggle label="Night hour" on={st.night} onChange={(v) => set('night', v)} />
                <Toggle label="High-risk merchant" on={st.highRisk} onChange={(v) => set('highRisk', v)} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Distance from home</Label>
                <span className="text-xs font-medium text-foreground">{st.distance} km</span>
              </div>
              <input type="range" min={0} max={2000} step={10} value={st.distance}
                onChange={(e) => set('distance', Number(e.target.value))} className="w-full accent-[#1C75BC]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">1h velocity</Label>
                  <span className="text-xs font-medium text-foreground">{st.velocity}</span>
                </div>
                <input type="range" min={0} max={20} step={1} value={st.velocity}
                  onChange={(e) => set('velocity', Number(e.target.value))} className="w-full accent-[#2BB4C4]" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Amount z-score</Label>
                  <span className="text-xs font-medium text-foreground">{st.zscore.toFixed(1)}</span>
                </div>
                <input type="range" min={0} max={6} step={0.1} value={st.zscore}
                  onChange={(e) => set('zscore', Number(e.target.value))} className="w-full accent-[#2BB4C4]" />
              </div>
            </div>

            <Button onClick={run} disabled={loading} className="gap-1.5">
              <Sparkles className="h-4 w-4" /> {loading ? 'Scoring…' : 'Score transaction'}
            </Button>
            {error && <div className="text-destructive text-xs">Error: {error}</div>}
          </div>

          {/* result */}
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-col justify-center">
            {score === null ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Pick a preset and hit <span className="font-medium text-foreground">Score transaction</span> to see the model’s fraud probability.
              </div>
            ) : band && (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fraud probability</div>
                    <div className={`text-4xl font-bold ${band.tone}`}>{pct}%</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={band.badge}>{score >= 0.5 ? '⚠ Block & review' : '✓ Allow'}</Badge>
                    <div className={`text-sm font-semibold mt-1 ${band.tone}`}>{band.label}</div>
                  </div>
                </div>
                <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${band.bar} transition-all`} style={{ width: `${Math.max(1, pct)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Scored live by <span className="font-mono">amarbank-txn-fraud</span> (Mosaic AI Model Serving).</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function FraudControlCenterPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [actions, setActions] = useState<CaseAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [band, setBand] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const onQueue = useCallback((d: QueueRow[]) => { setQueue(d); setLoaded(true); setLastUpdated(new Date()); }, []);
  const onKpis = useCallback((d: Kpis[]) => { if (d[0]) setKpis(d[0]); }, []);
  const onRegions = useCallback((d: RegionRow[]) => setRegions(d), []);
  const onDaily = useCallback((d: DailyRow[]) => setDaily(d), []);
  const onTxns = useCallback((d: TxnRow[]) => setTxns(d), []);
  const onActions = useCallback((d: CaseAction[]) => setActions(d), []);

  // live refresh: remount feeders every REFRESH_MS
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const actedTxns = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of actions) if (a.txn_id) m[a.txn_id] = a.action;
    return m;
  }, [actions]);

  async function act(row: QueueRow, action: 'confirm_fraud' | 'clear' | 'escalate') {
    setBusyId(row.txn_id + action);
    try {
      const res = await fetch('/api/ops/case-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txn_id: row.txn_id, customer_id: row.customer_id, action }),
      });
      if (res.ok) setTick((x) => x + 1); // remount the ActionsFeeder → re-reads the write-back log
    } finally {
      setBusyId(null);
    }
  }

  const filteredQueue = useMemo(() => {
    return queue.filter((r) =>
      (band === 'ALL' || r.risk_band === band) &&
      (q === '' || r.customer_id.toLowerCase().includes(q.toLowerCase()) || r.txn_id.toLowerCase().includes(q.toLowerCase())),
    );
  }, [queue, band, q]);

  // fraud-rate trend sparkline data (recent 45 days) + spike detection
  const trend = useMemo(() => daily.slice(-45), [daily]);
  const maxRate = useMemo(() => Math.max(...trend.map((d) => N(d.fraud_rate_pct)), 0.001), [trend]);
  const spikeDay = useMemo(
    () => [...trend].sort((a, b) => N(b.fraud_rate_pct) - N(a.fraud_rate_pct))[0],
    [trend],
  );

  // ---- alert feed (derived) ----
  interface Alert { id: string; sev: string; border: string; icon: ReactNode; title: string; detail: string; action: string; ask?: string; }
  const alerts: Alert[] = [];
  const worstRegion = [...regions].sort((a, b) => N(b.cases) - N(a.cases))[0];
  if (worstRegion) {
    alerts.push({
      id: 'region', sev: 'crit', border: 'border-l-red-500', icon: <MapPin className="h-4 w-4" />,
      title: `Fraud concentrated in ${worstRegion.region}`,
      detail: `${N(worstRegion.cases)} flagged transactions (${N(worstRegion.critical)} critical) totalling ${rp(N(worstRegion.amount_bn) * 1e9)} at risk — the largest regional cluster in the live queue.`,
      action: `Prioritise ${worstRegion.region} cases; alert the regional fraud pod and freeze the highest-scoring accounts.`,
      ask: `Which merchant categories drive fraud in ${worstRegion.region}?`,
    });
  }
  if (kpis && N(kpis.critical) > 0) {
    alerts.push({
      id: 'critical', sev: 'crit', border: 'border-l-red-500', icon: <ShieldAlert className="h-4 w-4" />,
      title: `${N(kpis.critical)} CRITICAL transactions await review`,
      detail: `${N(kpis.critical)} transactions scored in the CRITICAL band across ${N(kpis.customers)} customers — ${rp(N(kpis.amount_at_risk_bn) * 1e9)} of exposure at an average model score of ${N(kpis.avg_score).toFixed(3)}.`,
      action: 'Work the CRITICAL queue top-down; confirm or clear each case to persist an audit trail.',
      ask: 'How many fraud cases are currently open or under investigation?',
    });
  }
  if (spikeDay && N(spikeDay.fraud_rate_pct) >= 0.5) {
    alerts.push({
      id: 'spike', sev: 'warn', border: 'border-l-amber-500', icon: <TrendingUp className="h-4 w-4" />,
      title: `Fraud-rate spike detected`,
      detail: `Fraud rate peaked at ${N(spikeDay.fraud_rate_pct).toFixed(2)}% on ${spikeDay.day} — well above the baseline daily rate.`,
      action: 'Investigate the spike window for a coordinated attack; review device / IP clustering.',
      ask: 'Show the daily fraud rate trend over the last 30 days',
    });
  }
  const overallCrit = alerts.some((a) => a.sev === 'crit');
  const headline = overallCrit ? 'ELEVATED — active fraud pressure requires attention' : alerts.length ? 'WATCH — fraud signals present' : 'NOMINAL — queue clear';

  const loading = !loaded;
  const now = new Date();
  const clock = `${now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB`;

  return (
    <div className="space-y-5 w-full max-w-7xl mx-auto">
      {/* invisible feeders — remount each tick to re-run (live refresh) */}
      <QueueFeeder key={`q-${tick}`} onData={onQueue} />
      <KpiFeeder key={`k-${tick}`} onData={onKpis} />
      <RegionFeeder key={`r-${tick}`} onData={onRegions} />
      <DailyFeeder key={`d-${tick}`} onData={onDaily} />
      <TxnFeeder key={`t-${tick}`} onData={onTxns} />
      <ActionsFeeder key={`a-${tick}`} onData={onActions} />

      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full ab-header text-white shadow-sm">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">Fraud Control Center</h2>
            <p className="text-sm text-muted-foreground">Real-time transaction fraud triage across Indonesia · scored by Mosaic AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground bg-card border rounded-md px-2.5 py-1.5 shadow-sm">
            {clock}
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            LIVE
          </span>
          <Button variant="ghost" size="sm" onClick={() => setTick((x) => x + 1)} className="gap-1 text-muted-foreground" title="Refresh now">
            <RefreshCw className="h-3.5 w-3.5" />
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* status banner */}
      {!loading && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border-l-4 ${overallCrit ? 'border-l-red-500 bg-red-500/10' : alerts.length ? 'border-l-amber-500 bg-amber-500/10' : 'border-l-emerald-500 bg-emerald-500/10'}`}>
          {overallCrit ? <AlertTriangle className="h-5 w-5 text-red-600" /> : alerts.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          <div className={`font-semibold ${overallCrit ? 'text-red-600 dark:text-red-400' : alerts.length ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>{headline}</div>
          <div className="text-sm text-muted-foreground ml-auto">{alerts.length} active alert{alerts.length === 1 ? '' : 's'}</div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading || !kpis ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <StatTile label="Queue Size" value={N(kpis.queue_size).toLocaleString()} hint="flagged transactions" />
            <StatTile label="Critical" value={N(kpis.critical).toLocaleString()} tone={BAND_TONE.CRITICAL} />
            <StatTile label="High" value={N(kpis.high).toLocaleString()} tone={BAND_TONE.HIGH} />
            <StatTile label="Amount at Risk" value={`Rp ${N(kpis.amount_at_risk_bn).toFixed(1)} M`} tone={BAND_TONE.CRITICAL} hint="miliar IDR" />
            <StatTile label="Customers" value={N(kpis.customers).toLocaleString()} />
            <StatTile label="Avg Fraud Score" value={N(kpis.avg_score).toFixed(3)} hint="model probability" />
          </>
        )}
      </div>

      {/* map + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Fraud Hotspots by Region</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[340px] w-full" /> : (
              <>
                <RegionMap regions={regions} />
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2 flex-wrap">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#10b981' }} /> low</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} /> elevated</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} /> high</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#dc2626' }} /> severe</span>
                  <span className="ml-1">· bubble size = case count</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* alert feed */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Alert Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-[400px] overflow-y-auto">
            {loading ? <Skeleton className="h-40 w-full" /> : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div className="text-sm font-medium text-foreground">No active fraud incidents</div>
              </div>
            ) : alerts.map((a) => (
              <div key={a.id} className={`rounded-lg border border-l-4 ${a.border} bg-card p-3`}>
                <div className={`flex items-center gap-2 font-semibold text-sm ${a.sev === 'crit' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {a.icon} {a.title}
                </div>
                <p className="text-xs text-foreground/80 mt-1">{a.detail}</p>
                <div className="text-xs mt-2 flex items-start gap-1.5">
                  <span className="text-muted-foreground shrink-0">▶ Recommended:</span>
                  <span className="text-foreground/90">{a.action}</span>
                </div>
                {a.ask && (
                  <Button variant="ghost" size="sm" className="mt-2 h-7 gap-1 text-primary"
                    onClick={() => { void navigate(`/ask?q=${encodeURIComponent(a.ask!)}`); }}>
                    <MessageSquare className="h-3.5 w-3.5" /> Ask Amar
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* fraud-rate trend sparkline */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Fraud-Rate Trend
            <span className="text-xs font-normal text-muted-foreground">· daily fraud rate, recent 45 days</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-16 w-full" /> : (
            <div className="flex items-end gap-0.5 h-16">
              {trend.map((d) => {
                const h = Math.max(2, (N(d.fraud_rate_pct) / maxRate) * 60);
                const isSpike = spikeDay && d.day === spikeDay.day;
                return (
                  <div key={d.day} className="flex-1 rounded-sm transition-all"
                    title={`${d.day} · ${N(d.fraud_rate_pct).toFixed(2)}% (${N(d.fraud_txns)} fraud / ${N(d.txns)} txns)`}
                    style={{ height: h, backgroundColor: isSpike ? '#dc2626' : '#1C75BC', opacity: isSpike ? 1 : 0.6 }} />
                );
              })}
            </div>
          )}
          {spikeDay && <p className="text-[11px] text-muted-foreground mt-1">Peak {N(spikeDay.fraud_rate_pct).toFixed(2)}% on {spikeDay.day} (highlighted).</p>}
        </CardContent>
      </Card>

      {/* what-if scoring against the live serving endpoint */}
      <WhatIfScore />

      {/* live queue + transaction stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ranked fraud queue with write-back */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Live Fraud Queue</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map((b) => (
                  <button key={b} onClick={() => setBand(b)}
                    className={`text-xs rounded-md px-2 py-1 border transition-colors ${b === band ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:border-primary/50'}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72 w-full" /> : (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by customer or txn id…" className="mb-3 max-w-xs" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2">Score</th>
                        <th className="py-2 pr-2">Txn / Customer</th>
                        <th className="py-2 pr-2">Region</th>
                        <th className="py-2 pr-2">Channel</th>
                        <th className="py-2 pr-2">Amount</th>
                        <th className="py-2 pr-2">Top Reason</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQueue.slice(0, 12).map((r) => {
                        const acted = actedTxns[r.txn_id];
                        return (
                          <tr key={r.txn_id} className="border-b border-border/50 align-top">
                            <td className="py-2 pr-2">
                              <span className={`font-bold ${BAND_TONE[r.risk_band] ?? ''}`}>{N(r.fraud_score).toFixed(2)}</span>
                              <Badge variant={bandBadge(r.risk_band)} className="ml-1 text-[9px] align-middle">{r.risk_band}</Badge>
                            </td>
                            <td className="py-2 pr-2">
                              <div className="font-mono text-[11px] text-foreground">{r.txn_id}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{r.customer_id}</div>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {B(r.is_foreign_ip) && <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">foreign IP {r.ip_country}</span>}
                                {B(r.is_new_device) && <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">new device</span>}
                                {B(r.is_night) && <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">night</span>}
                              </div>
                            </td>
                            <td className="py-2 pr-2 text-xs">{r.region}</td>
                            <td className="py-2 pr-2 text-xs">{r.channel}</td>
                            <td className="py-2 pr-2 text-xs whitespace-nowrap">{rp(r.amount)}</td>
                            <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[160px]">{r.top_reason}</td>
                            <td className="py-2">
                              {acted ? (
                                <Badge variant="secondary" className={acted === 'confirm_fraud' ? 'text-red-600' : acted === 'escalate' ? 'text-amber-600' : 'text-emerald-600'}>
                                  {acted === 'confirm_fraud' ? '✓ Confirmed' : acted === 'escalate' ? '↑ Escalated' : '✓ Cleared'}
                                </Badge>
                              ) : (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" className="h-7 px-1.5 text-red-600 hover:bg-red-50" title="Confirm fraud"
                                    disabled={busyId === r.txn_id + 'confirm_fraud'} onClick={() => { void act(r, 'confirm_fraud'); }}>
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-1.5 text-amber-600 hover:bg-amber-50" title="Escalate"
                                    disabled={busyId === r.txn_id + 'escalate'} onClick={() => { void act(r, 'escalate'); }}>
                                    <ArrowUpCircle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-1.5 text-emerald-600 hover:bg-emerald-50" title="Clear"
                                    disabled={busyId === r.txn_id + 'clear'} onClick={() => { void act(r, 'clear'); }}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {filteredQueue.length} transactions in view · served from Lakebase · decisions persist to <span className="font-mono">ops.fraud_case_actions</span>
                </div>

                {actions.length > 0 && (
                  <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Recent actions (written to Lakebase)
                    </div>
                    <ul className="space-y-1 text-xs">
                      {actions.slice(0, 5).map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-mono">{o.txn_id ?? o.customer_id}</span> · {o.action.replace('_', ' ')}
                          </span>
                          <span className="text-muted-foreground shrink-0">{o.actor} · {new Date(o.created_at).toLocaleTimeString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* live transaction stream */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /> Live Transaction Stream</CardTitle>
          </CardHeader>
          <CardContent>
            {txns.length === 0 ? <Skeleton className="h-72 w-full" /> : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                {txns.map((t) => (
                  <div key={t.txn_id} className={`flex items-center gap-2 text-xs rounded-md border px-2 py-1.5 ${B(t.is_fraud) ? 'border-l-2 border-l-red-500 bg-red-500/5' : ''}`}>
                    <Activity className={`h-3 w-3 shrink-0 ${B(t.is_fraud) ? 'text-red-500' : 'text-muted-foreground'}`} />
                    <span className="font-mono text-[10px] text-muted-foreground w-14 shrink-0">{t.txn_time}</span>
                    <span className="text-foreground truncate flex-1">{t.channel} · {rp(t.amount)}</span>
                    {B(t.is_foreign_ip) && <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 shrink-0">intl</span>}
                    {B(t.is_fraud) && <span className="text-[9px] px-1 rounded bg-red-600 text-white shrink-0">FRAUD</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Most-recent transactions from <span className="font-mono">transactions_gold</span> (1.47M rows).</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Fraud queue &amp; hotspots served from Lakebase Postgres · scores from Mosaic AI Model Serving · transaction stream from the governed warehouse · decisions written back to Lakebase · auto-refreshes every {REFRESH_MS / 1000}s · governed in Unity Catalog.
      </p>
    </div>
  );
}
