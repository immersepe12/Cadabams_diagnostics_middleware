import { Hono } from "hono";
import { createOrder } from "../adapters/crelio/booking";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();

// POST /bookings
// Called by ops console or corporate portal to create a new order.
route.post("/", async (c) => {
  const body = await c.req.json();

  const {
    centreId,
    channel,
    corporateId,
    crelioOrgId,
    patient,
    tests,
  } = body;

  if (!centreId || !channel || !patient || !tests?.length) {
    return c.json({ error: "centreId, channel, patient, and tests are required" }, 400);
  }

  const validCentres: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];
  if (!validCentres.includes(centreId)) {
    return c.json({ error: `invalid centreId, must be one of ${validCentres.join(", ")}` }, 400);
  }

  try {
    const result = await createOrder({
      centreId,
      channel,
      corporateId,
      crelioOrgId,
      patient,
      tests,
    });

    return c.json({ ok: true, ...result }, 201);
  } catch (err: any) {
    console.error("createOrder error:", err);
    return c.json({ error: err.message ?? "booking failed" }, 500);
  }
});

export default route;
