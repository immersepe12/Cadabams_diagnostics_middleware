-- Canonical report store. One row per report event (append-only → natural
-- version history; latest = most recent created_at). Captures the hosted PDF
-- URL, structured analyte values, signing doctor, and amendment flag.
CREATE TABLE IF NOT EXISTS reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id     UUID REFERENCES order_items(id) ON DELETE CASCADE,
  crelio_test_id    TEXT,
  test_name         TEXT,
  report_url        TEXT,            -- hosted PDF / smart report link
  pdf_blob_ref      TEXT,            -- object-storage ref when decoded from base64
  structured_values JSONB,           -- reportFormatAndValues (analytes + ranges)
  signing_doctor    TEXT,
  reported_at       TIMESTAMPTZ,
  is_amended        BOOLEAN NOT NULL DEFAULT false,
  source            TEXT NOT NULL DEFAULT 'crelio',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_order ON reports(order_id);
CREATE INDEX IF NOT EXISTS idx_reports_item  ON reports(order_item_id);

-- Same lockdown as the rest: authenticated reads, anon blocked, backend
-- (service role) writes by bypassing RLS.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read ON reports FOR SELECT TO authenticated USING (true);
GRANT SELECT ON reports TO authenticated;
REVOKE ALL ON reports FROM anon;
