import { Hono } from "hono";
import { createBooking, type BookingInput } from "../adapters/crelio/booking";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();
const CENTRES: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

// POST /bookings
// Create a bill in Crelio (optionally an appointment or home-collection booking)
// and mirror it. Body shape = BookingInput.
route.post("/", async (c) => {
  const body = await c.req.json<BookingInput>();

  if (!body.centreId || !body.channel || !body.patient?.name || !body.tests?.length || !body.payment) {
    return c.json({ error: "centreId, channel, patient.name, tests, and payment are required" }, 400);
  }
  if (!CENTRES.includes(body.centreId)) {
    return c.json({ error: `invalid centreId, must be one of ${CENTRES.join(", ")}` }, 400);
  }

  try {
    const result = await createBooking(body);
    return c.json({ ok: true, ...result }, 201);
  } catch (err: any) {
    console.error("createBooking error:", err);
    return c.json({ error: err.message ?? "booking failed" }, 500);
  }
});

export default route;
