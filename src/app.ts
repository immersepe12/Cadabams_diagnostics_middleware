import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import webhookRoute   from "./routes/webhook";
import bookingsRoute  from "./routes/bookings";
import catalogueRoute from "./routes/catalogue";
import syncRoute      from "./routes/sync";
import actionsRoute   from "./routes/actions";
import dataRoute      from "./routes/data";
import v1Route        from "./routes/v1";
import portalRoute    from "./routes/portal";
import authHookRoute  from "./routes/authHook";
import risRoute       from "./routes/ris";
import adminRoute     from "./routes/admin";
import corporateRoute from "./routes/corporate";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok", service: "cadabams-api" }));

app.route("/webhook",   webhookRoute);
app.route("/bookings",  bookingsRoute);
app.route("/catalogue", catalogueRoute);
app.route("/sync",      syncRoute);
app.route("/actions",   actionsRoute);
app.route("/data",      dataRoute);
app.route("/v1",        v1Route);
// Under /api/* so they don't collide with the SPA's /portal/* patient section.
app.route("/api/portal", portalRoute);
app.route("/api/auth",   authHookRoute);
app.route("/api/ris",    risRoute);
app.route("/api/admin",  adminRoute);
app.route("/api/corporate", corporateRoute);

export default app;
