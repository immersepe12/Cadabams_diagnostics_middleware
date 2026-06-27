-- Per-test pricing for the booking line-item editor.
-- catalogue_tests.price = Crelio's configured testAmount (default in the form).
-- order_items.price = the (possibly edited) price the bill was booked with.
ALTER TABLE catalogue_tests ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE order_items     ADD COLUMN IF NOT EXISTS price NUMERIC;
