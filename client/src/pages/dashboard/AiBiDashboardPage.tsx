import { Card, CardContent, Badge, Alert, AlertDescription } from '@databricks/appkit-ui/react';
import { NavLink } from 'react-router';

const WORKSPACE_HOST = 'https://fevm-dante-classic-stable.cloud.databricks.com';
const DASHBOARD_ID = '01f1a6a7c6281ae4aa9d1b19bc8a688c';
const WORKSPACE_ID = '7474647641788932';
const EMBED_URL = `${WORKSPACE_HOST}/embed/dashboardsv3/${DASHBOARD_ID}?o=${WORKSPACE_ID}`;

export function AiBiDashboardPage() {
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI/BI Dashboard (embedded)</h2>
          <p className="text-sm text-muted-foreground">
            The same governed metrics as a managed Databricks AI/BI dashboard — embedded live,
            with native Databricks chrome, cross-filtering and “Ask Genie”.
          </p>
        </div>
        <Badge variant="secondary">Lakeview · embedded iframe</Badge>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Two ways to surface the same data.</strong> This is the managed AI/BI dashboard
          embedded as-is (Databricks chrome, zero front-end code). The{' '}
          <NavLink to="/ops" className="text-primary underline underline-offset-2">Ops Overview</NavLink>{' '}
          page renders the same governed metrics as fully white-labeled native charts. Same Unity
          Catalog source, two delivery styles — pick per audience.
        </AlertDescription>
      </Alert>

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <iframe
            title="Amar Retail — C360 &amp; Fraud Ops AI/BI dashboard"
            src={EMBED_URL}
            className="w-full"
            style={{ height: 'min(1100px, 82vh)', border: 'none' }}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        If the embed prompts for sign-in, open it directly:{' '}
        <a href={`${WORKSPACE_HOST}/dashboardsv3/${DASHBOARD_ID}/published?o=${WORKSPACE_ID}`}
           target="_blank" rel="noopener noreferrer"
           className="text-primary underline underline-offset-2">open in Databricks →</a>
      </p>
    </div>
  );
}
