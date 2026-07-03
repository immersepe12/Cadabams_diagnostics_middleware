import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import { authPatient, type AuthedUser } from "../lib/portalAuth";
import { createBooking, type BookingInput } from "../adapters/crelio/booking";
import type { CentreId } from "../adapters/crelio/types";

// Corporate portal backend. Reads happen client-side via PostgREST + RLS; these
// endpoints cover what RLS can't: booking (channel/org/credit are FORCED
// server-side from the caller's corporate mapping — a corporate user can never
// book outside their organisation) and signed report-PDF URLs (org-gated).

type Vars = { auth: AuthedUser; corporateId: string };
const route = new Hono<{ Variables: Vars }>();

route.use("*", async (c, next) => {
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth?.isCorporate) return c.json({ error: "unauthorized" }, 401);

  const { data: cu } = await supabase
    .from("corporate_users")
    .select("corporate_id, is_active")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!cu?.is_active) return c.json({ error: "unauthorized" }, 401);

  c.set("auth", auth);
  c.set("corporateId", cu.corporate_id as string);
  await next();
});

async function orgsFor(corporateId: string) {
  const { data } = await supabase
    .from("corporate_orgs")
    .select("centre_id, crelio_org_id, org_label")
    .eq("corporate_id", corporateId);
  return data ?? [];
}

// POST /api/corporate/bookings — book an appointment/home-collection for an
// employee. Client supplies patient/tests/centre/schedule; the server forces
// channel=corporate, the org (must be one of the caller's), Credit billing,
// and fills contract-invisible prices from the catalogue for the Crelio total.
route.post("/bookings", async (c) => {
  const corporateId = c.get("corporateId");
  const body = await c.req.json().catch(() => ({} as any));
  const { centreId, patient, tests, appointment, homeCollection, comments, crelioOrgId } = body;

  if (!centreId || !patient?.name || !patient?.age || !patient?.gender || !Array.isArray(tests) || !tests.length) {
    return c.json({ error: "centreId, patient (name, age, gender) and tests are required" }, 400);
  }

  const orgs = (await orgsFor(corporateId)).filter((o) => o.centre_id === centreId);
  if (!orgs.length) return c.json({ error: "your organisation is not enabled for this centre" }, 403);
  // A corporate can have multiple Crelio orgs at one centre (e.g. DIRECT vs
  // CORPORATE billing) — the client may pick among THEIR OWN orgs only.
  const chosen = orgs.find((o) => o.crelio_org_id === Number(crelioOrgId)) ?? (orgs.length === 1 ? orgs[0] : null);
  if (!chosen) return c.json({ error: "pick an organisation for this centre", options: orgs }, 400);

  // Fill prices from the catalogue (service role) — the corporate UI hides
  // retail prices; Crelio applies the org's contract rates at billing.
  const ids = (tests as Array<{ crelioTestId: string }>).map((t) => String(t.crelioTestId));
  const { data: cat } = await supabase
    .from("catalogue_tests")
    .select("crelio_test_id, test_name, price")
    .eq("centre_id", centreId)
    .in("crelio_test_id", ids);
  const catMap = new Map((cat ?? []).map((t) => [String(t.crelio_test_id), t]));
  const lineItems = ids.map((id) => {
    const t = catMap.get(id);
    return { crelioTestId: id, testName: (t?.test_name as string) ?? id, price: Number(t?.price ?? 0) || 0 };
  });
  const total = lineItems.reduce((s, li) => s + li.price, 0);

  const input: BookingInput = {
    centreId: centreId as CentreId,
    channel: "corporate",
    corporateId,
    organizationIdLH: chosen.crelio_org_id as number,
    patient: {
      name: String(patient.name),
      mobile: patient.mobile ? String(patient.mobile) : undefined,
      age: Number(patient.age),
      gender: patient.gender,
      email: patient.email ? String(patient.email) : undefined,
    },
    tests: lineItems,
    payment: { totalAmount: total, paymentType: "Credit" },
    comments: comments ? String(comments) : undefined,
    ...(appointment?.startDate && appointment?.endDate
      ? { appointment: { startDate: String(appointment.startDate), endDate: String(appointment.endDate) } }
      : {}),
    ...(homeCollection?.dateTime && homeCollection?.address
      ? { homeCollection: { dateTime: String(homeCollection.dateTime), address: String(homeCollection.address) } }
      : {}),
  };

  try {
    const result = await createBooking(input);
    return c.json({ ok: true, ...result }, 201);
  } catch (err: any) {
    console.error("corporate booking error:", err);
    return c.json({ error: err?.message ?? "booking failed" }, 500);
  }
});

// GET /api/corporate/orgs — the caller's centres/orgs (for the booking form)
route.get("/orgs", async (c) => {
  return c.json({ orgs: await orgsFor(c.get("corporateId")) });
});

// GET /api/corporate/reports/:id/pdf-url — signed URL, gated on org ownership.
async function signRef(ref: string | null): Promise<string | null> {
  if (!ref || /^https?:\/\//.test(ref)) return ref ?? null;
  const { data } = await supabase.storage.from("reports").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}

route.get("/reports/:id/pdf-url", async (c) => {
  const corporateId = c.get("corporateId");
  const { data: r } = await supabase
    .from("reports")
    .select("id, report_url, pdf_blob_ref, orders!inner(crelio_org_id)")
    .eq("id", c.req.param("id"))
    .maybeSingle();

  const orgId = (r as { orders?: { crelio_org_id?: number } } | null)?.orders?.crelio_org_id;
  const allowed = new Set((await orgsFor(corporateId)).map((o) => o.crelio_org_id as number));
  // 404 (not 403) — don't leak which report ids exist.
  if (!r || !orgId || !allowed.has(orgId)) return c.json({ error: "not found" }, 404);

  const url = await signRef((r.pdf_blob_ref as string | null) ?? (r.report_url as string | null));
  if (!url) return c.json({ error: "no report file" }, 404);
  return c.json({ url });
});

export default route;
