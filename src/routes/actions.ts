import { Hono } from "hono";
import {
  billComplete, billPayment, billCancel, billTestCancel, addTestToBill,
  appointmentConfirm, appointmentReschedule, appointmentDismiss, sampleCollect,
} from "../adapters/crelio/actions";
import type { CentreId } from "../adapters/crelio/types";
import { supabase } from "../lib/supabase";
import { authPatient } from "../lib/portalAuth";
import { reportDelivery } from "../lib/reportDelivery";

const route = new Hono();
const CENTRES: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

// Wrap each handler with centre validation + uniform error handling.
function action<T>(fn: (centre: CentreId, body: any) => Promise<T>) {
  return async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const centre = String(body.centre ?? "").toUpperCase() as CentreId;
    if (!CENTRES.includes(centre)) {
      return c.json({ error: `centre must be one of ${CENTRES.join(", ")}` }, 400);
    }
    try {
      const result = await fn(centre, body);
      return c.json({ ok: true, result });
    } catch (err: any) {
      console.error("action error:", err);
      return c.json({ error: err?.message ?? "action failed" }, 500);
    }
  };
}

// Bill ops — all require billId
route.post("/bill/complete",    action((centre, b) => billComplete(centre, String(b.billId))));
route.post("/bill/payment",     action((centre, b) => billPayment(centre, String(b.billId), b.payments ?? [])));
route.post("/bill/cancel",      action((centre, b) => billCancel(centre, String(b.billId))));
route.post("/bill/test-cancel", action((centre, b) => billTestCancel(centre, String(b.billId), b.tests ?? [])));
route.post("/bill/add-test",    action((centre, b) => addTestToBill(centre, String(b.billId), b.tests ?? [])));

// Appointment ops
route.post("/appointment/confirm",    action((centre, b) => appointmentConfirm(centre, String(b.appointmentId), b.billId ?? "")));
route.post("/appointment/reschedule", action((centre, b) => appointmentReschedule(centre, String(b.appointmentId), String(b.appointmentDate), b.billId ?? "")));
route.post("/appointment/dismiss",    action((centre, b) => appointmentDismiss(centre, String(b.appointmentId))));

// Sample
route.post("/sample/collect", action((centre, b) => sampleCollect(centre, String(b.billId), b.testIds ?? [])));

// ── Radiology report delivery (RIS, internal) ────────────────────────────────
// POST /actions/report/send { orderItemId } — staff only. Notifies the patient
// (Fyno seam), moves the item to report_sent, and logs a report_sent event.
// Requires the item to already be 'completed' (which itself required a report).
route.post("/report/send", async (c) => {
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth?.isStaff) return c.json({ error: "unauthorized" }, 401);

  const { orderItemId } = await c.req.json().catch(() => ({}));
  if (!orderItemId) return c.json({ error: "orderItemId is required" }, 400);

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, status, report_url, test_name, orders!inner(patient_name, patient_mobile)")
    .eq("id", orderItemId)
    .maybeSingle();

  if (!item) return c.json({ error: "not found" }, 404);
  if (item.status !== "completed") {
    return c.json({ error: "item must be completed before sending" }, 409);
  }

  const order = item.orders as unknown as { patient_name: string | null; patient_mobile: string | null };
  try {
    await reportDelivery.sendReport(
      { mobile: order.patient_mobile, name: order.patient_name },
      { testName: (item.test_name as string) ?? "your report", reportUrl: item.report_url as string | null },
    );
  } catch (err: any) {
    console.error("report delivery failed:", err?.message ?? err);
    return c.json({ error: "delivery failed" }, 502);
  }

  await supabase.from("order_items").update({ status: "report_sent" }).eq("id", orderItemId);
  await supabase.from("order_events").insert({
    order_id: item.order_id,
    order_item_id: orderItemId,
    event_type: "report_sent",
    source: "ops",
  });

  return c.json({ ok: true });
});

export default route;
