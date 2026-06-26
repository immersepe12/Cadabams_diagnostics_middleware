import { Hono } from "hono";
import { processWebhook } from "../adapters/crelio/webhook";
import type { CrelioWebhookPayload } from "../adapters/crelio/types";

const route = new Hono();

// POST /webhook/crelio
// Crelio calls this for every status change.
//
// In a serverless function we process synchronously and only then respond:
// detached work after the response can be frozen/dropped when the lambda
// suspends. Processing is a few quick DB calls, and every event carries an
// idempotency_key, so Crelio's retry-on-non-200 is safe.
route.post("/crelio", async (c) => {
  const payload = await c.req.json<CrelioWebhookPayload>().catch(() => null);
  if (!payload) return c.json({ ok: true });

  // Validate webhook secret if configured
  const secret = process.env.CRELIO_WEBHOOK_SECRET;
  if (secret) {
    const apiKey = c.req.header("x-api-key") ?? payload.APIKEY;
    if (apiKey !== secret) {
      console.warn("Webhook: invalid APIKEY, rejecting");
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  try {
    const result = await processWebhook(payload);
    if (result.skipped) console.log(`Webhook skipped: ${result.skipped}`);
    return c.json({ ok: true });
  } catch (err) {
    // Return non-200 so Crelio retries; idempotency_key makes retries safe.
    console.error("Webhook processing error:", err);
    return c.json({ ok: false }, 500);
  }
});

export default route;
