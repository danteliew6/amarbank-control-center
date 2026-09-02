import {
  useAnalyticsQuery,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
  Input,
  Button,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, User, Wallet, CreditCard, HandCoins, Activity, ShieldAlert, Sparkles, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLakebase } from '../../lib/useLakebase';

// analytics + node-pg both serialize numerics as strings — coerce for math.
const N = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

// Compact IDR: miliar (M) / juta (jt).
function rp(v: unknown): string {
  const n = N(v);
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)} jt`;
  return `Rp ${n.toLocaleString()}`;
}

const RISK_TONE: Record<string, string> = {
  HIGH: 'text-red-600 dark:text-red-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-emerald-600 dark:text-emerald-400',
};
const riskBadge = (b: string) =>
  b === 'HIGH' ? 'destructive' : b === 'MEDIUM' ? 'secondary' : 'secondary';

interface SearchRow {
  customer_id: string;
  region: string;
  risk_band: string;
  churn_score: number;
  clv_pred_idr: number;
  next_best_action: string;
  total_balance: number;
  n_accounts: number;
  n_loans: number;
  n_fraud_cases: number;
  kyc_status: string;
  income_band: string;
  credit_score_band: string;
}

function Tile({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone ?? 'text-foreground'}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function MiniTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <div className="text-xs text-muted-foreground py-3">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail — mounted only when a customer is selected (so the warehouse queries
// run only on demand). Reads governed gold + lending from the SQL warehouse.
// ---------------------------------------------------------------------------
function CustomerDetail({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const params = useMemo(() => ({ customer: sql.string(customerId) }), [customerId]);
  const profile = useAnalyticsQuery('c360_profile', params);
  const accounts = useAnalyticsQuery('c360_accounts', params);
  const cards = useAnalyticsQuery('c360_cards', params);
  const loans = useAnalyticsQuery('c360_loans', params);
  const events = useAnalyticsQuery('c360_events', params);
  const cases = useAnalyticsQuery('c360_cases', params);

  const p = profile.data?.[0];

  if (profile.loading) return <Skeleton className="h-96 w-full" />;
  if (!p) return <div className="text-sm text-muted-foreground">No profile found for {customerId}.</div>;

  const risk = String(p.risk_band ?? 'LOW');
  const maxDpd = N(p.max_dpd);
  const askQ = `Summarize the fraud and risk profile for customer ${customerId}`;

  return (
    <div className="space-y-4">
      {/* identity header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full ab-header text-white shadow-sm">
            <User className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-foreground leading-tight">{String(p.full_name ?? customerId)}</h3>
              <Badge variant={riskBadge(risk)}>{risk} risk</Badge>
              {N(p.n_fraud_cases) > 0 && <Badge variant="destructive">{N(p.n_fraud_cases)} fraud case{N(p.n_fraud_cases) === 1 ? '' : 's'}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-mono">{customerId}</span> · {String(p.city ?? '')}{p.city ? ', ' : ''}{String(p.region ?? '')} · {String(p.gender ?? '')}, {N(p.age)} yrs · KYC {String(p.kyc_status ?? '')}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => { void navigate(`/ask?q=${encodeURIComponent(askQ)}`); }}>
          <MessageSquare className="h-3.5 w-3.5" /> Ask Amar about this customer
        </Button>
      </div>

      {/* scores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Churn Score" value={N(p.churn_score).toFixed(3)} tone={N(p.churn_score) >= 0.6 ? RISK_TONE.HIGH : N(p.churn_score) >= 0.3 ? RISK_TONE.MEDIUM : RISK_TONE.LOW} hint="0–1 predicted" />
        <Tile label="Predicted CLV" value={rp(p.clv_pred_idr)} hint="lifetime value" />
        <Tile label="Total Balance" value={rp(p.total_balance)} hint={`${N(p.n_accounts)} account${N(p.n_accounts) === 1 ? '' : 's'}`} />
        <Tile label="Max DPD" value={`${maxDpd} d`} tone={maxDpd >= 30 ? RISK_TONE.HIGH : maxDpd > 0 ? RISK_TONE.MEDIUM : RISK_TONE.LOW} hint="loan delinquency" />
      </div>

      {/* next best action */}
      <div className="rounded-lg border-l-4 border-l-primary bg-accent/40 p-3 flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Next Best Action (ML)</div>
          <div className="text-sm font-medium text-foreground">{String(p.next_best_action ?? '—')}</div>
        </div>
      </div>

      {/* activity snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Txns (90d / 30d)" value={`${N(p.txn_90d)} / ${N(p.txn_30d)}`} />
        <Tile label="Value (90d)" value={rp(p.value_90d)} />
        <Tile label="Logins (30d)" value={N(p.login_30d)} />
        <Tile label="Tenure" value={`${(N(p.tenure_days) / 365).toFixed(1)} yr`} hint={`${N(p.recency_days)}d since last txn`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* deposits */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Deposit Accounts</CardTitle></CardHeader>
          <CardContent>
            {accounts.loading ? <Skeleton className="h-24 w-full" /> : (
              <MiniTable
                headers={['Account', 'Type', 'Tier', 'Status', 'Balance']}
                empty="No accounts."
                rows={(accounts.data ?? []).map((a) => [
                  <span key="id" className="font-mono text-xs">{String(a.account_id)}</span>,
                  String(a.account_type), String(a.product_tier), String(a.status), rp(a.balance),
                ])}
              />
            )}
          </CardContent>
        </Card>

        {/* cards */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Cards</CardTitle></CardHeader>
          <CardContent>
            {cards.loading ? <Skeleton className="h-24 w-full" /> : (
              <MiniTable
                headers={['Card', 'Type', 'Virtual', 'Status']}
                empty="No cards."
                rows={(cards.data ?? []).map((c) => [
                  <span key="id" className="font-mono text-xs">{String(c.card_id)}</span>,
                  String(c.card_type), String(c.is_virtual) === 'true' ? 'Yes' : 'No', String(c.status),
                ])}
              />
            )}
          </CardContent>
        </Card>

        {/* loans */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><HandCoins className="h-4 w-4 text-primary" /> Tunaiku Loans</CardTitle></CardHeader>
          <CardContent>
            {loans.loading ? <Skeleton className="h-24 w-full" /> : (
              <MiniTable
                headers={['Loan', 'Principal', 'Outstanding', 'Status', 'DPD']}
                empty="No loans."
                rows={(loans.data ?? []).map((l) => {
                  const dpd = N(l.dpd);
                  return [
                    <span key="id" className="font-mono text-xs">{String(l.loan_id)}</span>,
                    rp(l.principal_amount), rp(l.outstanding_principal),
                    String(l.status),
                    <span key="dpd" className={dpd >= 30 ? RISK_TONE.HIGH : dpd > 0 ? RISK_TONE.MEDIUM : ''}>{dpd}</span>,
                  ];
                })}
              />
            )}
          </CardContent>
        </Card>

        {/* channel events */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent Channel Events</CardTitle></CardHeader>
          <CardContent>
            {events.loading ? <Skeleton className="h-24 w-full" /> : (
              <MiniTable
                headers={['Time', 'Event', 'Device', 'OS', 'IP']}
                empty="No channel events."
                rows={(events.data ?? []).map((e) => {
                  const foreign = String(e.ip_country) !== 'ID';
                  const suspicious = ['BIOMETRIC_FAIL', 'DEVICE_CHANGE', 'PASSWORD_RESET'].includes(String(e.event_type));
                  return [
                    <span key="t" className="text-xs">{String(e.event_time)}</span>,
                    <span key="ev" className={suspicious ? RISK_TONE.MEDIUM : ''}>{String(e.event_type)}</span>,
                    <span key="dev" className="font-mono text-[11px]">{String(e.device_id)}</span>,
                    String(e.os),
                    <span key="ip" className={foreign ? RISK_TONE.HIGH : ''}>{String(e.ip_country)}</span>,
                  ];
                })}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* fraud cases */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Fraud Cases</CardTitle></CardHeader>
        <CardContent>
          {cases.loading ? <Skeleton className="h-16 w-full" /> : (
            <MiniTable
              headers={['Case', 'Type', 'Opened', 'Risk', 'Status', 'Disposition', 'Assigned']}
              empty="No fraud cases on record."
              rows={(cases.data ?? []).map((c) => [
                <span key="id" className="font-mono text-xs">{String(c.case_id)}</span>,
                String(c.fraud_type), String(c.opened),
                <span key="risk" className="font-semibold">{N(c.risk_score).toFixed(3)}</span>,
                String(c.status), String(c.disposition || '—'), String(c.assigned_to || '—'),
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function Customer360Page() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const url = `/api/lakebase/c360-search?q=${encodeURIComponent(query.trim())}`;
  const { data, loading } = useLakebase<SearchRow>(url);
  const results = data ?? [];

  return (
    <div className="space-y-5 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Customer 360</h2>
          <p className="text-sm text-muted-foreground">
            Unified customer profile · deposits, cards, loans, activity, risk &amp; fraud — governed &amp; served from Lakebase + warehouse
          </p>
        </div>
        <Badge variant="secondary">gold_c360 · 20,000 customers</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* search + results */}
        <Card className="shadow-sm h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Find a customer</CardTitle></CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer ID…" className="pl-8" />
            </div>
            <div className="text-[11px] text-muted-foreground mb-2">
              {loading ? 'Searching…' : `${results.length} shown · highest-risk first`}
            </div>
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
              {results.map((r) => {
                const active = r.customer_id === selected;
                return (
                  <button
                    key={r.customer_id}
                    onClick={() => setSelected(r.customer_id)}
                    className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                      active ? 'border-primary bg-accent ring-1 ring-primary' : 'bg-card hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-foreground">{r.customer_id}</span>
                      <Badge variant={riskBadge(r.risk_band)} className="text-[10px]">{r.risk_band}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.region} · {rp(r.total_balance)}
                      {N(r.n_fraud_cases) > 0 && <span className="text-red-500"> · {N(r.n_fraud_cases)} fraud</span>}
                    </div>
                  </button>
                );
              })}
              {!loading && results.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">No customers match “{query}”.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* detail */}
        <Card className="shadow-sm">
          <CardContent className="pt-5 min-h-[400px]">
            {selected ? (
              <CustomerDetail customerId={selected} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <div className="text-sm font-medium text-foreground">Select a customer to view the 360° profile</div>
                <div className="text-xs text-muted-foreground max-w-sm">
                  Identity, deposits, cards, Tunaiku loans, channel activity, ML risk scores and fraud cases —
                  unified from the governed gold layer.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
