-- @param region_scope STRING
SELECT region, COUNT(*) AS customers
FROM dante_classic_stable_catalog.amarbank_retail.gold_c360
WHERE :region_scope = 'ALL' OR region = :region_scope
GROUP BY region
ORDER BY customers DESC;
