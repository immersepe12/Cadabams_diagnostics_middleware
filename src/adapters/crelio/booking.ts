import { supabase } from "../../lib/supabase";
import { crelioPost } from "./client";
import type { CentreId, CrelioBookingRequest, CrelioBookingResponse } from "./types";

export interface CreateOrderInput {
  centreId: CentreId;
  channel: "corporate" | "d2c" | "walkin";
  corporateId?: string;
  crelioOrgId?: number;
  patient: {
    name: string;
    mobile?: string;
    age: number;
    gender: "M" | "F" | "O";
  };
  tests: Array<{
    unifiedCode: string;
    testName: string;
    crelioTestId: string;
  }>;
}

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `CDX-${ts}-${rand}`;
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function createOrder(input: CreateOrderInput) {
  const orderNumber = generateOrderNumber();

  // ── 1. Build and send Crelio booking ────────────────────────────────────
  const crelioPayload: CrelioBookingRequest = {
    orderNumber,
    patientName: input.patient.name,
    patientAge: input.patient.age,
    patientGender: input.patient.gender,
    patientMobile: input.patient.mobile,
    billDate: todayDate(),
    paymentType: input.channel === "corporate" ? "CREDIT" : "CASH",
    organizationIdLH: input.crelioOrgId,
    tests: input.tests.map((t) => ({ testId: t.crelioTestId })),
  };

  const crelioRes = await crelioPost<CrelioBookingResponse>(
    input.centreId,
    "/LHRegisterBillAPI/",
    crelioPayload
  );

  const crelioBillId = String(crelioRes.billId ?? crelioRes.bill_id ?? "");
  const crelioPatientId = String(crelioRes.labPatientId ?? crelioRes.lab_patient_id ?? "");

  if (crelioRes.error || (!crelioBillId && crelioRes.message)) {
    throw new Error(`Crelio booking failed: ${crelioRes.error ?? crelioRes.message}`);
  }

  // ── 2. Persist order ─────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      centre_id: input.centreId,
      corporate_id: input.corporateId ?? null,
      channel: input.channel,
      patient_name: input.patient.name,
      patient_mobile: input.patient.mobile ?? null,
      patient_age: input.patient.age,
      patient_gender: input.patient.gender,
      crelio_bill_id: crelioBillId,
      crelio_patient_id: crelioPatientId,
    })
    .select("id")
    .single();

  if (orderErr) throw new Error(`DB insert order failed: ${orderErr.message}`);

  // ── 3. Persist order items ───────────────────────────────────────────────
  const { error: itemsErr } = await supabase.from("order_items").insert(
    input.tests.map((t) => ({
      order_id: order.id,
      unified_code: t.unifiedCode,
      test_name: t.testName,
      crelio_test_id: t.crelioTestId,
      status: "booked",
    }))
  );

  if (itemsErr) throw new Error(`DB insert order_items failed: ${itemsErr.message}`);

  // ── 4. Record the bill_generated event ───────────────────────────────────
  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "bill_generated",
    source: "crelio",
    idempotency_key: `${crelioBillId}_bill_generated`,
    payload: { crelioBillId, crelioPatientId, orderNumber },
  });

  return { orderId: order.id, orderNumber, crelioBillId, crelioPatientId };
}
