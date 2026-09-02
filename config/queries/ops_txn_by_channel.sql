SELECT channel, COUNT(*) AS txns
FROM dante_classic_stable_catalog.amarbank_retail.transactions_gold
GROUP BY channel
ORDER BY txns DESC;
