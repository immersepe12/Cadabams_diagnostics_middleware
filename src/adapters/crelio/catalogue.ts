import { supabase } from "../../lib/supabase";
import { crelioGet } from "./client";
import type { CentreId } from "./types";

export async function syncCatalogue(centreId: CentreId): Promise<{ synced: number }> {
  const raw = await crelioGet<any>(centreId, "/getAllTestsAndProfiles/");

  // Crelio signals errors (e.g. bad token) with a non-200 `code` + `Message`,
  // returned over HTTP 200 — surface it instead of silently syncing nothing.
  if (raw?.code && raw.code !== 200) {
    throw new Error(`Crelio catalogue error for ${centreId}: ${raw.Message ?? `code ${raw.code}`}`);
  }

  // Real shape: { code, testList: [atomic tests], profileTestList: [panels] }.
  // Each item has testID / testName / departmentName.
  const tests: any[] = [...(raw?.testList ?? []), ...(raw?.profileTestList ?? [])];

  if (!tests.length) {
    console.warn(`syncCatalogue: no tests returned for ${centreId}`);
    return { synced: 0 };
  }

  // Upsert in batches of 100
  const BATCH = 100;
  let synced = 0;

  for (let i = 0; i < tests.length; i += BATCH) {
    const batch = tests.slice(i, i + BATCH).map((t) => ({
      centre_id: centreId,
      crelio_test_id: String(t.testID ?? t.testId),
      test_name: t.testName,
      department: t.departmentName ?? t.department ?? null,
      is_active: true,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("catalogue_tests")
      .upsert(batch, { onConflict: "centre_id,crelio_test_id" });

    if (error) throw new Error(`Catalogue upsert failed for ${centreId}: ${error.message}`);
    synced += batch.length;
  }

  return { synced };
}

export async function syncAllCentres(): Promise<Record<CentreId, number>> {
  const centres: CentreId[] = ["KYL", "JNR", "KKP", "BSK"];
  const results = {} as Record<CentreId, number>;

  await Promise.all(
    centres.map(async (centreId) => {
      try {
        const { synced } = await syncCatalogue(centreId);
        results[centreId] = synced;
      } catch (err) {
        console.error(`syncCatalogue failed for ${centreId}:`, err);
        results[centreId] = -1;
      }
    })
  );

  return results;
}
