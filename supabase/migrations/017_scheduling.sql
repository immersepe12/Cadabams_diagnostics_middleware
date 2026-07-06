-- Scheduling: capture appointment windows and home-collection details for
-- bookings made THROUGH this platform (ops booking form + corporate portal).
-- Crelio's webhooks carry no appointment/home-collection info and it has no
-- list API, so these are the only source. RLS on orders already scopes reads
-- (staff all, corporate own-org, patient own) — these columns ride along.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS booking_mode            TEXT,          -- 'appointment' | 'home' | 'walkin'
  ADD COLUMN IF NOT EXISTS appointment_start       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_end         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS home_collection_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS home_collection_address TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_appointment_start
  ON orders(appointment_start) WHERE appointment_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_home_collection_at
  ON orders(home_collection_at) WHERE home_collection_at IS NOT NULL;
