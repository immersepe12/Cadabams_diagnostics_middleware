import { supabase } from "../../lib/supabase";
import { normalizeMobile } from "../../lib/normalize";
import { mapCrelioStatus, canTransition, type OrderItemStatus } from "../../domain/state-machine";
import { labIdToCentre } from "./client";
import { syncBillById } from "./bills";
import type { CrelioWebhookPayload } from "./types";

// Crelio's payloads are inconsistent: labId is sometimes a nested {labId} object
// and sometimes a flat number; testID is sometimes a single value and sometimes
// an array; patient fields use space-separated keys ("Patient Name"). Normalise
// everything here so the rest of the processor sees one clean shape.

// ── Field extractors ─────────────────────────────────────────────────────────

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

// labId/orgId arrive flat or nested ({labId}/{orgId}). Pull the numeric id.
function flatId(v: any, ...keys: string[]): number {
  if (v && typeof v === "object") {
    for (const k of keys) if (v[k] != null) return Number(v[k]);
    return 0;
  }
  return Number(v ?? 0);
}

function extractLabId(raw: any): number {
  return flatId(raw.labId ?? raw.lab_id, "labId", "lab_id") || 0;
}

function extractOrgId(raw: any): number {
  return flatId(raw.orgId ?? raw.org_id, "orgId", "org_id") || 0;
}

function extractTestIds(raw: any): string[] {
  const t = raw.testID ?? raw.test_id ?? raw.testCode ?? raw.test_code ?? raw["Report Id"];
  if (Array.isArray(t)) return t.map(str).filter(Boolean);
  const s = str(t);
  return s ? [s] : [];
}

function extractReportUrl(raw: CrelioWebhookPayload): string | null {
  if (raw.smart_report_links) {
    const links = Array.isArray(raw.smart_report_links) ? raw.smart_report_links : [raw.smart_report_links];
    if (links[0]) return links[0];
  }
  return raw.reportURL ?? raw.report_url ?? null;
}

