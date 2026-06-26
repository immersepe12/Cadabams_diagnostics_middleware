import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client — uses service_role key, bypasses RLS
// Never expose this client or its key to the frontend
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
