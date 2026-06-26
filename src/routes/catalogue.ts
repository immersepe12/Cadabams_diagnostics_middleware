import { Hono } from "hono";
import { syncCatalogue, syncAllCentres } from "../adapters/crelio/catalogue";
import type { CentreId } from "../adapters/crelio/types";

const route = new Hono();

// POST /catalogue/sync          — sync all centres
// POST /catalogue/sync/:centre  — sync one centre
route.post("/sync", async (c) => {
  const results = await syncAllCentres();
  return c.json({ ok: true, results });
});

route.post("/sync/:centre", async (c) => {
  const centreId = c.req.param("centre").toUpperCase() as CentreId;
  const validCentres: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

  if (!validCentres.includes(centreId)) {
    return c.json({ error: `invalid centre, must be one of ${validCentres.join(", ")}` }, 400);
  }

  try {
    const { synced } = await syncCatalogue(centreId);
    return c.json({ ok: true, centreId, synced });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default route;
