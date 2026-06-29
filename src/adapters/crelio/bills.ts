import { supabase } from "../../lib/supabase";
import { crelioGet } from "./client";
import type { CentreId } from "./types";

// On-demand per-bill refresh. Crelio has no list/search API — the only
// transactional read is getOrderStatusAPI, keyed by a known billId. The webhook
// feed is what discovers bills; this just refreshes one bill's current state.

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function parseIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// reportDetails: one element per test on the bill. reportFormatAndValues present
// ⇒ the test has been reported; absent ⇒ still pending/in progress.
interface OrderStatusDetail {
  billId?: number | string;
  orderNumber?: string;
  "Patient Name"?: string;
  labPatientId?: string;
  "Test Name"?: string;
  "Report Id"?: number | string;
  testID?: number | string;
  "Report Date"?: string;
  reportFormatAndValues?: unknown[];
  [key: string]: unknown;
}

async function fetchOrderStatus(centreId: CentreId, billId: string): Promise<OrderStatusDetail[]> {
  const raw = await crelioGet<any>(centreId, `/getOrderStatusAPI/?billId=${encodeURIComponent(billId)}`);
  const details = raw?.reportDetails ?? raw?.data?.reportDetails;
  return Array.isArray(details) ? details : [];
}

export interface SyncBillResult {
  billId: string;
  tests: number;
}

export async function syncBillById(centreId: CentreId, billId: string): Promise<SyncBillResult> {
  const details = await fetchOrderStatus(centreId, billId);
  const head = details[0];
  if (!head) return { billId, tests: 0 };

  const orderNumber = str(head.orderNumber) || `CRELIO-${centreId}-${billId}`;
  const orgId = Number(head.organisationId ?? head.organizationId ?? head.orgId) || null;

  // Upsert the order. Omit mobile/age/gender — getOrderStatusAPI doesn't return
  // them, and we must not clobber values a Bill Generation webhook already set.
  const { data: order, error } = await supabase
    .from("orders")
    .upsert({
      order_number:      orderNumber,
      centre_id:         centreId,
      channel:           "d2c",
      patient_name:      str(head["Patient Name"]) || null,
      crelio_bill_id:    billId,
      crelio_patient_id: str(head.labPatientId) || null,
      ...(orgId ? { crelio_org_id: orgId } : {}),
    }, { onConflict: "crelio_bill_id" })
    .select("id")
    .single();

  if (error || !order) {
    console.error(`syncBillById upsert order failed (${centreId}/${billId}):`, error?.message);
    return { billId, tests: 0 };
  }

  // Build items. Only set `status` when reported — otherwise omit it so existing
  // rows keep their (possibly further-along) status and new rows default to booked.
  const items = details
    .map((d) => {
      const testId = str(d["Report Id"] ?? d.testID);
      if (!testId) return null;
      const reported = Array.isArray(d.reportFormatAndValues) && d.reportFormatAndValues.length > 0;
      const reportedAt = parseIso(d["Report Date"]);
      return {
        order_id:       order.id,
        crelio_test_id: testId,
        unified_code:   testId,
        test_name:      str(d["Test Name"]) || testId,
        ...(reported ? { status: "report_generated" } : {}),
        ...(reportedAt ? { reported_at: reportedAt } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length) {
    await supabase.from("order_items").upsert(items, { onConflict: "order_id,crelio_test_id" });
  }

  return { billId, tests: items.length };
}
