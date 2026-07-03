import { Hono } from "hono";
import { syncBillById } from "../adapters/crelio/bills";
import { supabase } from "../lib/supabase";
import type { CentreId } from "../adapters/crelio/types";
import { requireStaff } from "../lib/requireStaff";

const route = new Hono();

// /sync/bill is ops-only; /sync/reconcile keeps its shared-secret guard (cron).
route.use("/bill", requireStaff);

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

// POST /sync/reconcile  { limit?: number }
// Heals any orders still missing a patient name by pulling getOrderStatus.
// Batch-limited so one call stays within the function timeout; returns how many
// remain so it can be called again. (The webhook self-heals new bills inline;
// this catches stragglers / enrichment failures.)
route.post("/reconcile", async (c) => {
  // Only the scheduled job (with the shared secret) may trigger reconciliation.
  const secret = process.env.RECONCILE_SECRET;
  if (secret && c.req.header("x-reconcile-key") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as { limit?: number };
  const n = Math.min(Math.max(Number(body.limit) || 8, 1), 15);

  const { data } = await supabase
    .from("orders")
    .select("crelio_bill_id, centre_id")
    .is("patient_name", null)
    .not("crelio_bill_id", "is", null)
    .limit(n);

  let healed = 0;
  for (const o of data ?? []) {
    try {
      await syncBillById(o.centre_id as CentreId, String(o.crelio_bill_id));
      healed++;
    } catch (err: any) {
      console.error("reconcile heal failed:", err?.message ?? err);
    }
  }

  const { count: remaining } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .is("patient_name", null)
    .not("crelio_bill_id", "is", null);

  return c.json({ ok: true, processed: data?.length ?? 0, healed, remaining: remaining ?? 0 });
});

// POST /sync/bill   Body: { billId: "17758", centre: "KYL" }
// On-demand refresh of one bill via Crelio's getOrderStatusAPI (the only
// transactional read Crelio exposes). Used by the bill page's "Refresh from
// Crelio" button. Webhooks are what discover bills in the first place.
route.post("/bill", async (c) => {
  const { billId, centre } = await c.req.json<{ billId?: string; centre?: string }>();

  const id = str(billId);
  const centreId = str(centre).toUpperCase() as CentreId;
  const valid: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

  if (!id) return c.json({ error: "billId is required" }, 400);
  if (!valid.includes(centreId)) {
    return c.json({ error: `centre must be one of ${valid.join(", ")}` }, 400);
  }

  try {
    const result = await syncBillById(centreId, id);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("sync/bill error:", err);
    return c.json({ error: err?.message ?? "sync failed" }, 500);
  }
});

export default route;
