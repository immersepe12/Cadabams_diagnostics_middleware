import { supabase } from "../../lib/supabase";
import { crelioPost } from "./client";
import type { CentreId } from "./types";

// Per-bill management actions. Payload shapes verified against Crelio's Postman
// export. Each calls the live Crelio API; some also patch our mirror for instant
// UI feedback (webhooks then confirm the state).

type Json = Record<string, unknown>;

async function post(centreId: CentreId, path: string, body: Json) {
  return crelioPost<Json>(centreId, path, body);
}

// POST /billComplete/{token}/   { billId }
export function billComplete(centreId: CentreId, billId: string) {
  return post(centreId, "/billComplete/", { billId });
}

// POST /billPayment/{token}/    { billId, paymentList:[{paymentMode, amount}] }
export function billPayment(
  centreId: CentreId,
  billId: string,
  payments: Array<{ paymentMode: string; amount: number }>,
) {
  return post(centreId, "/billPayment/", { billId, paymentList: payments });
}

// POST /cancelFullBill/{token}/ { billId }  → mark all items cancelled locally
export async function billCancel(centreId: CentreId, billId: string) {
  const res = await post(centreId, "/cancelFullBill/", { billId });
  const { data: order } = await supabase.from("orders").select("id").eq("crelio_bill_id", billId).maybeSingle();
  if (order) await supabase.from("order_items").update({ status: "cancelled" }).eq("order_id", order.id);
  return res;
}

// POST /cancelTestOfBill/{token}/ { billId, testList:[{testCode,testID,integrationCode,isRefund,deductAmount}] }
export async function billTestCancel(
  centreId: CentreId,
  billId: string,
  tests: Array<{ testID: string; testCode?: string; isRefund?: 0 | 1; deductAmount?: number }>,
) {
  const res = await post(centreId, "/cancelTestOfBill/", {
    billId,
    testList: tests.map((t) => ({
      testID: t.testID,
      testCode: t.testCode ?? "",
      integrationCode: "",
      isRefund: t.isRefund ?? 0,
      deductAmount: t.deductAmount ?? 0,
    })),
  });
  const { data: order } = await supabase.from("orders").select("id").eq("crelio_bill_id", billId).maybeSingle();
  if (order) {
    for (const t of tests) {
      await supabase.from("order_items")
        .update({ status: "cancelled" })
        .eq("order_id", order.id).eq("crelio_test_id", t.testID);
    }
  }
  return res;
}

// POST /LHAddTestToBillAPI/{token}/  { billTotalAmount, billAdvance, orderNumber, billId, testList:[...] }
export async function addTestToBill(
  centreId: CentreId,
  billId: string,
  tests: Array<{ crelioTestId: string; testName: string; testCode?: string }>,
) {
  const { data: order } = await supabase
    .from("orders").select("id, order_number").eq("crelio_bill_id", billId).maybeSingle();

  const res = await post(centreId, "/LHAddTestToBillAPI/", {
    billTotalAmount: "0",
    billAdvance: 0,
    orderNumber: order?.order_number ?? "",
    billId,
    testList: tests.map((t) => ({
      testCode: t.testCode ?? "",
      sampleId: "",
      dictionaryId: "",
      testID: t.crelioTestId,
      integrationCode: "",
    })),
  });

  if (order) {
    await supabase.from("order_items").upsert(
      tests.map((t) => ({
        order_id: order.id,
        crelio_test_id: t.crelioTestId,
        unified_code: t.crelioTestId,
        test_name: t.testName,
        status: "booked",
      })),
      { onConflict: "order_id,crelio_test_id" },
    );
  }
  return res;
}

// ── Appointments ─────────────────────────────────────────────────────────────
export function appointmentConfirm(centreId: CentreId, appointmentId: string, billId = "") {
  return post(centreId, "/appointmentConfirmAPI/", { billId, appointmentId });
}
export function appointmentReschedule(centreId: CentreId, appointmentId: string, appointmentDate: string, billId = "") {
  return post(centreId, "/LHRescheduleAPI/", { appointment_date: appointmentDate, bill_id: billId, appointment_id: appointmentId });
}
export function appointmentDismiss(centreId: CentreId, appointmentId: string) {
  return post(centreId, "/appointmentDismissAPI/", { appointmentId });
}

// ── Sample (push state into Crelio) ──────────────────────────────────────────
// POST /api/update_collection_date/{token}/
export function sampleCollect(centreId: CentreId, billId: string, testIds: string[]) {
  return post(centreId, "/api/update_collection_date/", {
    billId,
    testID: testIds,
    collectionTime: new Date().toISOString(),
  });
}
