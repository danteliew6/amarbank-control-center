import { createApp, analytics, genie, server, serving, lakebase } from '@databricks/appkit';
import { z } from 'zod';

// What-if fraud scoring: human-friendly inputs; the backend derives the 17
// all-double model features and invokes the serving endpoint as the app SP
// (SP context via the bound serving-endpoint resource — no OBO / user scope needed).
const ScoreInput = z.object({
  amount: z.number().min(0),
  channel: z.enum(['QRIS', 'TRANSFER', 'ATM', 'CARD', 'TOPUP', 'BILLPAY']),
  night: z.boolean(),
  foreign: z.boolean(),
  newDevice: z.boolean(),
  highRisk: z.boolean(),
  distance: z.number().min(0),
  velocity: z.number().min(0),
  zscore: z.number(),
});

function buildFraudFeatures(i: z.infer<typeof ScoreInput>): Record<string, number> {
  return {
    amount: i.amount,
    log_amount: Math.log(i.amount + 1),
    txn_hour: i.night ? 2 : 14,
    is_night: i.night ? 1 : 0,
    is_foreign_ip: i.foreign ? 1 : 0,
    is_new_device: i.newDevice ? 1 : 0,
    home_distance_km: i.distance,
    merchant_high_risk: i.highRisk ? 1 : 0,
    txn_velocity_1h: i.velocity,
    device_txn_24h: i.newDevice ? 1 : 8,
    amount_zscore: i.zscore,
    ch_qris: i.channel === 'QRIS' ? 1 : 0,
    ch_transfer: i.channel === 'TRANSFER' ? 1 : 0,
    ch_atm: i.channel === 'ATM' ? 1 : 0,
    ch_card: i.channel === 'CARD' ? 1 : 0,
    ch_topup: i.channel === 'TOPUP' ? 1 : 0,
    ch_billpay: i.channel === 'BILLPAY' ? 1 : 0,
  };
}

// Live-traffic simulator: how many fresh alerts to inject per request.
const SimInput = z.object({ n: z.number().int().min(1).max(25).optional() });

// Shared feed CTE — the served fraud queue is the UNION of the Lakebase serving snapshot
// (public.gold_fraud_queue) and an app-owned live feed (ops.live_fraud_feed) the simulator
// writes at OLTP latency. On this workspace both carry matching Postgres types (boolean
// flags, bigint amount, timestamptz), so no normalization casts are needed.
const FRAUD_FEED_CTE = `
  WITH feed AS (
    SELECT txn_id, customer_id, account_id, channel, merchant_category, amount, txn_ts, region,
           device_id, ip_country, home_distance_km, is_night, is_new_device, is_foreign_ip,
           fraud_score, top_reason, risk_band, is_fraud, FALSE AS is_live
    FROM public.gold_fraud_queue
    UNION ALL
    SELECT txn_id, customer_id, account_id, channel, merchant_category, amount, txn_ts, region,
           device_id, ip_country, home_distance_km, is_night, is_new_device, is_foreign_ip,
           fraud_score, top_reason, risk_band, is_fraud, TRUE AS is_live
    FROM ops.live_fraud_feed
  )`;

// Write-back payload: a fraud-ops decision on a flagged transaction / case.
const CaseActionInput = z.object({
  txn_id: z.string().max(64).optional(),
  case_id: z.string().max(64).optional(),
  customer_id: z.string().max(64).optional(),
  action: z.enum(['confirm_fraud', 'clear', 'escalate']),
  note: z.string().max(500).optional(),
});

