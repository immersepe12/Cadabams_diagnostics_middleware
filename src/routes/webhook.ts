import { Hono } from "hono";
import { processWebhook } from "../adapters/crelio/webhook";
import type { CrelioWebhookPayload } from "../adapters/crelio/types";

const route = new Hono();

// POST /webhook/crelio
// Crelio calls this for every status change. Must return 200 fast.
route.post("/crelio", async (c) => {
  // Return 200 immediately — Crelio will retry on anything else
  c.executionCtx?.waitUntil?.(handleAsync(c));

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

  // Process async — don't await, already returned 200
  processWebhook(payload)
    .then((result) => {
      if (result.skipped) console.log(`Webhook skipped: ${result.skipped}`);
    })
    .catch((err) => console.error("Webhook processing error:", err));

  return c.json({ ok: true });
});

async function handleAsync(_c: unknown) {} // waitUntil stub for edge runtimes

export default route;
