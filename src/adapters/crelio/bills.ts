import { supabase } from "../../lib/supabase";
import { crelioGet } from "./client";
import { mapCrelioStatus } from "../../domain/state-machine";
import type { CentreId } from "./types";

// ── Types for Crelio bill list / detail responses ────────────────────────────
// Crelio's bill listing API uses DD-MM-YYYY dates and inconsistent key names.

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
  labId?: string | number;
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

// ── Date helpers ──────────────────────────────────────────────────────────────

// Crelio expects DD-MM-YYYY in some endpoints
function toCrelioDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function parseCrelioBillDate(v: string | undefined): string | null {
  if (!v) return null;
  // Try DD-MM-YYYY first, then YYYY-MM-DD, then ISO
  const ddmm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
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

// ── Crelio bill-list API ──────────────────────────────────────────────────────
// Endpoint: GET /getAllBillsListing/?startDate=DD-MM-YYYY&endDate=DD-MM-YYYY&page=N
// Adjust the path below if Crelio uses a different endpoint name.

async function fetchBillPage(
  centreId: CentreId,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
  page: number,
): Promise<{ bills: CrelioBillSummary[]; hasMore: boolean }> {
  const sd = toCrelioDDMMYYYY(startDate);
  const ed = toCrelioDDMMYYYY(endDate);

  const raw = await crelioGet<any>(
    centreId,
    `/getAllBillsListing/?startDate=${sd}&endDate=${ed}&page=${page}&pageSize=50`,
  );

  // Crelio may wrap results in .data, .bills, .list, or return the array directly
  const bills: CrelioBillSummary[] =
    raw?.data?.bills ?? raw?.data ?? raw?.bills ?? raw?.list ?? (Array.isArray(raw) ? raw : []);

  // hasMore: if we got a full page (50) assume there may be more
  const hasMore = bills.length === 50;

  return { bills, hasMore };
}

// ── Crelio bill-detail API ────────────────────────────────────────────────────
// Endpoint: GET /getPatientBillDetails/?billId=ID
// Returns the tests (with statuses and report URLs) for one bill.

async function fetchBillTests(centreId: CentreId, billId: string): Promise<CrelioTestInBill[]> {
  const raw = await crelioGet<any>(centreId, `/getPatientBillDetails/?billId=${billId}`);
  const data = raw?.data ?? raw;
  return data?.tests ?? data?.testDetails ?? data?.test_details ?? [];
}

// ── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertOrder(
  centreId: CentreId,
  bill: CrelioBillSummary,
): Promise<string | null> {
  const billId = String(bill.billId ?? bill.bill_id ?? bill.billNo ?? "").trim();
  if (!billId) return null;

  const patientName   = String(bill.patientName ?? bill.patient_name ?? "").trim() || null;
  const patientMobile = String(bill.patientMobile ?? bill.patient_mobile ?? bill.mobileNo ?? "").trim() || null;
  const patientAge    = Number(bill.patientAge ?? bill.patient_age ?? bill.age ?? 0) || null;
  const patientGender = String(bill.patientGender ?? bill.patient_gender ?? bill.gender ?? "").trim().toUpperCase();
  const labPatientId  = String(bill.labPatientId ?? bill.lab_patient_id ?? "").trim() || null;
  const billDate      = parseCrelioBillDate(String(bill.billDate ?? bill.bill_date ?? ""));

  // Generate a deterministic order_number so we never create duplicates on re-sync
  const orderNumber = `CRELIO-${centreId}-${billId}`;

  const { data, error } = await supabase
    .from("orders")
    .upsert({
      order_number:       orderNumber,
      centre_id:          centreId,
      channel:            "d2c",
      patient_name:       patientName,
      patient_mobile:     patientMobile,
      patient_age:        patientAge,
      patient_gender:     ["M", "F", "O"].includes(patientGender) ? patientGender : null,
      crelio_bill_id:     billId,
      crelio_patient_id:  labPatientId,
      ...(billDate ? { created_at: billDate } : {}),
    }, { onConflict: "crelio_bill_id", ignoreDuplicates: false })
    .select("id")
    .single();

  if (error) {
    console.error(`upsertOrder failed for ${centreId} bill ${billId}:`, error.message);
    return null;
  }
  return data.id;
}

async function upsertTests(orderId: string, centreId: CentreId, tests: CrelioTestInBill[]) {
  for (const test of tests) {
    const testId = String(test.testId ?? test.test_id ?? test.testCode ?? test.test_code ?? "").trim();
    if (!testId) continue;

    const testName  = String(test.testName ?? test.test_name ?? testId).trim();
    const mapping   = mapCrelioStatus(String(test.status ?? ""));
    const reportUrl = extractReportUrl(test);
    const isAmended = test.is_amended === 1 || test.is_amended === true;

    const collectedAt = parseCrelioBillDate(
      String(test.sampleCollectedDate ?? test.sample_collected_date ?? ""),
    );
    const reportedAt = parseCrelioBillDate(
      String(test.reportDate ?? test.report_date ?? ""),
    );

    await supabase.from("order_items").upsert(
      {
        order_id:       orderId,
        crelio_test_id: testId,
        unified_code:   testId, // will be refined when catalogue sync runs
        test_name:      testName,
        status:         mapping?.orderItemStatus ?? "booked",
        report_url:     reportUrl || null,
        is_amended:     isAmended,
        ...(collectedAt ? { collected_at: collectedAt } : {}),
        ...(reportedAt  ? { reported_at:  reportedAt }  : {}),
      },
      { onConflict: "order_id,crelio_test_id" },
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncBillsResult {
  synced: number;
  skipped: number;
  errors: number;
}

export async function syncBillsForCentre(
  centreId: CentreId,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): Promise<SyncBillsResult> {
  let synced = 0, skipped = 0, errors = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { bills, hasMore: more } = await fetchBillPage(centreId, startDate, endDate, page);
    hasMore = more;
    page++;

    for (const bill of bills) {
      const billId = String(bill.billId ?? bill.bill_id ?? bill.billNo ?? "").trim();
      if (!billId) { skipped++; continue; }

      const orderId = await upsertOrder(centreId, bill);
      if (!orderId) { errors++; continue; }

      try {
        const tests = await fetchBillTests(centreId, billId);
        await upsertTests(orderId, centreId, tests);
        synced++;
      } catch (err: any) {
        console.error(`fetchBillTests failed for ${centreId}/${billId}:`, err?.message ?? err);
        // Order is saved even if tests fail
        synced++;
        errors++;
      }
    }
  }

  return { synced, skipped, errors };
}

export async function syncBillsAllCentres(
  startDate: string,
  endDate: string,
): Promise<Record<CentreId, SyncBillsResult>> {
  const centres: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];
  const results = {} as Record<CentreId, SyncBillsResult>;

  await Promise.all(
    centres.map(async (centreId) => {
      try {
        results[centreId] = await syncBillsForCentre(centreId, startDate, endDate);
      } catch (err: any) {
        console.error(`syncBillsForCentre failed for ${centreId}:`, err?.message ?? err);
        results[centreId] = { synced: 0, skipped: 0, errors: -1 };
      }
    }),
  );

  return results;
}
