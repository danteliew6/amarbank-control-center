import {
  useAnalyticsQuery,
  BarChart,
  DataTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
  Alert,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface Persona {
  key: string;
  label: string;
  role: string;
  scope: string;
  region_scope: string;
  can_unmask: 'true' | 'false';
}

const PERSONAS: Persona[] = [
  { key: 'admin', label: 'Admin', role: 'Platform admin', scope: 'All regions · clear PII', region_scope: 'ALL', can_unmask: 'true' },
  { key: 'fraud', label: 'Fraud Analyst', role: 'Fraud investigations', scope: 'All regions · clear PII', region_scope: 'ALL', can_unmask: 'true' },
  { key: 'regional', label: 'Regional Ops — Jawa', role: 'Regional operations', scope: 'Jawa only · masked PII', region_scope: 'Jawa', can_unmask: 'false' },
  { key: 'auditor', label: 'Auditor', role: 'Read-only audit', scope: 'All regions · masked PII', region_scope: 'ALL', can_unmask: 'false' },
];

function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export function GovernancePage() {
  const [personaKey, setPersonaKey] = useState('regional');
  const persona = PERSONAS.find((p) => p.key === personaKey)!;
  const params = useMemo(
    () => ({ region_scope: sql.string(persona.region_scope), can_unmask: sql.string(persona.can_unmask) }),
    [persona.region_scope, persona.can_unmask],
  );
  const regionParam = useMemo(() => ({ region_scope: sql.string(persona.region_scope) }), [persona.region_scope]);

  const who = useAnalyticsQuery('whoami', {});
  const summary = useAnalyticsQuery('gov_summary', params);
  const s = summary.data?.[0];
  // analytics serializes booleans/strings — compare as strings explicitly
  const piiClear = String(s?.pii_visible) === 'true';
  const allRegions = String(s?.region_scope) === 'ALL';

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Governed Data Access — RBAC + ABAC</h2>
          <p className="text-sm text-muted-foreground">
            One dataset, four identities. Unity Catalog enforces column masks (RBAC) and
            region-scoped row filters (ABAC) — switch persona to see the same tables change.
          </p>
        </div>
        <Badge variant="secondary">Unity Catalog · column masks + row filter</Badge>
      </div>

      {/* persona switcher */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PERSONAS.map((p) => {
          const active = p.key === personaKey;
          return (
            <button
              key={p.key}
              onClick={() => setPersonaKey(p.key)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                active ? 'border-primary bg-accent ring-1 ring-primary' : 'bg-card hover:bg-muted'
              }`}
            >
              <div className="font-semibold text-sm text-foreground">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.role}</div>
              <div className="text-xs mt-1 text-primary">{p.scope}</div>
            </button>
          );
        })}
      </div>

      {/* access summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.loading || !s ? (
          ['a', 'b', 'c', 'd'].map((x) => <Skeleton key={x} className="h-24 w-full" />)
        ) : (
          <>
            <StatCard label="Identity" value={persona.label} />
            <StatCard label="PII Visible (RBAC)" value={piiClear ? 'Clear' : 'Masked'} tone={piiClear ? 'good' : 'warn'} />
            <StatCard label="Regions Visible (ABAC)" value={`${s.visible_regions} / 5`} />
            <StatCard label="Customers Visible" value={Number(s.visible_customers).toLocaleString()} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RBAC: PII masking */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Customer PII — column masks (RBAC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {persona.label} {piiClear ? 'is privileged → sees clear name / phone / NIK / email.' : 'sees partially-masked name, phone & email; fully-redacted NIK.'}
            </p>
            <DataTable queryKey="gov_pii" parameters={params} filterColumn="customer_id" filterPlaceholder="Filter customer…" pageSize={6} />
          </CardContent>
        </Card>

        {/* ABAC: row scoping */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Customers by Region — row filter (ABAC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {persona.label} {allRegions ? 'sees every region.' : `is scoped to ${persona.region_scope} — other regions are filtered out entirely.`}
            </p>
            <BarChart queryKey="gov_txn_by_region" parameters={regionParam} xKey="region" yKey="customers" height={260} />
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertDescription className="text-xs space-y-1">
          <div>
            <strong>How it works.</strong> The governed <code>customer_pii</code> table carries a column
            mask on name / NIK / phone / email and a row filter on region. Both resolve against the
            caller&apos;s identity via <code>current_user()</code> and the{' '}
            <code>access_allowlist</code> table — no per-persona copies of the data. This app runs as{' '}
            <code>{who.data?.[0]?.identity ?? '…'}</code>; the switcher above simulates each persona&apos;s
            governed view (region scope + unmask privilege) so you can compare them side-by-side. Real UC
            policies enforce identically for every surface — Genie, dashboards and this app alike.
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
