-- Tests/packages actually ordered under each organisation (from bills — Crelio
-- exposes no per-org contracted rate list, so real ordering activity is the
-- best available view). Powers the "tests under this organisation" panel in
-- the admin Organisations directory.
CREATE OR REPLACE VIEW org_tests AS
SELECT
  o.crelio_org_id,
  oi.test_name,
  COUNT(*)::int      AS order_count,
  MAX(oi.created_at) AS last_ordered_at
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.crelio_org_id IS NOT NULL
  AND oi.status NOT IN ('cancelled', 'rejected')
GROUP BY o.crelio_org_id, oi.test_name;

ALTER VIEW org_tests SET (security_invoker = true);
GRANT SELECT ON org_tests TO authenticated;
REVOKE ALL ON org_tests FROM anon;
