-- @param customer STRING
SELECT
  c.customer_id, d.full_name, d.city, d.province,
  c.age, c.gender, c.income_band, c.credit_score_band, c.kyc_status, c.region,
  c.tenure_days, c.txn_90d, c.txn_30d, c.value_90d, c.value_30d, c.recency_days, c.login_30d,
  c.n_accounts, c.total_balance, c.n_cards, c.n_loans, c.loan_outstanding, c.max_dpd,
  c.n_fraud_cases, c.fraud_txn_90d, c.churn_score, c.clv_pred_idr, c.next_best_action, c.risk_band
FROM dante_classic_stable_catalog.amarbank_retail.gold_c360 c
LEFT JOIN dante_classic_stable_catalog.tunaiku_lending.dim_customer d ON c.customer_id = d.customer_id
WHERE c.customer_id = :customer;
