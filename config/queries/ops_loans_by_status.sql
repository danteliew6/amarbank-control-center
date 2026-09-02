SELECT status,
       COUNT(*) AS loans,
       ROUND(SUM(outstanding_principal)/1e9, 1) AS outstanding_bn_idr
FROM dante_classic_stable_catalog.tunaiku_lending.fact_loan
GROUP BY status
ORDER BY loans DESC;
