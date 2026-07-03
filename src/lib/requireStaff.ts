import type { Context, Next } from "hono";
import { authPatient } from "./portalAuth";

// Staff/admin gate for ops-only endpoints (booking, bill actions, data reads).
// These were unauthenticated while the dashboard was internal-only; with
// corporate + patient logins in the same auth pool they must be staff-gated.
export async function requireStaff(c: Context, next: Next) {
  const auth = await authPatient(c.req.header("authorization"));
  if (!auth?.isStaff) return c.json({ error: "unauthorized" }, 401);
  await next();
}
