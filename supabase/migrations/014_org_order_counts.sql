-- Per-organisation order activity for the admin Organisations directory: shows
-- which Crelio orgs are already active clients (bills flowing) even before a
-- corporate/portal login is set up. security_invoker → respects the caller's
-- orders RLS (staff/admin see all; a corporate user would only aggregate their
-- own orgs).
CREATE OR REPLACE VIEW org_order_counts AS
SELECT
  crelio_org_id,
  COUNT(*)::int      AS order_count,
  MAX(created_at)    AS last_order_at
FROM orders
WHERE crelio_org_id IS NOT NULL
GROUP BY crelio_org_id;

ALTER VIEW org_order_counts SET (security_invoker = true);
GRANT SELECT ON org_order_counts TO authenticated;
REVOKE ALL ON org_order_counts FROM anon;