createApp({
  plugins: [analytics(), genie(), server(), serving(), lakebase()],
  // Operational-serving reads: the curated gold layer is loaded into Lakebase Postgres
  // (public.gold_fraud_queue / gold_c360 / gold_fraud_daily) and served to the app at OLTP
  // latency instead of re-aggregating on the warehouse. Write-back: fraud-ops decisions
  // persist to an app-owned schema (ops.fraud_case_actions) — reads stay on public.* (the
  // app SP is granted SELECT), writes go to a separate schema the SP creates and owns.
  async onPluginsReady(appkit) {
    // Schema init — runs once at startup; the app SP creates and owns `ops`.
    await appkit.lakebase.query(`
      CREATE SCHEMA IF NOT EXISTS ops;
      CREATE TABLE IF NOT EXISTS ops.fraud_case_actions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id     TEXT,
        txn_id      TEXT,
        customer_id TEXT,
        action      TEXT NOT NULL,
        actor       TEXT NOT NULL,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_fraud_case_actions_created_at
        ON ops.fraud_case_actions (created_at DESC);

      -- Live-traffic feed: fresh fraud alerts injected by the demo simulator. Types mirror
      -- public.gold_fraud_queue on this workspace (bigint amount, boolean flags, timestamptz)
      -- so it UNIONs cleanly (see FRAUD_FEED_CTE). App-SP-owned and writable — the serving
      -- snapshot isn't, so "live" arrivals land here and union into the queue at OLTP latency.
      CREATE TABLE IF NOT EXISTS ops.live_fraud_feed (
        txn_id            TEXT PRIMARY KEY,
        customer_id       TEXT,
        account_id        TEXT,
        channel           TEXT,
        merchant_category TEXT,
        amount            BIGINT,
        txn_ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        region            TEXT,
        device_id         TEXT,
        ip_country        TEXT,
        home_distance_km  DOUBLE PRECISION,
        is_night          BOOLEAN,
        is_new_device     BOOLEAN,
        is_foreign_ip     BOOLEAN,
        fraud_score       DOUBLE PRECISION,
        top_reason        TEXT,
        risk_band         TEXT,
        is_fraud          BOOLEAN,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_live_fraud_feed_txn_ts
        ON ops.live_fraud_feed (txn_ts DESC);
    `);

    appkit.server.extend((app) => {
      // --- What-if fraud scoring: invoke the serving endpoint as the app SP ---
      // Uses appkit.serving(...).invoke (SP/service-principal context by default), so
      // it does NOT rely on the end-user's OBO token (which lacks a model-serving scope).
      app.post('/api/score/txn', async (req, res) => {
        const parsed = ScoreInput.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
          return;
        }
        const rec = buildFraudFeatures(parsed.data);
        try {
          // The exported invoke returns an execution wrapper { ok, status, data, message }
          // at runtime (the generated type only describes the response `data` shape), so
          // read it defensively and forward the endpoint's raw prediction payload.
          const raw = (await appkit.serving('default').invoke({ dataframe_records: [rec] })) as unknown;
          if (raw && typeof raw === 'object') {
            const w = raw as { ok?: boolean; status?: number; data?: unknown; message?: string };
            if (w.ok === false) {
              res.status(w.status ?? 502).json({ error: w.message ?? 'Invocation failed' });
              return;
            }
            res.json('data' in w ? w.data : raw);
            return;
          }
          res.json(raw);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // --- Write-back: record a fraud-ops decision on a transaction / case ---
      app.post('/api/ops/case-actions', async (req, res) => {
        const parsed = CaseActionInput.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
          return;
        }
        const o = parsed.data;
        const actor = req.header('x-forwarded-email') ?? 'local-dev';
        try {
          const { rows } = await appkit.lakebase.query(
            `INSERT INTO ops.fraud_case_actions (case_id, txn_id, customer_id, action, actor, note)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, case_id, txn_id, customer_id, action, actor, note, created_at`,
            [o.case_id ?? null, o.txn_id ?? null, o.customer_id ?? null, o.action, actor, o.note ?? null],
          );
          res.status(201).json(rows[0]);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // --- Live-traffic simulator: inject fresh CRITICAL fraud alerts into the queue ---
      // Samples real customers/accounts/regions from the serving snapshot (so alerts stay
      // coherent with Customer 360) and overrides the fraud-relevant fields with fresh,
      // high-risk live values timestamped NOW(). They surface at the top of the queue via
      // the FRAUD_FEED_CTE union — a genuine "live traffic" stream for demos, at OLTP
      // latency, with no re-load of the serving snapshot required.
      app.post('/api/ops/simulate', async (req, res) => {
        const parsed = SimInput.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
          return;
        }
        const n = parsed.data.n ?? 2;
        try {
          const { rows } = await appkit.lakebase.query(
            `INSERT INTO ops.live_fraud_feed
               (txn_id, customer_id, account_id, channel, merchant_category, amount, txn_ts,
                region, device_id, ip_country, home_distance_km, is_night, is_new_device,
                is_foreign_ip, fraud_score, top_reason, risk_band, is_fraud)
             SELECT
               'LIVE-' || replace(gen_random_uuid()::text, '-', ''),
               customer_id, account_id,
               (ARRAY['QRIS','TRANSFER','ATM','CARD','TOPUP'])[1 + floor(random()*5)::int],
               merchant_category,
               (8000000 + random()*92000000)::bigint,
               NOW(),
               region, device_id,
               (ARRAY['ID','SG','MY','PH','KH','VN','HK'])[1 + floor(random()*7)::int],
               (random()*1800)::double precision,
               random() < 0.75, random() < 0.70, random() < 0.80,
               (0.90 + random()*0.0999)::double precision,
               (ARRAY['ATO_CASHOUT_NIGHT','QRIS_SCAM','CARD_CNP_FOREIGN','MULE_CASHOUT',
                      'IMPOSSIBLE_TRAVEL','DEVICE_CHANGE_BURST'])[1 + floor(random()*6)::int],
               'CRITICAL',
               TRUE
             FROM public.gold_fraud_queue
             ORDER BY random()
             LIMIT $1
             RETURNING txn_id`,
            [n],
          );
          const { rows: cnt } = await appkit.lakebase.query(
            `SELECT COUNT(*)::int AS total_live FROM ops.live_fraud_feed`,
          );
          res.status(201).json({ inserted: rows.length, total_live: cnt[0]?.total_live ?? 0 });
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // --- Reset the simulated live feed (clears every injected alert) ---
      app.delete('/api/ops/simulate', async (_req, res) => {
        try {
          await appkit.lakebase.query(`TRUNCATE ops.live_fraud_feed`);
          res.json({ cleared: true });
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // --- Read-back: recent fraud-ops decisions (proves persistence) ---
      app.get('/api/ops/case-actions', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT id, case_id, txn_id, customer_id, action, actor, note, created_at
             FROM ops.fraud_case_actions ORDER BY created_at DESC LIMIT 100`,
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      const lbGet = (path: string, sql: string) =>
        app.get(path, async (_req, res) => {
          try {
            const { rows } = await appkit.lakebase.query(sql);
            res.json(rows);
          } catch (e) {
            res.status(500).json({ error: String(e) });
          }
        });

      // --- Fraud Control Center — served sub-second from Lakebase Postgres ---
      // amount is bigint in Postgres (returned as a string by node-pg) → ::float8 for JS numbers.
      // Live arrivals (is_live) float to the top of the queue, then highest model score.
      lbGet('/api/lakebase/fraud-queue', `${FRAUD_FEED_CTE}
        SELECT txn_id, customer_id, account_id, channel, merchant_category,
               amount::float8 AS amount,
               to_char(txn_ts, 'YYYY-MM-DD"T"HH24:MI:SS') AS txn_ts,
               region, device_id, ip_country, home_distance_km,
               is_night, is_new_device, is_foreign_ip,
               fraud_score, top_reason, risk_band, is_fraud, is_live
        FROM feed
        ORDER BY is_live DESC, fraud_score DESC
        LIMIT 250`);

      lbGet('/api/lakebase/fraud-kpis', `${FRAUD_FEED_CTE}
        SELECT COUNT(*)::int                                                        AS queue_size,
               SUM(CASE WHEN risk_band='CRITICAL' THEN 1 ELSE 0 END)::int           AS critical,
               SUM(CASE WHEN risk_band='HIGH' THEN 1 ELSE 0 END)::int               AS high,
               SUM(CASE WHEN risk_band='MEDIUM' THEN 1 ELSE 0 END)::int             AS medium,
               ROUND((SUM(amount)/1e9)::numeric, 2)::float8                         AS amount_at_risk_bn,
               COUNT(DISTINCT customer_id)::int                                     AS customers,
               ROUND(AVG(fraud_score)::numeric, 3)::float8                          AS avg_score
        FROM feed`);

      // Enriched hotspot rollup: volume + exposure + the "why" per region (dominant fraud
      // type / channel / merchant, and the share of cross-border / night / new-device signals)
      // so a hotspot drill-down is actionable. mode() picks the most common categorical value.
      lbGet('/api/lakebase/fraud-by-region', `${FRAUD_FEED_CTE}
        SELECT region,
               COUNT(*)::int                                                        AS cases,
               SUM(CASE WHEN risk_band='CRITICAL' THEN 1 ELSE 0 END)::int           AS critical,
               SUM(CASE WHEN risk_band='HIGH' THEN 1 ELSE 0 END)::int               AS high,
               ROUND((SUM(amount)/1e9)::numeric, 2)::float8                         AS amount_bn,
               ROUND(AVG(fraud_score)::numeric, 3)::float8                          AS avg_score,
               COUNT(DISTINCT customer_id)::int                                     AS customers,
               ROUND((SUM((is_foreign_ip)::int)::numeric  / NULLIF(COUNT(*),0))*100, 1)::float8 AS foreign_pct,
               ROUND((SUM((is_night)::int)::numeric       / NULLIF(COUNT(*),0))*100, 1)::float8 AS night_pct,
               ROUND((SUM((is_new_device)::int)::numeric  / NULLIF(COUNT(*),0))*100, 1)::float8 AS new_device_pct,
               mode() WITHIN GROUP (ORDER BY top_reason)        AS top_reason,
               mode() WITHIN GROUP (ORDER BY channel)           AS top_channel,
               mode() WITHIN GROUP (ORDER BY merchant_category) AS top_merchant
        FROM feed
        GROUP BY region
        ORDER BY cases DESC`);

      lbGet('/api/lakebase/fraud-daily', `
        SELECT to_char(txn_date, 'YYYY-MM-DD') AS day,
               SUM(txns)::int                                                       AS txns,
               SUM(fraud_txns)::int                                                 AS fraud_txns,
               ROUND((SUM(fraud_amount_idr)/1e9)::numeric, 3)::float8               AS fraud_amount_bn,
               ROUND((SUM(fraud_txns)::numeric / NULLIF(SUM(txns),0)) * 100, 3)::float8 AS fraud_rate_pct
        FROM public.gold_fraud_daily
        GROUP BY txn_date
        ORDER BY txn_date`);

      // --- Customer 360 search/typeahead — fast lookup from Lakebase gold_c360 ---
      app.get('/api/lakebase/c360-search', async (req, res) => {
        const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT customer_id, region, risk_band,
                    churn_score,
                    clv_pred_idr,
                    next_best_action,
                    total_balance::float8 AS total_balance,
                    n_accounts::int AS n_accounts,
                    n_loans::int AS n_loans,
                    n_fraud_cases::int AS n_fraud_cases,
                    kyc_status, income_band, credit_score_band
             FROM public.gold_c360
             WHERE ($1 = '' OR customer_id ILIKE '%' || $1 || '%')
             ORDER BY (n_fraud_cases > 0) DESC, churn_score DESC
             LIMIT 60`,
            [q],
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });
    });
  },
}).catch(console.error);
