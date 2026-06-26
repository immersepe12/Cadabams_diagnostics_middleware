import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import webhookRoute   from "./routes/webhook";
import bookingsRoute  from "./routes/bookings";
import catalogueRoute from "./routes/catalogue";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok", service: "cadabams-api" }));

app.route("/webhook",   webhookRoute);
app.route("/bookings",  bookingsRoute);
app.route("/catalogue", catalogueRoute);

export default app;
