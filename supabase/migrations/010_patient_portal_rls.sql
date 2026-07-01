-- ============================================================
-- Patient portal RLS.
-- Patients log in with Supabase phone OTP and so share the `authenticated`
-- role with ops staff. Migrations 006/007 grant that role read-EVERYTHING
-- (USING (true)) and even UPDATE on order_items — fine when only staff held
-- the role, a data-leak + write-escalation hole once patients do.
--
-- This migration splits every policy into:
--   • staff_read   — role = 'staff'  → unchanged ops access (read-all)
--   • patient_read — own data only, matched by mobile number
-- and re-gates the order_items UPDATE to staff. Patients get NO write policy.
--
-- ⚠️ Run AFTER scripts/mark-staff.ts has stamped app_metadata.role='staff' on
--    every existing ops user — otherwise staff become "patients with no phone"
--    and instantly lose all access.
-- ⚠️ Requires Postgres 15+ for security_invoker views (Supabase default). If on
--    PG14, see the note on the views block below.
-- ============================================================

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Staff are identified by app_metadata.role (service-role/admin-writable only —
-- never user_metadata, which the user can edit and must not be trusted in RLS).
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'staff'
$$;

-- orders.patient_mobile is stored as 10 digits (normalizeMobile drops 91/0);
-- the Supabase phone claim is E.164 (e.g. 919483506259). Bridge on last 10.
-- Returns '' for staff (no phone claim) → never matches a real patient_mobile.
CREATE OR REPLACE FUNCTION public.jwt_mobile10() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g'), 10)
$$;

-- ── Index so the patient predicate is sargable ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_patient_mobile10
  ON orders (patient_mobile)
  WHERE patient_mobile IS NOT NULL AND patient_mobile <> '';

-- ── ORDERS ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_read ON orders;
CREATE POLICY staff_read   ON orders FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY patient_read ON orders FOR SELECT TO authenticated
  USING (
    NOT public.is_staff()
    AND public.jwt_mobile10() <> ''
    AND patient_mobile = public.jwt_mobile10()
  );

-- ── ORDER_ITEMS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_read ON order_items;
CREATE POLICY staff_read   ON order_items FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY patient_read ON order_items FOR SELECT TO authenticated
  USING (
    NOT public.is_staff()
    AND public.jwt_mobile10() <> ''
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.patient_mobile = public.jwt_mobile10()
    )
  );

-- Re-gate the manual-upload UPDATE (006 had it as TO authenticated USING(true) —
-- a patient could otherwise UPDATE any lab result). Staff only; no patient write.
DROP POLICY IF EXISTS auth_update ON order_items;
CREATE POLICY staff_update ON order_items FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── REPORTS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_read ON reports;
CREATE POLICY staff_read   ON reports FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY patient_read ON reports FOR SELECT TO authenticated
  USING (
    NOT public.is_staff()
    AND public.jwt_mobile10() <> ''
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = reports.order_id
        AND o.patient_mobile = public.jwt_mobile10()
    )
  );

-- ── Staff-only tables (patients have no need; keep them out of the event log,
--    full catalogue, centre list, and corporate roster) ────────────────────────
DROP POLICY IF EXISTS auth_read ON order_events;
CREATE POLICY staff_read ON order_events FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS auth_read ON catalogue_tests;
CREATE POLICY staff_read ON catalogue_tests FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS auth_read ON centres;
CREATE POLICY staff_read ON centres FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS auth_read ON corporates;
CREATE POLICY staff_read ON corporates FOR SELECT TO authenticated USING (public.is_staff());

-- ── VIEWS: close the roster leak ─────────────────────────────────────────────
-- `patients` and `order_items_view` run with the view OWNER's privileges and so
-- bypass the base-table RLS above — a patient querying `patients` would see the
-- entire roster. security_invoker makes them honor the caller's RLS instead, so
-- a patient sees only their own aggregated row and staff still see all.
-- (PG14 fallback: drop these ALTERs and instead embed
--   WHERE public.is_staff() OR patient_mobile = public.jwt_mobile10()
--  into the view definitions.)
ALTER VIEW patients         SET (security_invoker = true);
ALTER VIEW order_items_view SET (security_invoker = true);

COMMIT;
