import { supabase } from "../../lib/supabase";
import { normalizeMobile } from "../../lib/normalize";
import { crelioPost } from "./client";
import type { CentreId } from "./types";

// Real LHRegisterBillAPI shape (verified against Crelio's Postman export):
// patient fields at top level, bill under `billDetails` with testList/paymentList.
// Appointment and Home Collection are the SAME endpoint plus flags.

export interface BookingInput {
  centreId: CentreId;
  channel: "corporate" | "d2c" | "walkin";
  corporateId?: string;          // our corporates.id (for DB linkage)
  organizationIdLH?: number;     // Crelio org id (corporate billing)
  patient: {
    name: string;
    mobile?: string;
    age: number;
    gender: "M" | "F" | "O";
    email?: string;
    city?: string;
    dob?: string;                // YYYY-MM-DD
    patientType?: "IP" | "OP";
    labPatientId?: string;       // set → reuse this existing Crelio patient
    patientId?: string;
  };
  tests: Array<{ crelioTestId: string; testName: string; testCode?: string; price?: number }>;
  payment: {
    totalAmount: number;
    advance?: number;
    paymentType: "Cash" | "Online" | "Credit";
  };
  referralName?: string;
  comments?: string;
  // Optional booking modes
  appointment?: { startDate: string; endDate: string };          // ISO
  homeCollection?: { dateTime: string; address: string; location?: string };
}

interface CrelioRegisterResponse {
  billId?: string | number;
  bill_id?: string | number;
  labPatientId?: string;
  lab_patient_id?: string;
  appointmentId?: string | number;
  status?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

const GENDER: Record<string, string> = { M: "Male", F: "Female", O: "Other" };

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `CDX-${ts}-${rand}`;
}

export async function createBooking(input: BookingInput) {
  const orderNumber = generateOrderNumber();
  const nowIso = new Date().toISOString();
  const mobile = normalizeMobile(input.patient.mobile);

  // Bill total = sum of (possibly edited) per-test prices, falling back to the
  // explicitly supplied total when line items carry no prices.
  const lineTotal = input.tests.reduce((s, t) => s + (Number(t.price) || 0), 0);
  const totalAmount = lineTotal || input.payment.totalAmount;

  // ── 1. Build the real LHRegisterBillAPI payload ──────────────────────────
  const payload: Record<string, unknown> = {
    fullName:    input.patient.name,
    mobile:      mobile ?? "",
    email:       input.patient.email ?? "",
    age:         input.patient.age,
    gender:      GENDER[input.patient.gender] ?? "Other",
    city:        input.patient.city ?? "",
    patientType: input.patient.patientType ?? "OP",
    dob:         input.patient.dob ?? "",
    // Set → Crelio reuses this patient; empty → creates a new one.
    labPatientId: input.patient.labPatientId ?? "",
    patientId:    input.patient.patientId ?? "",
    billDetails: {
      emergencyFlag:    "0",
      totalAmount:      String(totalAmount),
      advance:          String(input.payment.advance ?? 0),
      billDate:         nowIso,
      paymentType:      input.payment.paymentType,
      referralName:     input.referralName ?? "",
      orderNumber,
      organizationIdLH: input.organizationIdLH,
      comments:         input.comments ?? "",
      testList: input.tests.map((t) => ({
        testID:      t.crelioTestId,
        testCode:    t.testCode ?? "",
        sampleId:    "",
      })),
      paymentList: input.payment.advance
        ? [{ paymentType: input.payment.paymentType, paymentAmount: String(input.payment.advance), issueBank: "" }]
        : [],
    },
  };

  if (input.appointment) {
    payload.isAppointmentRequest = 1;
    payload.startDate = input.appointment.startDate;
    payload.endDate = input.appointment.endDate;
  }
  if (input.homeCollection) {
    payload.isHomecollection = 1;
    payload.homeCollectionDateTime = input.homeCollection.dateTime;
    payload.address = input.homeCollection.address;
    if (input.homeCollection.location) payload.location = input.homeCollection.location;
  }

  const res = await crelioPost<CrelioRegisterResponse>(input.centreId, "/LHRegisterBillAPI/", payload);

  const crelioBillId = String(res.billId ?? res.bill_id ?? "");
  const crelioPatientId = String(res.labPatientId ?? res.lab_patient_id ?? "");

  if (res.error || (!crelioBillId && res.message)) {
    throw new Error(`Crelio booking failed: ${res.error ?? res.message}`);
  }

  // ── 2. Persist order + items + event ─────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number:      orderNumber,
      centre_id:         input.centreId,
      corporate_id:      input.corporateId ?? null,
      channel:           input.channel,
      patient_name:      input.patient.name,
      patient_mobile:    mobile,
      patient_age:       input.patient.age,
      patient_gender:    input.patient.gender,
      crelio_bill_id:    crelioBillId || null,
      crelio_patient_id: crelioPatientId || null,
      crelio_org_id:     input.organizationIdLH ?? null,
    })
    .select("id")
    .single();

  if (orderErr) throw new Error(`DB insert order failed: ${orderErr.message}`);

  await supabase.from("order_items").insert(
    input.tests.map((t) => ({
      order_id:       order.id,
      unified_code:   t.crelioTestId,
      test_name:      t.testName,
      crelio_test_id: t.crelioTestId,
      price:          Number(t.price) || null,
      status:         "booked",
    })),
  );

  if (crelioBillId) {
    await supabase.from("order_events").insert({
      order_id:        order.id,
      event_type:      "bill_generated",
      source:          "ops",
      idempotency_key: `${crelioBillId}_bill_generated_ops`,
      payload:         { crelioBillId, crelioPatientId, orderNumber, via: "booking-api" },
    });
  }

  return {
    orderId: order.id,
    orderNumber,
    crelioBillId,
    crelioPatientId,
    appointmentId: res.appointmentId ?? null,
  };
}
