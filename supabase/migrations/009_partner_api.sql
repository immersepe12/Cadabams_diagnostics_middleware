-- Partner / corporate API: per-partner keys scoped to a Crelio organization.

-- Orders carry the Crelio org id so partner reads can be scoped to their data.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS crelio_org_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_crelio_org ON orders(crelio_org_id);

-- API keys. We store only a SHA-256 hash of the key; the plaintext is shown
-- once at mint time. Each key is scoped to one organization.
CREATE TABLE IF NOT EXISTS partner_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  crelio_org_id INTEGER NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

-- Secret table: only the backend (service role, bypasses RLS) may read it.
ALTER TABLE partner_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_keys FROM anon, authenticated;

-- Mint a key (run once per partner; choose a strong value):
--   INSERT INTO partner_keys (name, crelio_org_id, key_hash)
--   VALUES ('Visit Health', 482221, encode(digest('cdx_live_REPLACE_ME','sha256'),'hex'));
-- (requires: CREATE EXTENSION IF NOT EXISTS pgcrypto;)
