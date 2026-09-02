import {
  useAnalyticsQuery,
  BarChart,
  LineChart,
  DonutChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
} from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1 text-foreground">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

interface OpsKpis {
  customers: number;
  deposits_tn_idr: number;
  loans_out_bn_idr: number;
  avg_churn: number;
  fraud_txns_30d: number;
  fraud_rate_30d: number;
}

// analytics serializes numerics as strings — coerce for display math.
const N = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function OpsOverviewPage() {
  const kpi = useAnalyticsQuery('ops_kpis', {});
  const k = kpi.data?.[0] as OpsKpis | undefined;

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Retail Banking Ops Overview</h2>
          <p className="text-sm text-muted-foreground">
            Governed portfolio KPIs across deposits, lending &amp; fraud · Senyumku + Tunaiku
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3 w-3" /> Unity Catalog governed
        </Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpi.loading || !k ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <KpiCard label="Customers" value={N(k.customers).toLocaleString()} />
            <KpiCard label="Deposits" value={`Rp ${N(k.deposits_tn_idr)} T`} hint="total balances" />
            <KpiCard label="Loans Outstanding" value={`Rp ${N(k.loans_out_bn_idr)} B`} hint="Tunaiku" />
            <KpiCard label="Avg Churn Score" value={N(k.avg_churn).toFixed(3)} />
            <KpiCard label="Fraud Txns (30d)" value={N(k.fraud_txns_30d).toLocaleString()} />
            <KpiCard label="Fraud Rate (30d)" value={`${N(k.fraud_rate_30d).toFixed(3)}%`} />
          </>
        )}
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Deposits by Region (Bn IDR)</CardTitle></CardHeader>
          <CardContent>
            <BarChart queryKey="ops_deposits_by_region" parameters={{}} xKey="region" yKey="deposits_bn_idr" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Deposits by Product Tier (Bn IDR)</CardTitle></CardHeader>
          <CardContent>
            <BarChart queryKey="ops_deposits_by_tier" parameters={{}} xKey="tier" yKey="deposits_bn_idr" height={280} orientation="horizontal" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Transaction Mix by Channel</CardTitle></CardHeader>
          <CardContent>
            <DonutChart queryKey="ops_txn_by_channel" parameters={{}} xKey="channel" yKey="txns" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Daily Fraud Rate (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart queryKey="ops_fraud_trend" parameters={{}} xKey="day" yKey="fraud_rate_pct" height={280} />
            <p className="text-xs text-muted-foreground mt-2">
              Note the late-August fraud spike — the incident driving the Fraud Control Center queue.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle>Loan Portfolio by Status (outstanding, Bn IDR)</CardTitle></CardHeader>
        <CardContent>
          <BarChart queryKey="ops_loans_by_status" parameters={{}} xKey="status" yKey="outstanding_bn_idr" height={260} />
        </CardContent>
      </Card>
    </div>
  );
}
