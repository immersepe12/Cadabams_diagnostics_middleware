import type { CentreId } from "./types";

const BASE_URL = "https://crelio.solutions";

// ── Token broker ─────────────────────────────────────────────────────────────
// One token per centre. Tokens are minted via create-token API and stored in env.
// Each call rotates the token, so we only mint on expiry — never call create-token here.

const TOKENS: Record<CentreId, string> = {
  KYL: process.env.CRELIO_TOKEN_KYL!,
  JNR: process.env.CRELIO_TOKEN_JNR!,
  KKP: process.env.CRELIO_TOKEN_KKP!,
  BSK: process.env.CRELIO_TOKEN_BSK!,
};

// Map Crelio's labId (= orgId) back to our centre code
export const LAB_ID_TO_CENTRE: Record<number, CentreId> = {
  9488:  "KYL",
  11541: "JNR",
  11807: "KKP",
  12143: "BSK",
};

export function getToken(centreId: CentreId): string {
  const token = TOKENS[centreId];
  if (!token) throw new Error(`No Crelio token configured for centre: ${centreId}`);
  return token;
}

export function labIdToCentre(labId: number | string): CentreId | null {
  return LAB_ID_TO_CENTRE[Number(labId)] ?? null;
}

// ── HTTP client ──────────────────────────────────────────────────────────────

export async function crelioGet<T>(centreId: CentreId, path: string): Promise<T> {
  const token = getToken(centreId);
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${token}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Crelio GET ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export async function crelioPost<T>(centreId: CentreId, path: string, body: unknown): Promise<T> {
  const token = getToken(centreId);
  const url = `${BASE_URL}${path}${token}/`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Crelio POST ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}
