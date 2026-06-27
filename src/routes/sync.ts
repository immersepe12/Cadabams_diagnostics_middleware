import { Hono } from "hono";
import { syncBillById } from "../adapters/crelio/bills";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

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
