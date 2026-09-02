SELECT product_tier AS tier,
       ROUND(SUM(balance)/1e9, 1) AS deposits_bn_idr
FROM dante_classic_stable_catalog.amarbank_retail.dim_account
GROUP BY product_tier
ORDER BY deposits_bn_idr DESC;
