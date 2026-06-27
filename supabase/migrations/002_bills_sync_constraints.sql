-- Enable upserting orders keyed on Crelio's bill ID (NULL-safe: PG treats each NULL as distinct)
ALTER TABLE orders
  ADD CONSTRAINT orders_crelio_bill_id_unique UNIQUE (crelio_bill_id);

-- Enable upserting order items keyed on (order, crelio test)
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_crelio_test_unique UNIQUE (order_id, crelio_test_id);

-- unified_code is our cross-centre mapping key — backfilled items from Crelio
-- won't have it until the catalogue sync runs; allow NULL temporarily.
ALTER TABLE order_items
  ALTER COLUMN unified_code DROP NOT NULL;
