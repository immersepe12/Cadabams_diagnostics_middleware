import { supabaseClient } from "../../lib/supabase";

// Corporate portal API calls. Data reads happen via PostgREST + RLS; these hit
// the corporate-gated backend for what RLS can't do (booking, signed PDFs).

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export interface CorpOrg { centre_id: string; crelio_org_id: number; org_label: string | null }

export function getMyOrgs() {
  return req<{ orgs: CorpOrg[] }>("/api/corporate/orgs");
}

export interface CorpBooking {
  centreId: string;
  crelioOrgId?: number;
  patient: { name: string; mobile?: string; age: number; gender: "M" | "F" | "O"; email?: string };
  tests: Array<{ crelioTestId: string }>;
  appointment?: { startDate: string; endDate: string };
  homeCollection?: { dateTime: string; address: string };
  comments?: string;
}

export function corporateBook(body: CorpBooking) {
  return req<{ ok: boolean; orderId: string; orderNumber: string; crelioBillId: string }>(
    "/api/corporate/bookings",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function getCorporatePdfUrl(reportId: string): Promise<string> {
  const r = await req<{ url: string }>(`/api/corporate/reports/${reportId}/pdf-url`);
  return r.url;
}
