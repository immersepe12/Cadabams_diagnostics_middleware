import { getRequestListener } from "@hono/node-server";
import app from "./app";

// Vercel's Node serverless launcher invokes the default export as (req, res).
// getRequestListener bridges Node's IncomingMessage/ServerResponse to Hono's
// web-standard fetch handler.
export default getRequestListener(app.fetch);
