import { Hono } from "hono";
import { createHash } from "node:crypto";
import { supabase } from "../lib/supabase";

// Partner / corporate public API (v1). Per-partner API key (x-api-key or
// Bearer) → scoped to one Crelio organization. Read-only for now: orders,
// order detail, and reports (with short-lived signed URLs).

const route = new Hono<{ Variables: { orgId: number } }>();

// ── Auth: resolve the API key to a partner org ───────────────────────────────
route.use("*", async (c, next) => {
  const raw = c.req.header("x-api-key") ?? (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = raw.trim();
  if (!key) return c.json({ error: "missing API key" }, 401);

  const hash = createHash("sha256").update(key).digest("hex");
  const { data: pk } = await supabase
    .from("partner_keys")
    .select("id, crelio_org_id, is_active")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!pk || !pk.is_active) return c.json({ error: "invalid API key" }, 401);

  c.set("orgId", pk.crelio_org_id);
  // best-effort usage stamp (don't await)
  void supabase.from("partner_keys").update({ last_used_at: new Date().toISOString() }).eq("id", pk.id);
  await next();
});

async function signRef(ref: string | null): Promise<string | null> {
  if (!ref || /^https?:\/\//.test(ref)) return ref ?? null;
  const { data } = await supabase.storage.from("reports").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}

// GET /v1/orders?limit&offset
route.get("/orders", async (c) => {
  const orgId = c.get("orgId");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const offset = Number(c.req.query("offset")) || 0;

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, crelio_bill_id, patient_name, patient_mobile, channel, centre_id, created_at, order_items(crelio_test_id, test_name, status, reported_at)")
    .eq("crelio_org_id", orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ orders: data ?? [], limit, offset });
});

// GET /v1/orders/:id
route.get("/orders/:id", async (c) => {
  const orgId = c.get("orgId");
  const { data } = await supabase
    .from("orders")
    .select("id, order_number, crelio_bill_id, crelio_org_id, patient_name, patient_mobile, patient_age, patient_gender, channel, centre_id, created_at, order_items(crelio_test_id, test_name, status, collected_at, accessioned_at, reported_at)")
    .eq("id", c.req.param("id"))
    .maybeSingle();

  if (!data || data.crelio_org_id !== orgId) return c.json({ error: "not found" }, 404);
  const { crelio_org_id, ...order } = data;
  return c.json({ order });
});

// GET /v1/orders/:id/reports — report metadata + signed PDF links
route.get("/orders/:id/reports", async (c) => {
  const orgId = c.get("orgId");
  const id = c.req.param("id");

  const { data: order } = await supabase.from("orders").select("crelio_org_id").eq("id", id).maybeSingle();
  if (!order || order.crelio_org_id !== orgId) return c.json({ error: "not found" }, 404);

  const { data: reports } = await supabase
    .from("reports")
    .select("id, crelio_test_id, test_name, report_url, structured_values, signing_doctor, reported_at, is_amended, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  const out = await Promise.all(
    (reports ?? []).map(async (r) => ({ ...r, report_url: await signRef(r.report_url as string | null) })),
  );
  return c.json({ reports: out });
});

export default route;
