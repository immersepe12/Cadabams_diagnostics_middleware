import { supabase } from "../../lib/supabase";
import { crelioGet } from "./client";
import { mapCrelioStatus } from "../../domain/state-machine";
import type { CentreId } from "./types";

// Demand-driven mirror: we do NOT bulk-import history. When ops looks a patient
// up by phone, we pull that one patient's bills from all four Crelio centres and
// upsert them. Webhooks then keep those mirrored patients fresh going forward.

const CENTRES: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];

// ── Crelio response shapes (mixed casing/spacing — normalise on read) ────────

interface CrelioBillSummary {
  billId?: string;
  bill_id?: string;
  billNo?: string;
  billDate?: string;
  bill_date?: string;
  patientName?: string;
  patient_name?: string;
  patientMobile?: string | number;
  patient_mobile?: string | number;
  mobileNo?: string | number;
  patientAge?: string | number;
  patient_age?: string | number;
  age?: string | number;
  patientGender?: string;
  patient_gender?: string;
  gender?: string;
  labPatientId?: string;
  lab_patient_id?: string;
  [key: string]: unknown;
}

interface CrelioTestInBill {
  testId?: string;
  test_id?: string;
  testCode?: string;
  test_code?: string;
  testName?: string;
  test_name?: string;
  status?: string;
  reportURL?: string;
  report_url?: string;
  smart_report_links?: string | string[];
  reportDate?: string;
  report_date?: string;
  sampleCollectedDate?: string;
  sample_collected_date?: string;
  is_amended?: 0 | 1 | boolean;
  [key: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function billIdOf(bill: CrelioBillSummary): string {
  return String(bill.billId ?? bill.bill_id ?? bill.billNo ?? "").trim();
}

function parseCrelioDate(v: string | undefined): string | null {
  if (!v) return null;
  // DD-MM-YYYY → ISO; otherwise let Date try
  const ddmm = /^(\d{2})-(\d{2})-(\d{4})/.exec(v);
  if (ddmm) return new Date(`${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`).toISOString();
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function extractReportUrl(test: CrelioTestInBill): string | null {
  if (test.smart_report_links) {
    const links = Array.isArray(test.smart_report_links)
      ? test.smart_report_links
      : [test.smart_report_links];
    if (links[0]) return links[0];
  }
  return test.reportURL ?? test.report_url ?? null;
}

// ── Crelio reads ──────────────────────────────────────────────────────────────
// ⚠️ ENDPOINT PATHS UNVERIFIED — confirm exact path + params with the Crelio
// account manager / docs portal (https://api.creliohealth.com/). Parsing below
// is deliberately tolerant of wrapper shapes (.data / .bills / bare array).

async function fetchBillsByMobile(centreId: CentreId, phone: string): Promise<CrelioBillSummary[]> {
  const raw = await crelioGet<any>(
    centreId,
    `/getBillsByMobileNumber/?mobileNumber=${encodeURIComponent(phone)}`,
  );
  return raw?.data?.bills ?? raw?.data ?? raw?.bills ?? raw?.list ?? (Array.isArray(raw) ? raw : []);
}

async function fetchBillTests(centreId: CentreId, billId: string): Promise<CrelioTestInBill[]> {
  const raw = await crelioGet<any>(centreId, `/getPatientBillDetails/?billId=${billId}`);
  const data = raw?.data ?? raw;
  return data?.tests ?? data?.testDetails ?? data?.test_details ?? [];
}

// ── Upserts ───────────────────────────────────────────────────────────────────

async function upsertOrder(
  centreId: CentreId,
  bill: CrelioBillSummary,
  fallbackPhone: string,
): Promise<string | null> {
  const billId = billIdOf(bill);
  if (!billId) return null;

  const patientName   = String(bill.patientName ?? bill.patient_name ?? "").trim() || null;
  const patientMobile = String(bill.patientMobile ?? bill.patient_mobile ?? bill.mobileNo ?? fallbackPhone).trim() || null;
  const patientAge    = Number(bill.patientAge ?? bill.patient_age ?? bill.age ?? 0) || null;
  const patientGender = String(bill.patientGender ?? bill.patient_gender ?? bill.gender ?? "").trim().toUpperCase();
  const labPatientId  = String(bill.labPatientId ?? bill.lab_patient_id ?? "").trim() || null;
  const billDate      = parseCrelioDate(String(bill.billDate ?? bill.bill_date ?? ""));

  const { data, error } = await supabase
    .from("orders")
    .upsert({
      order_number:      `CRELIO-${centreId}-${billId}`, // deterministic → no dup on re-sync
      centre_id:         centreId,
      channel:           "d2c",
      patient_name:      patientName,
      patient_mobile:    patientMobile,
      patient_age:       patientAge,
      patient_gender:    ["M", "F", "O"].includes(patientGender) ? patientGender : null,
      crelio_bill_id:    billId,
      crelio_patient_id: labPatientId,
      ...(billDate ? { created_at: billDate } : {}),
    }, { onConflict: "crelio_bill_id" })
    .select("id")
    .single();

  if (error) {
    console.error(`upsertOrder failed (${centreId} bill ${billId}):`, error.message);
    return null;
  }
  return data.id;
}

async function upsertTests(orderId: string, tests: CrelioTestInBill[]) {
  for (const test of tests) {
    const testId = String(test.testId ?? test.test_id ?? test.testCode ?? test.test_code ?? "").trim();
    if (!testId) continue;

    const mapping     = mapCrelioStatus(String(test.status ?? ""));
    const collectedAt = parseCrelioDate(String(test.sampleCollectedDate ?? test.sample_collected_date ?? ""));
    const reportedAt  = parseCrelioDate(String(test.reportDate ?? test.report_date ?? ""));

    await supabase.from("order_items").upsert(
      {
        order_id:       orderId,
        crelio_test_id: testId,
        unified_code:   testId, // refined later by catalogue sync
        test_name:      String(test.testName ?? test.test_name ?? testId).trim(),
        status:         mapping?.orderItemStatus ?? "booked",
        report_url:     extractReportUrl(test) || null,
        is_amended:     test.is_amended === 1 || test.is_amended === true,
        ...(collectedAt ? { collected_at: collectedAt } : {}),
        ...(reportedAt  ? { reported_at:  reportedAt }  : {}),
      },
      { onConflict: "order_id,crelio_test_id" },
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncPatientResult {
  phone: string;
  synced: number;                       // bills upserted
  errors: number;
  perCentre: Record<string, number>;    // bills found per centre (-1 = centre call failed)
}

export async function syncPatientByPhone(phone: string): Promise<SyncPatientResult> {
  const clean = phone.replace(/\D/g, "");
  let synced = 0, errors = 0;
  const perCentre: Record<string, number> = {};

  await Promise.all(
    CENTRES.map(async (centreId) => {
      try {
        const bills = await fetchBillsByMobile(centreId, clean);
        let n = 0;
        for (const bill of bills) {
          const orderId = await upsertOrder(centreId, bill, clean);
          if (!orderId) { errors++; continue; }
          try {
            const tests = await fetchBillTests(centreId, billIdOf(bill));
            await upsertTests(orderId, tests);
          } catch (err: any) {
            console.error(`fetchBillTests failed (${centreId}/${billIdOf(bill)}):`, err?.message ?? err);
            errors++;
          }
          n++; synced++;
        }
        perCentre[centreId] = n;
      } catch (err: any) {
        console.error(`fetchBillsByMobile failed (${centreId}):`, err?.message ?? err);
        perCentre[centreId] = -1;
        errors++;
      }
    }),
  );

  return { phone: clean, synced, errors, perCentre };
}
