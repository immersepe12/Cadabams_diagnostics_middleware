import { Hono } from "hono";
import {
  billComplete, billPayment, billCancel, billTestCancel, addTestToBill,
  appointmentConfirm, appointmentReschedule, appointmentDismiss, sampleCollect,
} from "../adapters/crelio/actions";
import type { CentreId } from "../adapters/crelio/types";

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

export default route;
