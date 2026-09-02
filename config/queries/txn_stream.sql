-- Recent live transaction stream (from the 1.47M-row gold stream) with fraud flags.
SELECT
  txn_id,
  customer_id,
  channel,
  date_format(txn_ts, 'HH:mm:ss') AS txn_time,
  amount,
  direction,
  status,
  is_fraud,
  is_night,
  is_foreign_ip
FROM dante_classic_stable_catalog.amarbank_retail.transactions_gold
ORDER BY txn_ts DESC
LIMIT 40;
