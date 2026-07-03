-- Organisation → sub-corporate hierarchy. In this Crelio setup the corporates
-- UNDER an organisation (e.g. NIVA BUPA / ADITYA BIRLA under the VISIT HEALTH
-- aggregator, or the referring hospital on a walk-in bill) are recorded as the
-- bill's REFERRAL ("Dr. C/O <corporate>"). We already capture billReferral →
-- orders.referral_name for new bills (migration 011); this backfills history
-- from the stored raw webhook payloads and adds an aggregate view for the
-- admin Organisations directory.

BEGIN;

-- ── Backfill referral_name for pre-011 bills from stored payloads ────────────
UPDATE orders o
SET referral_name = e.ref
FROM (
  SELECT DISTINCT ON (order_id)
    order_id,
    NULLIF(TRIM(payload->>'billReferral'), '') AS ref
  FROM order_events
  WHERE event_type = 'bill_generated'
    AND COALESCE(payload->>'billReferral', '') <> ''
  ORDER BY order_id, created_at DESC
) e
WHERE e.order_id = o.id
  AND COALESCE(o.referral_name, '') = '';

-- ── Referrals (sub-corporates) per organisation ──────────────────────────────
CREATE OR REPLACE VIEW org_referrals AS
SELECT
  crelio_org_id,
  referral_name,
  COUNT(*)::int   AS order_count,
  MAX(created_at) AS last_order_at
FROM orders
WHERE crelio_org_id IS NOT NULL
  AND COALESCE(referral_name, '') <> ''
GROUP BY crelio_org_id, referral_name;

ALTER VIEW org_referrals SET (security_invoker = true);
GRANT SELECT ON org_referrals TO authenticated;
REVOKE ALL ON org_referrals FROM anon;

COMMIT;
