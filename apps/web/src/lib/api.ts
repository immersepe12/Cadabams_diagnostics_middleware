// The dashboard and the Hono API ship in one Vercel deployment, so API calls are
// same-origin relative paths. (Vite dev proxies these to localhost:3000 — see
// vite.config.ts.)
import { supabaseClient } from "./supabase";

export interface SyncBillResult {
  ok: boolean;
  billId: string;
  tests: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

// Refresh one bill's status from Crelio (getOrderStatusAPI). Crelio has no
// list/search API, so refresh is always per-known-bill.
export function syncBill(billId: string, centre: string) {
  return postJson<SyncBillResult>("/sync/bill", { billId, centre });
}

// ── Bookings + bill actions (live Crelio write APIs) ─────────────────────────

export interface BookingPayload {
  centreId: string;
  channel: "d2c" | "corporate" | "walkin";
  organizationIdLH?: number;
  patient: { name: string; mobile?: string; age: number; gender: "M" | "F" | "O"; email?: string; city?: string; dob?: string; labPatientId?: string; patientId?: string };
  tests: Array<{ crelioTestId: string; testName: string; price?: number }>;
  payment: { totalAmount: number; advance?: number; paymentType: "Cash" | "Online" | "Credit" };
  referralName?: string;
  comments?: string;
  appointment?: { startDate: string; endDate: string };
  homeCollection?: { dateTime: string; address: string; location?: string };
}

export interface BookingResult {
  ok: boolean;
  orderId: string;
  orderNumber: string;
  crelioBillId: string;
  crelioPatientId: string;
  appointmentId: string | null;
}

export function createBooking(payload: BookingPayload) {
  return postJson<BookingResult>("/bookings", payload);
}

// Per-bill actions → /actions/*
export function billAction(
  op: "complete" | "cancel" | "payment" | "add-test" | "test-cancel",
  body: Record<string, unknown>,
) {
  return postJson<{ ok: boolean; result: unknown }>(`/actions/bill/${op}`, body);
}

// Radiology: notify the patient of their report + move the item to report_sent.
// Staff-gated on the backend, so we attach the ops user's Supabase access token.
export async function sendReportToPatient(orderItemId: string): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch("/actions/report/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ orderItemId }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Send failed (HTTP ${res.status})`);
  }
  return (await res.json()) as { ok: boolean };
}

// Radiology: mint a handoff link into the external scribe reporting tool for a
// CT/MRI scan. Staff-gated on the backend, so attach the ops user's token.
export async function openReporter(orderItemId: string): Promise<{ url: string }> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch("/api/ris/handoff", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ orderItemId }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Could not open reporter (HTTP ${res.status})`);
  }
  return (await res.json()) as { url: string };
}

export interface CrelioOrg { orgId: number; name: string; code: string | null; city: string | null }

// Corporate orgs for a centre (live Crelio Organization List)
export async function fetchOrganizations(centre: string): Promise<CrelioOrg[]> {
  const res = await fetch(`/data/organizations/${centre}`);
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Failed to load organizations (HTTP ${res.status})`);
  }
  return (await res.json()).organizations ?? [];
}
