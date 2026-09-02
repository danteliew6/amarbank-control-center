SELECT
  (SELECT COUNT(*) FROM dante_classic_stable_catalog.amarbank_retail.gold_c360)                                                          AS customers,
  (SELECT ROUND(SUM(total_balance)/1e12, 2) FROM dante_classic_stable_catalog.amarbank_retail.gold_c360)                                 AS deposits_tn_idr,
  (SELECT ROUND(SUM(outstanding_principal)/1e9, 1) FROM dante_classic_stable_catalog.tunaiku_lending.fact_loan)                          AS loans_out_bn_idr,
  (SELECT ROUND(AVG(churn_score), 3) FROM dante_classic_stable_catalog.amarbank_retail.gold_c360)                                        AS avg_churn,
  (SELECT SUM(fraud_txns) FROM dante_classic_stable_catalog.amarbank_retail.gold_fraud_daily WHERE txn_date >= date_sub(current_date(), 30)) AS fraud_txns_30d,
  (SELECT ROUND((SUM(fraud_txns)/NULLIF(SUM(txns),0))*100, 3) FROM dante_classic_stable_catalog.amarbank_retail.gold_fraud_daily
     WHERE txn_date >= date_sub(current_date(), 30))                                              AS fraud_rate_30d;
