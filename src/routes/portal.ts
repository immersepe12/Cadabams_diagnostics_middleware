import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import { authPatient } from "../lib/portalAuth";

// Patient portal API. Structured report data is read directly by the SPA via
// PostgREST + RLS (the patient JWT scopes it). This route covers the one thing
// RLS can't: minting a short-lived signed URL for a private report PDF, gated on
// the caller actually owning the report. Mirrors /v1's signRef + 404-not-403.

const route = new Hono();

// Bucket path → 1-hour signed URL. External http(s) report links pass through.
async function signRef(ref: string | null): Promise<string | null> {
  if (!ref || /^https?:\/\//.test(ref)) return ref ?? null;
  const { data } = await supabase.storage.from("reports").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}

// GET /portal/reports/:id/pdf-url — signed PDF link for a report the caller owns.
route.get("/reports/:id/pdf-url", async (c) => {
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth || auth.phone10.length !== 10) return c.json({ error: "not found" }, 404);

  // Ownership is computed server-side (service role) from reports → orders; the
  // client only supplies a report id and cannot influence the match.
  const { data: r } = await supabase
    .from("reports")
    .select("id, report_url, pdf_blob_ref, orders!inner(patient_mobile)")
    .eq("id", c.req.param("id"))
    .maybeSingle();

  const ownerMobile = (r as { orders?: { patient_mobile?: string } } | null)?.orders?.patient_mobile;
  // 404 (not 403) on mismatch — don't leak which report ids exist.
  if (!r || ownerMobile !== auth.phone10) return c.json({ error: "not found" }, 404);

  // Prefer the canonical private bucket object; fall back to an external link.
  const ref = (r.pdf_blob_ref as string | null) ?? (r.report_url as string | null);
  const url = await signRef(ref);
  if (!url) return c.json({ error: "no report file" }, 404);
  return c.json({ url });
});

export default route;
