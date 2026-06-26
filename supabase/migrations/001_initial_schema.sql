-- ============================================================
-- Cadabams Core — Phase 0 Schema
-- Run this in Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── 1. CENTRES ──────────────────────────────────────────────
-- The 4 physical labs. Seeded below — rarely changes.
CREATE TABLE centres (
  id           TEXT PRIMARY KEY,            -- 'KYL' | 'JNR' | 'KKP' | 'BSK'
  lab_id       INTEGER NOT NULL UNIQUE,     -- Crelio labId (= orgId)
  lab_name     TEXT    NOT NULL,            -- Crelio's name for the lab
  display_name TEXT    NOT NULL,            -- Human-friendly name
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO centres (id, lab_id, lab_name, display_name) VALUES
  ('KYL', 9488,  'Cadabams Diagnostics',            'Kalyan Nagar'),
  ('JNR', 11541, 'Cadabams Diagnostics Jayanagar',  'Jayanagar'),
  ('KKP', 11807, 'Cadabams Diagnostics Kanakapura', 'Kanakapura'),
  ('BSK', 12143, 'Cadabams Radmatics',              'Banashankari');

-- ── 2. CORPORATES ───────────────────────────────────────────
-- Corporate clients who book tests for their employees.
CREATE TABLE corporates (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT    NOT NULL UNIQUE,   -- short code used in bookings
  name            TEXT    NOT NULL,
  crelio_org_id   INTEGER,                   -- organizationIdLH in Crelio
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. ORDERS ───────────────────────────────────────────────
-- One order = one patient visit / one bill in Crelio.
CREATE TABLE orders (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT    NOT NULL UNIQUE,   -- our key, sent to Crelio as orderNumber
  centre_id       TEXT    NOT NULL REFERENCES centres(id),
  corporate_id    UUID    REFERENCES corporates(id),  -- NULL for walk-in / D2C
  channel         TEXT    NOT NULL CHECK (channel IN ('corporate', 'd2c', 'walkin')),

  -- Patient details (minimal for Phase 0)
  patient_name    TEXT,
  patient_mobile  TEXT,
  patient_age     INTEGER,
  patient_gender  TEXT    CHECK (patient_gender IN ('M', 'F', 'O')),

  -- Crelio correlation keys (filled after booking API responds)
  crelio_bill_id      TEXT,
  crelio_patient_id   TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. ORDER ITEMS ──────────────────────────────────────────
-- One row per test within an order.
CREATE TABLE order_items (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Test identification
  unified_code  TEXT    NOT NULL,   -- our cross-centre test key
  test_name     TEXT    NOT NULL,
  crelio_test_id TEXT,              -- per-centre Crelio test ID

  -- Current status (projection — updated when events arrive)
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN (
    'booked', 'collected', 'accessioned',
    'report_generated', 'report_sent',
    'cancelled', 'rejected'
  )),

  -- Report
  report_url    TEXT,               -- hosted URL from Crelio smart_report_links
  is_amended    BOOLEAN NOT NULL DEFAULT false,

  -- Key timestamps
  collected_at    TIMESTAMPTZ,
  accessioned_at  TIMESTAMPTZ,
  reported_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. ORDER EVENTS ─────────────────────────────────────────
-- Append-only log. Every status change is an event.
-- Current status on order_items is a projection of this log.
CREATE TABLE order_events (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID    NOT NULL REFERENCES orders(id),
  order_item_id    UUID    REFERENCES order_items(id),  -- NULL for order-level events

  event_type TEXT NOT NULL,   -- 'bill_generated' | 'sample_collected' | 'sample_accessioned'
                               -- | 'report_submitted' | 'report_sent' | 'cancelled' | 'rejected'
  source     TEXT NOT NULL DEFAULT 'crelio' CHECK (source IN ('crelio', 'ops', 'system')),
  payload    JSONB,            -- raw webhook payload for traceability

  -- Prevents the same Crelio webhook being processed twice
  idempotency_key TEXT UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. CATALOGUE TESTS ──────────────────────────────────────
-- Tests synced from Crelio per centre (~100 per campus).
CREATE TABLE catalogue_tests (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id       TEXT    NOT NULL REFERENCES centres(id),
  crelio_test_id  TEXT    NOT NULL,
  test_name       TEXT    NOT NULL,
  unified_code    TEXT,           -- cross-centre key (NULL if centre-specific)
  department      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(centre_id, crelio_test_id)
);

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_orders_centre       ON orders(centre_id);
CREATE INDEX idx_orders_corporate    ON orders(corporate_id);
CREATE INDEX idx_orders_created      ON orders(created_at DESC);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_status  ON order_items(status);
CREATE INDEX idx_order_events_order  ON order_events(order_id);
CREATE INDEX idx_catalogue_centre    ON catalogue_tests(centre_id);

-- ── AUTO-UPDATE updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
