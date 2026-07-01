// Crelio sends inconsistent casing/spacing — we normalise on ingestion.
// All types here represent what Crelio actually sends, warts and all.

export type CentreId = "KYL" | "JNR" | "KKP" | "BSK";

// ── Booking request → LHRegisterBillAPI ─────────────────────────────────────

export interface CrelioBookingRequest {
  orderNumber: string;
  patientName: string;
  patientAge: number;
  patientGender: "M" | "F" | "O";
  patientMobile?: string;
  billDate: string; // "YYYY-MM-DD"
  paymentType: "CREDIT" | "CASH" | "ONLINE";
  organizationIdLH?: number; // corporate org ID in Crelio
  tests: Array<{ testId: string }>;
}

export interface CrelioBookingResponse {
  billId?: string;
  bill_id?: string;
  labPatientId?: string;
  lab_patient_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

// ── Webhook payload — Consolidated All Report Submit ─────────────────────────
// Crelio sends mixed casing, mixed spacing, mixed key names. Handle all variants.

export interface CrelioWebhookPayload {
  // Order correlation — may come as any of these
  billId?: string;
  bill_id?: string;
  orderNumber?: string;
  order_number?: string;

  // Patient correlation
  labPatientId?: string;
  lab_patient_id?: string;
  "Patient Id"?: string;

  // Centre correlation
  labId?: number | string;
  lab_id?: number | string;
  orgId?: number | string;
  org_id?: number | string;

  // Test correlation
  testID?: string;
  test_id?: string;
  testCode?: string;
  test_code?: string;
  testName?: string;
  test_name?: string;

  // Status — discriminator field
  status?: string;

  // Report
  reportURL?: string;
  report_url?: string;
  smart_report_links?: string | string[];
  reportBase64?: string; // prefer URL over base64

  // Amendment flag
  is_amended?: 0 | 1 | boolean;

  // Timestamps — mixed formats
  billDate?: string;
  sampleCollectedDate?: string;
  reportDate?: string;

  // Billing / payment — carried by Bill Generation (and later events)
  billTotalAmount?: number | string;
  totalBillPaidAmount?: number | string;
  dueAmount?: number | string;
  billAdvance?: number | string;
  billConcession?: number | string;
  vat_amount?: number | string;
  payment_mode?: string;
  billPaymentMode?: string;
  billPaymentStatus?: string;
  isBillDue?: 0 | 1 | boolean;
  billReferral?: string;
  ReferralName?: string;
  currency?: string;
  billComments?: string;

  // Auth — should match CRELIO_WEBHOOK_SECRET env
  APIKEY?: string;
  APIUSER?: string;

  // Anything else Crelio decides to send
  [key: string]: unknown;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface CrelioTest {
  testId: string;
  testName: string;
  department?: string;
  category?: string;
  price?: number;
}

export interface CrelioCatalogueResponse {
  tests?: CrelioTest[];
  data?: CrelioTest[];
  [key: string]: unknown;
}
