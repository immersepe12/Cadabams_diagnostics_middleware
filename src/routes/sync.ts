import { Hono } from "hono";
import { syncBillsForCentre, syncBillsAllCentres } from "../adapters/crelio/bills";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();

// POST /sync/bills
// Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", centre?: "KYL"|"JNR"|"KKP"|"BSK" }
// Pulls all existing bills from Crelio for the date range and upserts them into Supabase.
// Safe to re-run — all writes are upserts keyed on crelio_bill_id / (order_id, crelio_test_id).
route.post("/bills", async (c) => {
  const body = await c.req.json<{ startDate?: string; endDate?: string; centre?: string }>();

  const startDate = body.startDate;
  const endDate   = body.endDate ?? new Date().toISOString().slice(0, 10);

  if (!startDate) {
    return c.json({ error: "startDate is required (YYYY-MM-DD)" }, 400);
  }

  const validCentres: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];
  const centreParam = body.centre?.toUpperCase();

  try {
    if (centreParam) {
      if (!validCentres.includes(centreParam as CentreId)) {
        return c.json({ error: `centre must be one of ${validCentres.join(", ")}` }, 400);
      }
      const result = await syncBillsForCentre(centreParam as CentreId, startDate, endDate);
      return c.json({ ok: true, centre: centreParam, ...result });
    }

    const results = await syncBillsAllCentres(startDate, endDate);
    return c.json({ ok: true, results });
  } catch (err: any) {
    console.error("sync/bills error:", err);
    return c.json({ error: err?.message ?? "sync failed" }, 500);
  }
});

export default route;
