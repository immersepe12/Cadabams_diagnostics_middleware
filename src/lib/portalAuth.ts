import { createClient } from "@supabase/supabase-js";

// Verify a patient's Supabase access token without a JWT library: a request-
// scoped anon client validates the token against Supabase Auth and returns the
// decoded user (incl. phone + app_metadata). Expired/revoked tokens are rejected.
// Reuses @supabase/supabase-js (already a dep) — no jose / JWT-secret handling.

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

export interface PatientAuth {
  userId: string;
  phone10: string; // last 10 digits — matches orders.patient_mobile
  isStaff: boolean;
}

export async function authPatient(authHeader?: string): Promise<PatientAuth | null> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const phone10 = String(data.user.phone ?? "").replace(/\D/g, "").slice(-10);
  const isStaff = (data.user.app_metadata as { role?: string })?.role === "staff";
  return { userId: data.user.id, phone10, isStaff };
}
