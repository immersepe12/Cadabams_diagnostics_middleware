import { supabaseClient } from "../../lib/supabase";

// Patient portal API calls. Structured report data is read directly via the
// Supabase data provider (RLS-scoped); this is only for the backend-minted,
// ownership-gated signed PDF URL.

export async function getReportPdfUrl(reportId: string): Promise<string> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`/api/portal/reports/${reportId}/pdf-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Could not open report (HTTP ${res.status})`);
  }
  return ((await res.json()) as { url: string }).url;
}
