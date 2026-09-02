-- @param region_scope STRING
-- @param can_unmask STRING
SELECT
  :can_unmask AS pii_visible,
  :region_scope AS region_scope,
  (SELECT COUNT(*) FROM dante_classic_stable_catalog.amarbank_retail.customer_pii
     WHERE :region_scope = 'ALL' OR region = :region_scope) AS visible_customers,
  (SELECT COUNT(DISTINCT region) FROM dante_classic_stable_catalog.amarbank_retail.customer_pii
     WHERE :region_scope = 'ALL' OR region = :region_scope) AS visible_regions;
