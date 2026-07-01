-- Radiology worklists. Adds a terminal 'completed' status (radiologist has
-- uploaded + finalized the report; distinct from 'report_sent' = delivered to the
-- patient), a hard gate that nothing reaches 'completed' without a report on file,
-- and a `modality` classifier on order_items_view so the three worklists
-- (Ultrasound / CT+MRI / X-Ray) can filter.

BEGIN;

-- ── 'completed' status ───────────────────────────────────────────────────────
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_status_check CHECK (status IN (
  'booked', 'collected', 'accessioned', 'report_generated',
  'completed', 'report_sent', 'cancelled', 'rejected'
));

-- ── Hard gate: no 'completed' without an uploaded report ─────────────────────
-- Enforced at the DB so it holds regardless of the UI or who issues the UPDATE.
CREATE OR REPLACE FUNCTION require_report_for_completed() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.report_url IS NULL THEN
    RAISE EXCEPTION 'cannot mark order_item % completed: no report uploaded', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_require_report_for_completed ON order_items;
CREATE TRIGGER trg_require_report_for_completed
  BEFORE UPDATE ON order_items
  FOR EACH ROW WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION require_report_for_completed();

-- ── modality on order_items_view ─────────────────────────────────────────────
-- Recreate the view adding `modality` (us | ctmri | xray | NULL) alongside the
-- existing service_line. security_invoker must be re-set on CREATE OR REPLACE.
CREATE OR REPLACE VIEW order_items_view AS
SELECT
  oi.id, oi.order_id, oi.crelio_test_id, oi.test_name, oi.status,
  oi.report_url, oi.is_amended, oi.collected_at, oi.accessioned_at, oi.reported_at,
  oi.price, oi.created_at,
  o.centre_id, o.order_number, o.patient_name, o.patient_mobile,
  ct.department,
  CASE
    WHEN ct.department IN ('Radiology','Xray','MRI','CT','Ultrasound','Us Guided Procedures','BMD')
      OR oi.test_name ~* '^(MRI|MR |CT |CT-|X ?-? ?RAY|XR |US |USG|SONO|MAMMO|BMD|DOPPLER)'
    THEN 'radiology'
    ELSE 'pathology'
  END AS service_line,
  CASE
    WHEN ct.department IN ('Ultrasound','Us Guided Procedures')
      OR oi.test_name ~* '^(US |USG|SONO|DOPPLER)' THEN 'us'
    WHEN ct.department IN ('CT','MRI')
      OR oi.test_name ~* '^(MRI|MR |CT |CT-)' THEN 'ctmri'
    WHEN ct.department = 'Xray'
      OR oi.test_name ~* '^(X ?-? ?RAY|XR |MAMMO)' THEN 'xray'
    ELSE NULL
  END AS modality
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN catalogue_tests ct ON ct.centre_id = o.centre_id AND ct.crelio_test_id = oi.crelio_test_id;

ALTER VIEW order_items_view SET (security_invoker = true);
GRANT SELECT ON order_items_view TO authenticated;

-- ── Staff may insert reports (radiology worklist uploads a report row so the
--    scan shows in the patient portal). Reads stay split staff/patient (010);
--    the webhook keeps writing via service role (bypasses RLS). ───────────────
DROP POLICY IF EXISTS staff_insert ON reports;
CREATE POLICY staff_insert ON reports FOR INSERT TO authenticated WITH CHECK (public.is_staff());
GRANT INSERT ON reports TO authenticated;

COMMIT;
