-- @param customer STRING
SELECT case_id, fraud_type, date_format(opened_ts, 'yyyy-MM-dd') AS opened, risk_score, status, disposition, assigned_to
FROM dante_classic_stable_catalog.amarbank_retail.fact_fraud_case
WHERE customer_id = :customer
ORDER BY opened_ts DESC;
