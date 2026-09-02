SELECT to_char(txn_date, 'yyyy-MM-dd') AS day,
       SUM(txns) AS txns,
       SUM(fraud_txns) AS fraud_txns,
       ROUND((SUM(fraud_txns)/NULLIF(SUM(txns),0))*100, 3) AS fraud_rate_pct
FROM dante_classic_stable_catalog.amarbank_retail.gold_fraud_daily
GROUP BY txn_date
ORDER BY txn_date;
