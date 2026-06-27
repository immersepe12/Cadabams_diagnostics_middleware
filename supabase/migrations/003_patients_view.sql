-- Patients are not a table — a patient is the set of orders sharing a phone
-- number across all centres. This view does the grouping in SQL so the dashboard
-- can paginate 25 at a time instead of fetching every order and grouping in JS.

CREATE OR REPLACE VIEW patients AS
SELECT
  patient_mobile AS mobile,
  (ARRAY_AGG(patient_name ORDER BY created_at DESC)
     FILTER (WHERE patient_name IS NOT NULL))[1] AS name,
  COUNT(*)::int      AS bill_count,
  MAX(created_at)    AS last_visit
FROM orders
WHERE patient_mobile IS NOT NULL AND patient_mobile <> ''
GROUP BY patient_mobile;

-- PostgREST serves the view to the dashboard's anon client.
GRANT SELECT ON patients TO anon, authenticated;
