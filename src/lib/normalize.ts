// India mobile normalization: digits only, then drop a leading 91 (country code)
// or a leading 0, so the same number sent differently across centres (e.g.
// "919483506259" vs "9483506259") collapses to one patient.
export function normalizeMobile(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d || null;
}
