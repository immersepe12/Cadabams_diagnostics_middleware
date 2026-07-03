import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { supabase } from "../lib/supabase";
import { authPatient } from "../lib/portalAuth";

// Admin-only user & corporate management. Writes go through the service role
// here (corporates/corporate_orgs/corporate_users have no client write
// policies); the ops UI reads lists via PostgREST under staff RLS.
// Passwords are generated server-side and returned ONCE — never stored.

const route = new Hono();

route.use("*", async (c, next) => {
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth?.isAdmin) return c.json({ error: "unauthorized" }, 401);
  await next();
});

const genPassword = () => randomBytes(12).toString("base64url"); // 16 chars
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "corp";

type OrgInput = { centreId: string; crelioOrgId: number; label?: string };

function validOrgs(orgs: unknown): OrgInput[] | null {
  if (!Array.isArray(orgs)) return null;
  const out: OrgInput[] = [];
  for (const o of orgs as OrgInput[]) {
    if (!o?.centreId || !Number(o?.crelioOrgId)) return null;
    out.push({ centreId: String(o.centreId), crelioOrgId: Number(o.crelioOrgId), label: o.label ? String(o.label) : undefined });
  }
  return out;
}

// POST /api/admin/corporates { name, code?, orgs:[{centreId, crelioOrgId, label?}] }
route.post("/corporates", async (c) => {
  const { name, code, orgs } = await c.req.json().catch(() => ({} as any));
  const parsed = validOrgs(orgs ?? []);
  if (!name || !parsed) return c.json({ error: "name and valid orgs are required" }, 400);

  const { data: corp, error } = await supabase
    .from("corporates")
    .insert({ name: String(name).trim(), code: (code ? String(code) : slug(String(name))).trim(), is_active: true })
    .select("id, name, code")
    .single();
  if (error || !corp) return c.json({ error: error?.message ?? "create failed" }, 500);

  if (parsed.length) {
    const { error: orgErr } = await supabase.from("corporate_orgs").insert(
      parsed.map((o) => ({ corporate_id: corp.id, centre_id: o.centreId, crelio_org_id: o.crelioOrgId, org_label: o.label ?? null })),
    );
    if (orgErr) return c.json({ error: `corporate created but orgs failed: ${orgErr.message}` }, 500);
  }
  return c.json({ ok: true, corporate: corp }, 201);
});

// PATCH /api/admin/corporates/:id { name?, isActive?, orgs? (full replacement) }
route.patch("/corporates/:id", async (c) => {
  const id = c.req.param("id");
  const { name, isActive, orgs } = await c.req.json().catch(() => ({} as any));

  const upd: Record<string, unknown> = {};
  if (name) upd.name = String(name).trim();
  if (typeof isActive === "boolean") upd.is_active = isActive;
  if (Object.keys(upd).length) {
    const { error } = await supabase.from("corporates").update(upd).eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
  }

  if (orgs !== undefined) {
    const parsed = validOrgs(orgs);
    if (!parsed) return c.json({ error: "invalid orgs" }, 400);
    await supabase.from("corporate_orgs").delete().eq("corporate_id", id);
    if (parsed.length) {
      const { error } = await supabase.from("corporate_orgs").insert(
        parsed.map((o) => ({ corporate_id: id, centre_id: o.centreId, crelio_org_id: o.crelioOrgId, org_label: o.label ?? null })),
      );
      if (error) return c.json({ error: error.message }, 500);
    }
  }
  return c.json({ ok: true });
});

// POST /api/admin/users { kind: 'corporate'|'staff'|'admin', email, name?, corporateId? }
// Returns the generated password ONCE.
route.post("/users", async (c) => {
  const { kind, email, name, corporateId } = await c.req.json().catch(() => ({} as any));
  if (!["corporate", "staff", "admin"].includes(kind)) return c.json({ error: "kind must be corporate|staff|admin" }, 400);
  if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) return c.json({ error: "valid email required" }, 400);
  if (kind === "corporate" && !corporateId) return c.json({ error: "corporateId required for corporate users" }, 400);

  const password = genPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: String(email).toLowerCase().trim(),
    password,
    email_confirm: true,
    app_metadata: { role: kind },
    user_metadata: name ? { name: String(name) } : undefined,
  });
  if (error || !data.user) return c.json({ error: error?.message ?? "create failed" }, 500);

  if (kind === "corporate") {
    const { error: cuErr } = await supabase.from("corporate_users").insert({
      user_id: data.user.id,
      corporate_id: corporateId,
      email: data.user.email,
      display_name: name ? String(name) : null,
    });
    if (cuErr) {
      // Don't leave an orphaned login with no corporate scope.
      await supabase.auth.admin.deleteUser(data.user.id);
      return c.json({ error: `user link failed: ${cuErr.message}` }, 500);
    }
  }
  return c.json({ ok: true, userId: data.user.id, email: data.user.email, password }, 201);
});

// POST /api/admin/users/:id/reset-password → new one-time password
route.post("/users/:id/reset-password", async (c) => {
  const password = genPassword();
  const { error } = await supabase.auth.admin.updateUserById(c.req.param("id"), { password });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true, password });
});

// POST /api/admin/users/:id/toggle { active: boolean }
route.post("/users/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const { active } = await c.req.json().catch(() => ({} as any));
  if (typeof active !== "boolean") return c.json({ error: "active (boolean) required" }, 400);

  const { error } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h", // ~100 years
  });
  if (error) return c.json({ error: error.message }, 500);
  // Corporate scope helpers filter on is_active, so data access dies instantly
  // even before the existing JWT expires.
  await supabase.from("corporate_users").update({ is_active: active }).eq("user_id", id);
  return c.json({ ok: true });
});

// GET /api/admin/staff-users — staff/admin logins for the Team card
route.get("/staff-users", async (c) => {
  const out: Array<{ id: string; email: string | null; role: string; banned: boolean; created_at: string }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return c.json({ error: error.message }, 500);
    if (!data.users.length) break;
    for (const u of data.users) {
      const role = (u.app_metadata as { role?: string })?.role ?? "";
      if (role === "staff" || role === "admin") {
        out.push({
          id: u.id, email: u.email ?? null, role,
          banned: !!(u as { banned_until?: string }).banned_until &&
            new Date((u as { banned_until?: string }).banned_until!) > new Date(),
          created_at: u.created_at,
        });
      }
    }
    page++;
  }
  return c.json({ users: out });
});

export default route;
