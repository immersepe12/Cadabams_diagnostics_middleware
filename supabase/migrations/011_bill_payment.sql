-- Bill payment capture. Crelio's getOrderStatusAPI returns only report data, but
-- the webhook Bill Generation payload carries the full billing picture
-- (billTotalAmount, totalBillPaidAmount, dueAmount, payment_mode, billConcession,
-- billReferral, vat_amount, …). We already store those payloads raw in
-- order_events; these columns let the webhook project payment onto the order so
-- the bill page can show it. Capture is new-events-only (no historical backfill).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_total_amount NUMERIC,   -- billTotalAmount
  ADD COLUMN IF NOT EXISTS paid_amount       NUMERIC,   -- totalBillPaidAmount
  ADD COLUMN IF NOT EXISTS due_amount        NUMERIC,   -- dueAmount
  ADD COLUMN IF NOT EXISTS advance_amount    NUMERIC,   -- billAdvance
  ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC,   -- billConcession
  ADD COLUMN IF NOT EXISTS tax_amount        NUMERIC,   -- vat_amount
  ADD COLUMN IF NOT EXISTS payment_mode      TEXT,      -- payment_mode / billPaymentMode
  ADD COLUMN IF NOT EXISTS payment_status    TEXT,      -- billPaymentStatus
  ADD COLUMN IF NOT EXISTS is_bill_due       BOOLEAN,   -- isBillDue
  ADD COLUMN IF NOT EXISTS referral_name     TEXT,      -- billReferral / ReferralName
  ADD COLUMN IF NOT EXISTS currency          TEXT,      -- currency (e.g. ₹)
  ADD COLUMN IF NOT EXISTS payment_note       TEXT;      -- billComments (e.g. UPI ref)

-- RLS: orders already has staff_read (all) + patient_read (own) from migration
-- 010; these columns inherit it — no policy change needed.
