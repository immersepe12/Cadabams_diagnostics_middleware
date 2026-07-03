-- ============================================================
-- Corporate RBAC. Adds an 'admin' role tier (user management) and a
-- 'corporate' role whose reads are scoped to their organisation's orders.
--
-- Roles (auth.users.app_metadata.role): admin > staff > corporate; patients
-- keep a phone claim and no role. A corporate spans MULTIPLE Crelio org ids
-- (one+ per centre — each centre is a separate Crelio account), so the
-- mapping is corporates → corporate_orgs (one-to-many).
--
-- ⚠️ Run BEFORE deploying the corporate code; is_staff() gaining 'admin' is
--    harmless while no admin users exist.
-- ============================================================

BEGIN;

-- ── Role helpers ─────────────────────────────────────────────────────────────
-- Staff checks now include admin (admin ⊃ staff).
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('staff', 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

CREATE OR REPLACE FUNCTION public.is_corporate() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'corporate'
$$;

-- ── Corporate identity tables ────────────────────────────────────────────────
-- email/display_name are denormalised so the admin UI can list users via
-- PostgREST without touching the auth admin API.
CREATE TABLE IF NOT EXISTS corporate_users (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  corporate_id UUID NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_users_corp ON corporate_users(corporate_id);

CREATE TABLE IF NOT EXISTS corporate_orgs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_id  UUID NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  centre_id     TEXT NOT NULL REFERENCES centres(id),
  crelio_org_id INTEGER NOT NULL,
  org_label     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(centre_id, crelio_org_id)
);
CREATE INDEX IF NOT EXISTS idx_corporate_orgs_corp ON corporate_orgs(corporate_id);

-- ── Org resolution helpers ───────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can resolve membership regardless of the
-- caller's own row access; DB lookup (not JWT) so org edits apply immediately.
CREATE OR REPLACE FUNCTION public.user_corporate_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(corporate_id), '{}')
  FROM corporate_users WHERE user_id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.user_corporate_org_ids() RETURNS integer[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(o.crelio_org_id), '{}')
  FROM corporate_orgs o
  JOIN corporate_users u ON u.corporate_id = o.corporate_id
  WHERE u.user_id = auth.uid() AND u.is_active
$$;

-- ── RLS on the new tables ────────────────────────────────────────────────────
ALTER TABLE corporate_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_orgs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_read ON corporate_users FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY self_read  ON corporate_users FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON corporate_users TO authenticated;
REVOKE ALL ON corporate_users FROM anon;

CREATE POLICY staff_read     ON corporate_orgs FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY corporate_read ON corporate_orgs FOR SELECT TO authenticated
  USING (corporate_id = ANY(public.user_corporate_ids()));
GRANT SELECT ON corporate_orgs TO authenticated;
REVOKE ALL ON corporate_orgs FROM anon;

-- corporates: staff_read exists (010); let corporate users read their own row.
CREATE POLICY corporate_read ON corporates FOR SELECT TO authenticated
  USING (id = ANY(public.user_corporate_ids()));
GRANT SELECT ON corporates TO authenticated;

-- ── Business data: org-scoped corporate reads (additive; OR'd with existing
--    staff_read / patient_read policies) ────────────────────────────────────
CREATE POLICY corporate_read ON orders FOR SELECT TO authenticated
  USING (public.is_corporate() AND crelio_org_id = ANY(public.user_corporate_org_ids()));

CREATE POLICY corporate_read ON order_items FOR SELECT TO authenticated
  USING (public.is_corporate() AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.crelio_org_id = ANY(public.user_corporate_org_ids())
  ));

CREATE POLICY corporate_read ON reports FOR SELECT TO authenticated
  USING (public.is_corporate() AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = reports.order_id
      AND o.crelio_org_id = ANY(public.user_corporate_org_ids())
  ));

-- Booking form needs the catalogue (test names; Crelio applies contract rates
-- at billing) and centre names. order_events stays staff-only.
CREATE POLICY corporate_read ON catalogue_tests FOR SELECT TO authenticated USING (public.is_corporate());
CREATE POLICY corporate_read ON centres         FOR SELECT TO authenticated USING (public.is_corporate());

COMMIT;
