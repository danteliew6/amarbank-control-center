-- @param region_scope STRING
-- @param can_unmask STRING
SELECT
  customer_id,
  CASE WHEN :can_unmask = 'true' THEN full_name ELSE concat('••••• ', right(full_name, 3)) END AS full_name,
  CASE WHEN :can_unmask = 'true' THEN nik ELSE 'REDACTED-PII' END AS nik,
  CASE WHEN :can_unmask = 'true' THEN phone ELSE concat('••••••', right(phone, 3)) END AS phone,
  CASE WHEN :can_unmask = 'true' THEN email ELSE concat('••••@', split_part(email, '@', 2)) END AS email,
  region,
  kyc_status
FROM dante_classic_stable_catalog.amarbank_retail.customer_pii
WHERE :region_scope = 'ALL' OR region = :region_scope
ORDER BY customer_id
LIMIT 100;
