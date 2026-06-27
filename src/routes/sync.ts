import { Hono } from "hono";
import { syncPatientByPhone } from "../adapters/crelio/bills";

const route = new Hono();

// POST /sync/patient   Body: { phone: "9876543210" }
// On-demand pull: fetches this patient's bills from all four Crelio centres and
// upserts them into Supabase. Safe to re-run — every write is an upsert keyed on
// crelio_bill_id / (order_id, crelio_test_id). Called when ops looks up a phone
// or opens a patient page; webhooks keep mirrored patients fresh afterwards.
route.post("/patient", async (c) => {
  const { phone } = await c.req.json<{ phone?: string }>();

  const clean = (phone ?? "").replace(/\D/g, "");
  if (clean.length < 10) {
    return c.json({ error: "phone is required (at least 10 digits)" }, 400);
  }

  try {
    const result = await syncPatientByPhone(clean);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("sync/patient error:", err);
    return c.json({ error: err?.message ?? "sync failed" }, 500);
  }
});

export default route;
