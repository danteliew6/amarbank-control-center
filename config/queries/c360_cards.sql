-- @param customer STRING
SELECT card_id, card_type, is_virtual, status
FROM dante_classic_stable_catalog.amarbank_retail.dim_card
WHERE customer_id = :customer
ORDER BY card_id;
