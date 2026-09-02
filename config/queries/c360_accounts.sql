-- @param customer STRING
SELECT account_id, account_type, status, balance, product_tier, branch_region
FROM dante_classic_stable_catalog.amarbank_retail.dim_account
WHERE customer_id = :customer
ORDER BY balance DESC;
