-- Lock the dashboard's data behind authentication.
-- Backend uses the service-role key (bypasses RLS) — ingestion is unaffected.
-- Frontend uses a logged-in Supabase user (role = authenticated).
-- ⚠️ Run this LAST — only after an ops user exists and login works.

ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE centres         ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporates      ENABLE ROW LEVEL SECURITY;

-- Authenticated ops staff: read everything; update items (manual report upload).
CREATE POLICY auth_read   ON orders          FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read   ON order_items     FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_update ON order_items     FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_read   ON order_events    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read   ON catalogue_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read   ON centres         FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read   ON corporates      FOR SELECT TO authenticated USING (true);

-- Lock the anon (publishable) key out of all data — tables and views.
REVOKE ALL ON orders, order_items, order_events, catalogue_tests, centres, corporates FROM anon;
REVOKE ALL ON order_items_view, patients FROM anon;
GRANT SELECT ON order_items_view, patients TO authenticated;
