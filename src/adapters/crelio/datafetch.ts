import { crelioPostForm } from "./client";
import type { CentreId } from "./types";

// Reference-data lists (corporates, referral doctors). Auth via tokenObj form.

export interface CrelioOrg {
  orgId: number;
  name: string;
  code: string | null;
  city: string | null;
}

export async function listOrganizations(centreId: CentreId): Promise<CrelioOrg[]> {
  const raw = await crelioPostForm<any>(centreId, "/androidOrganizationListForCC/");

  if (raw?.code && raw.code !== 200) {
    throw new Error(`Crelio org list error: ${raw.Message ?? `code ${raw.code}`}`);
  }

  const list: any[] = raw?.orgList ?? raw?.organizationList ?? raw?.data ?? (Array.isArray(raw) ? raw : []);
  return list
    .map((o) => ({
      orgId: Number(o.orgId ?? o.organizationId ?? o.id),
      name: String(o.orgFullName ?? o.organisationName ?? o.name ?? "").trim(),
      code: o.orgCode ?? null,
      city: o.orgCity ?? null,
    }))
    .filter((o) => o.orgId && o.name);
}
