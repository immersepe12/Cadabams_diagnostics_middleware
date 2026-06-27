// The dashboard and the Hono API ship in one Vercel deployment, so API calls are
// same-origin relative paths. (Vite dev proxies these to localhost:3000 — see
// vite.config.ts.)

export interface SyncPatientResult {
  ok: boolean;
  phone: string;
  synced: number;
  errors: number;
  perCentre: Record<string, number>;
}

export async function syncPatient(phone: string): Promise<SyncPatientResult> {
  const res = await fetch("/sync/patient", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Crelio lookup failed (HTTP ${res.status})`);
  }
  return (await res.json()) as SyncPatientResult;
}
