import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { smsSender } from "../lib/fyno";

// Supabase "Send SMS" auth hook. When a patient requests a phone OTP, Supabase
// POSTs { user: { phone }, sms: { otp } } here, signed with the Standard Webhooks
// scheme. We verify the signature, then deliver the OTP via Fyno.
//
// Configure in Supabase dashboard → Auth → Hooks → Send SMS:
//   URL    = https://<deployment>/auth/sms-hook
//   secret = stored in env as SEND_SMS_HOOK_SECRET (the "v1,whsec_…" value)

const route = new Hono();

// Standard Webhooks: HMAC-SHA256 over `${id}.${timestamp}.${body}`, key is the
// base64 payload of the "whsec_" secret. The webhook-signature header is a
// space-separated list of `v1,<base64sig>` — accept if any entry matches.
function verify(secret: string, id: string, ts: string, body: string, header: string): boolean {
  if (!id || !ts || !header) return false;
  const key = Buffer.from(secret.replace(/^(v1,)?whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return header.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    const given = Buffer.from(sig ?? "", "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

route.post("/sms-hook", async (c) => {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error("sms-hook: SEND_SMS_HOOK_SECRET not set");
    return c.json({ error: "not configured" }, 500);
  }

  const raw = await c.req.text(); // verify against the RAW body
  const ok = verify(
    secret,
    c.req.header("webhook-id") ?? "",
    c.req.header("webhook-timestamp") ?? "",
    raw,
    c.req.header("webhook-signature") ?? "",
  );
  if (!ok) return c.json({ error: "invalid signature" }, 401);

  const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return c.json({ error: "bad payload" }, 400);

  try {
    await smsSender.sendOtp(phone, otp);
  } catch (err) {
    // Non-200 so Supabase reports the failure to the client rather than
    // pretending the code was sent.
    console.error("sms-hook delivery failed:", (err as Error)?.message ?? err);
    return c.json({ error: "delivery failed" }, 500);
  }
  // Supabase's Send SMS hook validates the response Content-Type — must be JSON,
  // not an empty body. An empty object signals success.
  return c.json({});
});

export default route;
