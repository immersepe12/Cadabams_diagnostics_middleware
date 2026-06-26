import { supabase } from "../../lib/supabase";
import { mapCrelioStatus, canTransition } from "../../domain/state-machine";
import { labIdToCentre } from "./client";
import type { CrelioWebhookPayload } from "./types";

// ── Normalise Crelio's inconsistent payload keys ─────────────────────────────

function normalise(raw: CrelioWebhookPayload) {
  return {
    billId:       String(raw.billId ?? raw.bill_id ?? ""),
    orderNumber:  String(raw.orderNumber ?? raw.order_number ?? ""),
    patientId:    String(raw.labPatientId ?? raw.lab_patient_id ?? raw["Patient Id"] ?? ""),
    labId:        Number(raw.labId ?? raw.lab_id ?? raw.orgId ?? raw.org_id ?? 0),
    testId:       String(raw.testID ?? raw.test_id ?? raw.testCode ?? raw.test_code ?? ""),
    testName:     String(raw.testName ?? raw.test_name ?? ""),
    status:       String(raw.status ?? ""),
    reportUrl:    extractReportUrl(raw),
    isAmended:    raw.is_amended === 1 || raw.is_amended === true,
  };
}

function extractReportUrl(raw: CrelioWebhookPayload): string | null {
  if (raw.smart_report_links) {
    const links = Array.isArray(raw.smart_report_links)
      ? raw.smart_report_links
      : [raw.smart_report_links];
    if (links[0]) return links[0];
  }
  return raw.reportURL ?? raw.report_url ?? null;
}

// ── Main processor ───────────────────────────────────────────────────────────

export async function processWebhook(raw: CrelioWebhookPayload): Promise<{ skipped?: string }> {
  const p = normalise(raw);

  if (!p.billId && !p.orderNumber) {
    return { skipped: "no correlation key (billId or orderNumber)" };
  }

  const mapping = mapCrelioStatus(p.status);
  if (!mapping) {
    return { skipped: `unknown status: "${p.status}"` };
  }

  const idempotencyKey = [p.billId || p.orderNumber, p.status, p.testId]
    .filter(Boolean)
    .join("_");

  // ── 1. Idempotency check ─────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from("order_events")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) return { skipped: "already processed" };

  // ── 2. Find order ────────────────────────────────────────────────────────
  const { data: order } = await supabase
    .from("orders")
    .select("id, centre_id")
    .or(
      [
        p.billId       ? `crelio_bill_id.eq.${p.billId}` : null,
        p.orderNumber  ? `order_number.eq.${p.orderNumber}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .maybeSingle();

  if (!order) {
    // Crelio may fire webhooks before our booking response is stored — log and skip.
    console.warn(`processWebhook: order not found for billId=${p.billId} orderNumber=${p.orderNumber}`);
    return { skipped: "order not found" };
  }

  // ── 3. Find order item (if test-level event) ─────────────────────────────
  let orderItemId: string | null = null;

  if (p.testId) {
    const { data: item } = await supabase
      .from("order_items")
      .select("id, status")
      .eq("order_id", order.id)
      .eq("crelio_test_id", p.testId)
      .maybeSingle();

    if (item) {
      if (!canTransition(item.status as any, mapping.orderItemStatus)) {
        return { skipped: `invalid transition ${item.status} → ${mapping.orderItemStatus}` };
      }

      orderItemId = item.id;

      // Build update fields
      const updates: Record<string, unknown> = { status: mapping.orderItemStatus };
      if (mapping.timestampField) updates[mapping.timestampField] = new Date().toISOString();
      if (p.reportUrl) updates.report_url = p.reportUrl;
      if (p.isAmended) updates.is_amended = true;

      await supabase.from("order_items").update(updates).eq("id", item.id);
    }
  }

  // ── 4. Append event ──────────────────────────────────────────────────────
  await supabase.from("order_events").insert({
    order_id: order.id,
    order_item_id: orderItemId,
    event_type: mapping.eventType,
    source: "crelio",
    idempotency_key: idempotencyKey,
    payload: raw,
  });

  return {};
}
