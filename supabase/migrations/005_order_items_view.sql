-- Classifies every order item by service line (radiology/imaging vs pathology)
-- using Crelio's catalogue department, with a test-name fallback. Powers the
-- Radiology section. Patient/centre fields are flattened in for the list views.
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
  END AS service_line
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN catalogue_tests ct ON ct.centre_id = o.centre_id AND ct.crelio_test_id = oi.crelio_test_id;

GRANT SELECT ON order_items_view TO anon, authenticated;