// "25" → 25, "24 years" → 24, "2 months"/"3 days" → null (infants get no integer age)
function parseAge(v: unknown): number | null {
  const s = str(v);
  if (!s || /month|day|week/i.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseGender(v: unknown): "M" | "F" | "O" | null {
  const s = str(v).toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return s ? "O" : null;
}

interface Normalised {
  billId: string;
  orderNumber: string;
  patientId: string;
  labId: number;
  orgId: number;
  status: string;
  testIds: string[];
  reportUrl: string | null;
  isAmended: boolean;
  patient: {
    name: string | null;
    mobile: string | null;
    age: number | null;
    gender: "M" | "F" | "O" | null;
  };
  billTests: Array<{ testId: string; testName: string }>; // from Bill Generation billInfoDetails
}

export function normalise(raw: any): Normalised {
  const billInfo = Array.isArray(raw.billInfoDetails) ? raw.billInfoDetails : [];
  return {
    billId:      str(raw.billId ?? raw.bill_id),
    orderNumber: str(raw.orderNumber ?? raw.order_number),
    patientId:   str(raw.labPatientId ?? raw.lab_patient_id ?? raw["Patient Id"]),
    labId:       extractLabId(raw),
    orgId:       extractOrgId(raw),
    status:      str(raw.Status ?? raw.status),
    testIds:     extractTestIds(raw),
    reportUrl:   extractReportUrl(raw),
    isAmended:   raw.is_amended === 1 || raw.is_amended === true,
    patient: {
      name:   str(raw["Patient Name"] ?? raw.patientName) || null,
      mobile: normalizeMobile(raw["Mobile Number"] ?? raw["Patient Contact"] ?? raw["Patient Alternate Contact"] ?? raw.patientMobile),
      age:    parseAge(raw["Patient Age"] ?? raw.Age ?? raw.patientAge),
      gender: parseGender(raw["Patient gender"] ?? raw.Gender ?? raw.patientGender),
    },
    billTests: billInfo
      .map((b: any) => ({
        testId:   str(b.testId ?? b.TestDetails?.testId),
        testName: str(b.testname ?? b.TestDetails?.TestName ?? b.testId),
      }))
      .filter((t: { testId: string }) => t.testId),
  };
}

// ── Order/item upserts ────────────────────────────────────────────────────────

// Ensure the order exists. Creates it from the webhook's own patient data when
// missing (this is how walk-in bills booked directly in Crelio enter the mirror).
async function ensureOrder(
  p: Normalised,
  centreId: string,
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await supabase
    .from("orders")
    .select("id, patient_name, patient_mobile, patient_age, patient_gender, crelio_patient_id")
    .or(
      [
        p.billId ? `crelio_bill_id.eq.${p.billId}` : null,
        p.orderNumber ? `order_number.eq.${p.orderNumber}` : null,
      ].filter(Boolean).join(","),
    )
    .maybeSingle();

  if (existing) {
    // Backfill any patient field this payload carries that's currently empty
    // (e.g. a Bill Generation arriving after a sample event created the order).
    const upd: Record<string, unknown> = {};
    if (!existing.patient_name && p.patient.name) upd.patient_name = p.patient.name;
    if (!existing.patient_mobile && p.patient.mobile) upd.patient_mobile = p.patient.mobile;
    if (existing.patient_age == null && p.patient.age != null) upd.patient_age = p.patient.age;
    if (!existing.patient_gender && p.patient.gender) upd.patient_gender = p.patient.gender;
    if (!existing.crelio_patient_id && p.patientId) upd.crelio_patient_id = p.patientId;
    if (Object.keys(upd).length) await supabase.from("orders").update(upd).eq("id", existing.id);
    return { id: existing.id, created: false };
  }

  if (!p.billId) return null; // can't key a new order without a bill id

  const { data, error } = await supabase
    .from("orders")
    .upsert({
      order_number:      p.orderNumber || `CRELIO-${centreId}-${p.billId}`,
      centre_id:         centreId,
      channel:           "d2c",
      patient_name:      p.patient.name,
      patient_mobile:    p.patient.mobile,
      patient_age:       p.patient.age,
      patient_gender:    p.patient.gender,
      crelio_bill_id:    p.billId,
      crelio_patient_id: p.patientId || null,
    }, { onConflict: "crelio_bill_id" })
    .select("id")
    .single();

  if (error) {
    console.error(`ensureOrder failed (bill ${p.billId}):`, error.message);
    return null;
  }
  return { id: data.id, created: true };
}

// Seed order_items from a Bill Generation payload (status=booked).
async function seedItems(orderId: string, p: Normalised) {
  if (!p.billTests.length) return;
  await supabase.from("order_items").upsert(
    p.billTests.map((t) => ({
      order_id:       orderId,
      crelio_test_id: t.testId,
      unified_code:   t.testId,
      test_name:      t.testName,
      status:         "booked" as OrderItemStatus,
    })),
    { onConflict: "order_id,crelio_test_id" },
  );
}

// ── Main processor ───────────────────────────────────────────────────────────

export async function processWebhook(raw: CrelioWebhookPayload): Promise<{ skipped?: string }> {
  const p = normalise(raw);

  if (!p.billId && !p.orderNumber) {
    return { skipped: "no correlation key (billId or orderNumber)" };
  }

  const mapping = mapCrelioStatus(p.status);
  if (!mapping) return { skipped: `unknown status: "${p.status}"` };

  // Idempotency: same bill + status + (joined) tests processed once
  const idempotencyKey = [p.billId || p.orderNumber, p.status, p.testIds.join("-")]
    .filter(Boolean).join("_");

  const { data: dup } = await supabase
    .from("order_events").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (dup) return { skipped: "already processed" };

  // Map to a centre by labId, falling back to orgId — Crelio's real webhooks may
  // carry an internal labId distinct from the account/org id we key centres on.
  const centreId = labIdToCentre(p.labId) ?? labIdToCentre(p.orgId);
  if (!centreId) return { skipped: `unknown labId/orgId: ${p.labId}/${p.orgId}` };

  // Create the order if we've never seen this bill (forward mirror of walk-ins)
  const order = await ensureOrder(p, centreId);
  if (!order) return { skipped: "could not resolve or create order" };

  // Self-heal: a bill first seen via a sample/report event has no patient data
  // in the payload (only Bill Generation does). Pull the full bill — patient +
  // all tests — from Crelio once, so it's never left nameless/itemless.
  if (order.created && !p.patient.name && p.billId) {
    try {
      await syncBillById(centreId as any, p.billId);
    } catch (err: any) {
      console.error(`webhook enrich failed (${centreId}/${p.billId}):`, err?.message ?? err);
    }
  }

  // Bill Generation carries the full test list — seed items up front
  if (mapping.orderItemStatus === "booked") {
    await seedItems(order.id, p);
  }

  // Apply the status to the affected items
  const targetItemIds: string[] = [];
  if (p.testIds.length) {
    for (const testId of p.testIds) {
      const { data: item } = await supabase
        .from("order_items")
        .select("id, status")
        .eq("order_id", order.id)
        .eq("crelio_test_id", testId)
        .maybeSingle();
      if (!item) continue;
      if (!canTransition(item.status as OrderItemStatus, mapping.orderItemStatus)) continue;

      const updates: Record<string, unknown> = { status: mapping.orderItemStatus };
      if (mapping.timestampField) updates[mapping.timestampField] = new Date().toISOString();
      if (p.reportUrl) updates.report_url = p.reportUrl;
      if (p.isAmended) updates.is_amended = true;
      await supabase.from("order_items").update(updates).eq("id", item.id);
      targetItemIds.push(item.id);
    }
  } else if (mapping.orderItemStatus === "cancelled") {
    // Whole-bill cancel with no per-test list → cancel every item
    await supabase.from("order_items").update({ status: "cancelled" }).eq("order_id", order.id);
  }

  // Append event(s) — one per affected item, or one order-level event
  type EventRow = {
    order_id: string;
    order_item_id: string | null;
    event_type: string;
    source: string;
    idempotency_key: string;
    payload: CrelioWebhookPayload;
  };
  const eventRows: EventRow[] = targetItemIds.length
    ? targetItemIds.map((itemId, i) => ({
        order_id: order.id,
        order_item_id: itemId,
        event_type: mapping.eventType,
        source: "crelio",
        idempotency_key: targetItemIds.length > 1 ? `${idempotencyKey}#${i}` : idempotencyKey,
        payload: raw,
      }))
    : [{
        order_id: order.id,
        order_item_id: null,
        event_type: mapping.eventType,
        source: "crelio",
        idempotency_key: idempotencyKey,
        payload: raw,
      }];

  await supabase.from("order_events").insert(eventRows);
  return {};
}
