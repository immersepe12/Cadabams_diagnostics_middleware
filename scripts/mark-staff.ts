// One-time backfill: stamp app_metadata.role='staff' on existing ops users so
// they keep full data access once migration 010 splits RLS into staff vs patient.
//
// MUST run BEFORE applying 010 — otherwise every ops user becomes a "patient with
// no phone" and loses all access. Idempotent; safe to re-run.
//
//   bun run scripts/mark-staff.ts                       # everyone (except patients) → staff
//   bun run scripts/mark-staff.ts a@x.com b@y.com       # only these emails → staff
//   bun run scripts/mark-staff.ts --admin a@x.com       # these emails → ADMIN (user mgmt)
//
// Marks every existing auth user as staff EXCEPT phone-only accounts (patients,
// who have a phone and no email). Pass emails as args to restrict to those.
// Role changes take effect on the user's next login (JWT carries the role).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const rawArgs = process.argv.slice(2);
const targetRole = rawArgs[0] === "--admin" ? "admin" : "staff";
const emails = (targetRole === "admin" ? rawArgs.slice(1) : rawArgs).map((s) => s.toLowerCase());
const only = new Set(emails);

if (targetRole === "admin" && !only.size) {
  console.error("--admin requires at least one email");
  process.exit(1);
}

let page = 1;
let marked = 0;
let skipped = 0;

for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  if (!data.users.length) break;

  for (const u of data.users) {
    // Patients are phone-only (no email). Never mark them staff/admin.
    const isPatient = !u.email && !!u.phone;
    const wanted = only.size ? u.email && only.has(u.email.toLowerCase()) : !isPatient;
    if (!wanted) { skipped++; continue; }
    if ((u.app_metadata as { role?: string })?.role === targetRole) { skipped++; continue; }

    const { error: upErr } = await supabase.auth.admin.updateUserById(u.id, {
      app_metadata: { ...u.app_metadata, role: targetRole },
    });
    if (upErr) {
      console.error(`  ✗ ${u.email ?? u.phone ?? u.id}: ${upErr.message}`);
      continue;
    }
    console.log(`  ✓ ${u.email ?? u.id} → ${targetRole}`);
    marked++;
  }
  page++;
}

console.log(`\nDone. Marked ${marked} staff, skipped ${skipped}.`);
await supabase.auth.signOut().catch(() => {});
