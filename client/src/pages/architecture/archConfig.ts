// ============================================================================
// Amar Bank solution architecture — SINGLE SOURCE OF TRUTH.
// A left-to-right, zoned "solution-builder" diagram. Edit the ZONES array to
// reconfigure it. Each zone is a labelled stage; each chip is an official
// Databricks product with the real Amar Bank object as its caption.
// ============================================================================

export interface ProductChip {
  id: string;
  product: string; // official Databricks product name
  caption: string; // the real Amar Bank object / resource
  icon: string; // emoji
  detail: string; // shown in the inspector when clicked
}

export interface Zone {
  id: string;
  step: string; // "01".."07"
  title: string;
  subtitle: string;
  accent: string; // hex
  chips: ProductChip[];
  medallion?: { label: string; caption: string }[]; // optional bronze/silver/gold sub-flow
}

export const ZONES: Zone[] = [
  {
    id: 'sources',
    step: '01',
    title: 'Sources',
    subtitle: 'Operational systems',
    accent: '#64748B',
    chips: [
      { id: 'core', product: 'Core Banking', caption: 'Senyumku · accounts · deposits · cards', icon: '🏦',
        detail: 'Ledger, accounts, cards and deposit balances from the Senyumku core banking system.' },
      { id: 'channel', product: 'Digital Channel', caption: 'fact_channel_event', icon: '📱',
        detail: 'Login, view, transaction-init, biometric-fail, device-change and password-reset events — the account-takeover precursor signals that precede fraud.' },
      { id: 'lending', product: 'Tunaiku Lending', caption: 'tunaiku_lending.fact_loan', icon: '💳',
        detail: 'Loan applications, disbursements, outstanding principal and days-past-due from the Tunaiku lending platform.' },
    ],
  },
  {
    id: 'ingest',
    step: '02',
    title: 'Ingestion & Data Quality',
    subtitle: 'Lakeflow Declarative Pipelines',
    accent: '#8DC63F',
    chips: [
      { id: 'lakeflow', product: 'Lakeflow Declarative Pipelines', caption: 'amarbank_dq_pipeline', icon: '🔌',
        detail: 'Managed ingestion + declarative data-quality expectations. Raw events land in bronze; rows that fail expectations are dropped to transactions_quarantine with a labelled reason; conformed records flow to silver and curated gold.' },
    ],
    medallion: [
      { label: 'Bronze', caption: 'transaction_events_bronze' },
      { label: 'Silver', caption: 'transactions_silver' },
      { label: 'Gold', caption: 'transactions_gold · gold_c360' },
    ],
  },
  {
    id: 'govern',
    step: '03',
    title: 'Governance',
    subtitle: 'Unity Catalog',
    accent: '#1C75BC',
    chips: [
      { id: 'uc', product: 'Unity Catalog', caption: 'dante_classic_stable_catalog.amarbank_retail', icon: '🛡️',
        detail: 'One governance layer for every asset: PII column masks (name / NIK / phone / email on customer_pii), region-scoped ABAC row filters driven by access_allowlist, end-to-end lineage and audit — enforced identically across BI, AI and this app.' },
    ],
  },
  {
    id: 'semantic',
    step: '04',
    title: 'Semantic Layer',
    subtitle: 'Metric Views',
    accent: '#4FC0A6',
    chips: [
      { id: 'metrics', product: 'Unity Catalog Metric Views', caption: 'metrics_transactions · metrics_fraud · metrics_deposits', icon: '📐',
        detail: 'Reusable, governed KPI definitions (transaction volume, fraud rate, deposit balances) defined once and shared consistently across Genie and dashboards.' },
    ],
  },
  {
    id: 'ai',
    step: '05',
    title: 'AI & Machine Learning',
    subtitle: 'Mosaic AI',
    accent: '#2BB4C4',
    chips: [
      { id: 'serving', product: 'Mosaic AI Model Serving', caption: 'amarbank-txn-fraud · churn · clv → gold_c360', icon: '🤖',
        detail: 'Real-time transaction fraud scoring plus churn / CLV / next-best-action models. Predictions are materialized into gold_c360 and the fraud queue for operational use.' },
    ],
  },
  {
    id: 'serve',
    step: '06',
    title: 'Serving & Consumption',
    subtitle: 'Governed delivery',
    accent: '#0E5A9C',
    chips: [
      { id: 'genie', product: 'AI/BI Genie', caption: 'Amar Bank Retail Assistant', icon: '💬',
        detail: 'Natural-language analytics over the governed gold model in English or Bahasa Indonesia, with auto-generated SQL and visualizations.' },
      { id: 'aibi', product: 'AI/BI Dashboards', caption: 'Amar Retail — C360 & Fraud Ops', icon: '📊',
        detail: 'Managed Lakeview dashboards on the same governed metrics — embeddable and cross-filtered.' },
      { id: 'lakebase', product: 'Lakebase', caption: 'amarbank-cc-db (Postgres OLTP + write-back)', icon: '⚡',
        detail: 'Curated gold loaded into Lakebase Postgres for sub-second operational reads; fraud-ops decisions are written back to an app-owned schema (ops.fraud_case_actions).' },
    ],
  },
  {
    id: 'app',
    step: '07',
    title: 'Application',
    subtitle: 'This control center',
    accent: '#1C75BC',
    chips: [
      { id: 'app', product: 'Databricks Apps', caption: 'amarbank-control-center', icon: '🖥️',
        detail: 'The white-labeled Databricks App you are using now — fraud control center, Customer 360, ops overview, Genie chat, governance and this architecture, all on one governed platform.' },
    ],
  },
];

export const GOVERNANCE_RIBBON = {
  title: 'Governed end-to-end by Unity Catalog',
  points: ['PII column masks', 'Region-scoped row filters (ABAC)', 'Bronze → gold lineage', 'Tags · audit · one permission model'],
};

// Flat index for the inspector.
export const CHIP_BY_ID: Record<string, ProductChip & { zoneTitle: string; accent: string }> =
  Object.fromEntries(
    ZONES.flatMap((z) => z.chips.map((c) => [c.id, { ...c, zoneTitle: z.title, accent: z.accent }])),
  );
