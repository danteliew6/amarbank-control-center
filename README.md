# Amar Bank — Retail Control Center

A white-labeled Databricks App for **Amar Bank**, an Indonesian digital bank (Senyumku
savings + Tunaiku lending). It puts fraud triage, a 360° customer view, portfolio
analytics, a natural-language assistant and governance on **one governed Lakehouse** —
replacing a fragmented stack of a legacy warehouse, a standalone fraud engine and siloed
BI/ML/governance tooling.

> AppKit (React + Vite + Express, `@databricks/appkit`), deployed git-source to Databricks Apps.
> **Workspace:** `fevm-dante-classic-stable` · **Catalog/schema:** `dante_classic_stable_catalog.amarbank_retail` · **Data is synthetic** — no real customer data.

## Pages

| Page | What it does | Data path |
|------|--------------|-----------|
| **Fraud Control Center** (default) | Live fraud queue (CRITICAL/HIGH/MEDIUM, model score + top reason), region hotspot map (CARTO tiles), live transaction stream, derived alert feed with Ask-Amar deep-links, and case-action **write-back** (Confirm / Escalate / Clear) | Lakebase (queue/regions/daily/KPIs) + warehouse (txn stream) + Lakebase write-back (`ops.fraud_case_actions`) |
| **Customer 360** | Search a customer → unified profile: identity, deposits, cards, Tunaiku loans + DPD, 90-day activity, channel events, ML risk / churn / CLV / next-best-action, fraud cases | Lakebase search (`gold_c360`) + governed warehouse detail |
| **Ops Overview** | Governed portfolio KPIs + native charts (deposits by region/tier, transaction mix, fraud-rate trend, loan portfolio) | SQL warehouse (`useAnalyticsQuery`) |
| **Ask Amar** | White-labeled Genie chat + embedded native Genie space (EN / Bahasa) | AI/BI Genie |
| **AI/BI Dashboard** | Embedded managed Lakeview dashboard | Lakeview embed |
| **Governance** | Persona switcher (Admin / Fraud Analyst / Regional Ops / Auditor) demonstrating UC PII masks + region row-filter | SQL warehouse (governed) |
| **Architecture** | Config-driven "solution-builder" diagram: sources → Lakeflow → Unity Catalog → metric views → Mosaic AI → serving → this app | static config |

## Data access split

Operational reads (fraud queue, hotspots, customer search) are served from **Lakebase
Postgres** for sub-second latency; analytics/overview and governed detail run on the **SQL
warehouse** (`useAnalyticsQuery`) so Unity Catalog masks and row filters apply live.
Fraud-ops decisions are written back to an app-owned Lakebase schema (`ops.fraud_case_actions`).

## Layout

```
client/   AppKit React front-end (pages: fraud, customer, ops, genie, dashboard, governance, architecture)
server/   Express backend — Lakebase read routes + write-back + schema init (onPluginsReady)
config/   SQL query files (warehouse-backed, type-safe via `appkit generate-types`)
app.yaml / databricks.yml   Databricks Apps manifest + resource bindings
```

See [CLAUDE.md](./CLAUDE.md) for the build + deploy commands.
