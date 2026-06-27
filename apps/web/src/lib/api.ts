// The dashboard and the Hono API ship in one Vercel deployment, so API calls are
// same-origin relative paths. (Vite dev proxies these to localhost:3000 — see
// vite.config.ts.)

export interface SyncBillResult {
  ok: boolean;
  billId: string;
  tests: number;
}

// Refresh one bill's status from Crelio (getOrderStatusAPI). Crelio has no
// list/search API, so refresh is always per-known-bill.
export async function syncBill(billId: string, centre: string): Promise<SyncBillResult> {
  const res = await fetch("/sync/bill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billId, centre }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Crelio refresh failed (HTTP ${res.status})`);
  }
  return (await res.json()) as SyncBillResult;
}
