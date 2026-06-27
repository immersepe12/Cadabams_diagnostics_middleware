import { Hono } from "hono";
import { listOrganizations } from "../adapters/crelio/datafetch";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();
const CENTRES: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

// GET /data/organizations/:centre — corporate orgs for the booking form picker
route.get("/organizations/:centre", async (c) => {
  const centre = c.req.param("centre").toUpperCase() as CentreId;
  if (!CENTRES.includes(centre)) {
    return c.json({ error: `centre must be one of ${CENTRES.join(", ")}` }, 400);
  }
  try {
    const organizations = await listOrganizations(centre);
    return c.json({ ok: true, organizations });
  } catch (err: any) {
    console.error("data/organizations error:", err);
    return c.json({ error: err?.message ?? "failed" }, 500);
  }
});

export default route;
