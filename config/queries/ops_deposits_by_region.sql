SELECT branch_region AS region,
       ROUND(SUM(balance)/1e9, 1) AS deposits_bn_idr,
       COUNT(*) AS accounts
FROM dante_classic_stable_catalog.amarbank_retail.dim_account
GROUP BY branch_region
ORDER BY deposits_bn_idr DESC;
