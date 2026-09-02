-- @param customer STRING
SELECT loan_id, product_id, principal_amount, outstanding_principal, interest_rate_pa, tenor_months, status, dpd
FROM dante_classic_stable_catalog.tunaiku_lending.fact_loan
WHERE customer_id = :customer
ORDER BY disbursement_date DESC;
