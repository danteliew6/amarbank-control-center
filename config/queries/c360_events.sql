-- @param customer STRING
SELECT date_format(event_ts, 'yyyy-MM-dd HH:mm') AS event_time, event_type, device_id, os, ip_country
FROM dante_classic_stable_catalog.amarbank_retail.fact_channel_event
WHERE customer_id = :customer
ORDER BY event_ts DESC
LIMIT 15;
