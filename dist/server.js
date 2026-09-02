import { analytics, createApp, genie, lakebase, server } from "@databricks/appkit";
import { z } from "zod";

//#region server/server.ts
const CaseActionInput = z.object({
	txn_id: z.string().max(64).optional(),
	case_id: z.string().max(64).optional(),
	customer_id: z.string().max(64).optional(),
	action: z.enum([
		"confirm_fraud",
		"clear",
		"escalate"
	]),
	note: z.string().max(500).optional()
});
createApp({
	plugins: [
		analytics(),
		genie(),
		server(),
		lakebase()
	],
	async onPluginsReady(appkit) {
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
    `);
		appkit.server.extend((app) => {
			app.post("/api/ops/case-actions", async (req, res) => {
				const parsed = CaseActionInput.safeParse(req.body);
				if (!parsed.success) {
					res.status(400).json({
						error: "Invalid input",
						details: parsed.error.issues
					});
					return;
				}
				const o = parsed.data;
				const actor = req.header("x-forwarded-email") ?? "local-dev";
				try {
					const { rows } = await appkit.lakebase.query(`INSERT INTO ops.fraud_case_actions (case_id, txn_id, customer_id, action, actor, note)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, case_id, txn_id, customer_id, action, actor, note, created_at`, [
						o.case_id ?? null,
						o.txn_id ?? null,
						o.customer_id ?? null,
						o.action,
						actor,
						o.note ?? null
					]);
					res.status(201).json(rows[0]);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			app.get("/api/ops/case-actions", async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(`SELECT id, case_id, txn_id, customer_id, action, actor, note, created_at
             FROM ops.fraud_case_actions ORDER BY created_at DESC LIMIT 100`);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			const lbGet = (path, sql) => app.get(path, async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(sql);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			lbGet("/api/lakebase/fraud-queue", `
        SELECT txn_id, customer_id, account_id, channel, merchant_category,
               amount::float8 AS amount,
               to_char(txn_ts, 'YYYY-MM-DD"T"HH24:MI:SS') AS txn_ts,
               region, device_id, ip_country, home_distance_km,
               is_night, is_new_device, is_foreign_ip,
               fraud_score, top_reason, risk_band, is_fraud
        FROM public.gold_fraud_queue
        ORDER BY fraud_score DESC
        LIMIT 250`);
			lbGet("/api/lakebase/fraud-kpis", `
        SELECT COUNT(*)::int                                                        AS queue_size,
               SUM(CASE WHEN risk_band='CRITICAL' THEN 1 ELSE 0 END)::int           AS critical,
               SUM(CASE WHEN risk_band='HIGH' THEN 1 ELSE 0 END)::int               AS high,
               SUM(CASE WHEN risk_band='MEDIUM' THEN 1 ELSE 0 END)::int             AS medium,
               ROUND((SUM(amount)/1e9)::numeric, 2)::float8                         AS amount_at_risk_bn,
               COUNT(DISTINCT customer_id)::int                                     AS customers,
               ROUND(AVG(fraud_score)::numeric, 3)::float8                          AS avg_score
        FROM public.gold_fraud_queue`);
			lbGet("/api/lakebase/fraud-by-region", `
        SELECT region,
               COUNT(*)::int                                                        AS cases,
               SUM(CASE WHEN risk_band='CRITICAL' THEN 1 ELSE 0 END)::int           AS critical,
               ROUND((SUM(amount)/1e9)::numeric, 2)::float8                         AS amount_bn,
               ROUND(AVG(fraud_score)::numeric, 3)::float8                          AS avg_score
        FROM public.gold_fraud_queue
        GROUP BY region
        ORDER BY cases DESC`);
			lbGet("/api/lakebase/fraud-daily", `
        SELECT to_char(txn_date, 'YYYY-MM-DD') AS day,
               SUM(txns)::int                                                       AS txns,
               SUM(fraud_txns)::int                                                 AS fraud_txns,
               ROUND((SUM(fraud_amount_idr)/1e9)::numeric, 3)::float8               AS fraud_amount_bn,
               ROUND((SUM(fraud_txns)::numeric / NULLIF(SUM(txns),0)) * 100, 3)::float8 AS fraud_rate_pct
        FROM public.gold_fraud_daily
        GROUP BY txn_date
        ORDER BY txn_date`);
			app.get("/api/lakebase/c360-search", async (req, res) => {
				const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
				try {
					const { rows } = await appkit.lakebase.query(`SELECT customer_id, region, risk_band,
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
             LIMIT 60`, [q]);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
		});
	}
}).catch(console.error);

//#endregion
export {  };