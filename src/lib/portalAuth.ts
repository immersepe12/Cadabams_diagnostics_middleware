import { createClient } from "@supabase/supabase-js";

// Verify a Supabase access token without a JWT library: a request-scoped anon
// client validates the token against Supabase Auth and returns the decoded user
// (incl. phone + app_metadata). Expired/revoked tokens are rejected.
// Roles: admin ⊃ staff (ops), corporate (org-scoped portal), patients (phone,
// no role).

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

export interface AuthedUser {
  userId: string;
  phone10: string;        // last 10 digits — matches orders.patient_mobile
  role: string | null;    // 'admin' | 'staff' | 'corporate' | null (patient)
  isStaff: boolean;       // staff OR admin
  isAdmin: boolean;
  isCorporate: boolean;
}

export async function authPatient(authHeader?: string): Promise<AuthedUser | null> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const phone10 = String(data.user.phone ?? "").replace(/\D/g, "").slice(-10);
  const role = (data.user.app_metadata as { role?: string })?.role ?? null;
  return {
    userId: data.user.id,
    phone10,
    role,
    isStaff: role === "staff" || role === "admin",
    isAdmin: role === "admin",
    isCorporate: role === "corporate",
  };
}
