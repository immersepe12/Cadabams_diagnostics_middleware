import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { supabase } from "../lib/supabase";
import { authPatient } from "../lib/portalAuth";

// RIS integration: hand a CT/MRI scan off to the external radiology reporting
// tool (radiology-scribe-ai, a separate app + Supabase) and receive the finished
// report back. The two apps don't share auth — a short-lived signed handoff token
// (minted here for a staff user, echoed back on completion) authorizes the
// exchange and carries the order_item context so the scribe can prefill.

const route = new Hono();

const SECRET = process.env.RIS_HANDOFF_SECRET ?? "";
const SCRIBE_URL = (process.env.SCRIBE_URL ?? "https://radiologyscribe.cadabamsmindtalk.com").replace(/\/$/, "");

interface Handoff {
  oiid: string;   // order_item id
  oid: string;    // order id
  test: string;   // test/scan name
  centre: string;
  patient: { name: string | null; age: number | null; sex: string | null; ref: string | null };
  exp: number;    // unix seconds — verify() enforces
}

// POST /api/ris/handoff { orderItemId } — staff mints a link into the scribe tool.
route.post("/handoff", async (c) => {
  if (!SECRET) return c.json({ error: "RIS not configured" }, 500);
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth?.isStaff) return c.json({ error: "unauthorized" }, 401);

  const { orderItemId } = await c.req.json().catch(() => ({}));
  if (!orderItemId) return c.json({ error: "orderItemId is required" }, 400);

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, test_name, orders!inner(centre_id, patient_name, patient_age, patient_gender, referral_name)")
    .eq("id", orderItemId)
    .maybeSingle();
  if (!item) return c.json({ error: "not found" }, 404);

  const o = item.orders as unknown as {
    centre_id: string; patient_name: string | null; patient_age: number | null;
    patient_gender: string | null; referral_name: string | null;
  };

  // The scribe tool's patients.sex constraint expects the full word; our orders
  // store single-char M/F/O. Map it (unknown/empty → null).
  const sex = ({ M: "Male", F: "Female", O: "Other" } as Record<string, string>)[o.patient_gender ?? ""] ?? null;

  const payload: Handoff = {
    oiid: item.id as string,
    oid: item.order_id as string,
    test: (item.test_name as string) ?? "",
    centre: o.centre_id,
    patient: { name: o.patient_name, age: o.patient_age, sex, ref: o.referral_name },
    exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60, // 2h to write the report
  };
  const token = await sign(payload as unknown as Record<string, unknown>, SECRET);
  return c.json({ url: `${SCRIBE_URL}/intake?handoff=${encodeURIComponent(token)}` });
});

// POST /api/ris/report { token, pdfBase64, findings? } — scribe pushes the
// finished report back. Cross-origin from the scribe browser (wildcard CORS in
// app.ts). Attaches the PDF + marks the item completed; delivery to the patient
// stays a manual "Send" in the worklist.
route.post("/report", async (c) => {
  if (!SECRET) return c.json({ error: "RIS not configured" }, 500);

  const { token, pdfBase64, findings } = await c.req.json().catch(() => ({} as any));
  if (!token || !pdfBase64) return c.json({ error: "token and pdfBase64 are required" }, 400);

  let h: Handoff;
  try {
    h = (await verify(token, SECRET, "HS256")) as unknown as Handoff; // throws on bad/expired
  } catch {
    return c.json({ error: "invalid or expired token" }, 401);
  }

  // Confirm the item still exists (the signed token vouches for ownership).
  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, crelio_test_id")
    .eq("id", h.oiid)
    .maybeSingle();
  if (!item) return c.json({ error: "not found" }, 404);

  // Upload the PDF (strip any data-URL prefix) into the private reports bucket.
  const b64 = String(pdfBase64).replace(/^data:.*;base64,/, "");
  const bytes = Buffer.from(b64, "base64");
  const path = `${h.oid}/${h.oiid}/scribe-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("reports")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) {
    console.error("ris report upload failed:", upErr.message);
    return c.json({ error: "upload failed" }, 502);
  }

  await supabase.from("order_items").update({ report_url: path }).eq("id", h.oiid);

  await supabase.from("reports").insert({
    order_id: h.oid,
    order_item_id: h.oiid,
    crelio_test_id: item.crelio_test_id,
    test_name: h.test || null,
    report_url: path,
    pdf_blob_ref: path,
    structured_values: findings ?? null,
    signing_doctor: (findings as { doctor_name?: string } | null)?.doctor_name ?? null,
    reported_at: new Date().toISOString(),
    source: "ris-scribe",
  });

  // report_url is now set, so the completion trigger passes.
  await supabase.from("order_items").update({ status: "completed" }).eq("id", h.oiid);
  await supabase.from("order_events").insert({
    order_id: h.oid, order_item_id: h.oiid, event_type: "report_generated", source: "system",
  });

  return c.json({ ok: true });
});

export default route;
