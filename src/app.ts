import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import webhookRoute   from "./routes/webhook";
import bookingsRoute  from "./routes/bookings";
import catalogueRoute from "./routes/catalogue";
import syncRoute      from "./routes/sync";
import actionsRoute   from "./routes/actions";
import dataRoute      from "./routes/data";

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

export default app;
