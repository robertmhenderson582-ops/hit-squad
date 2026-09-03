import { readEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { estimateStorageKey } from "./estimate-open.ts";
import { listLocalPacks, storageKeyForPack, type LocalPack, type StorageLike } from "./local-estimates.ts";

export const QUALITY_TAB_ID = "quality";
export const QUALITY_TAB_LABEL = "Quality";
export const HSE_TAB_ID = "hse";
export const HSE_TAB_LABEL = "HSE";

export function showsQualityHseModules(status = "") {
  return status === "Awarded";
}

export type AwardedJobPick = {
  id: string;
  title: string;
  client: string;
  site: string;
  key: string;
};

export function awardedLocalJobs(
  store?: StorageLike | null,
  packs: LocalPack[] = listLocalPacks(store),
): AwardedJobPick[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  return packs
    .filter((pack) => readEstimateStatus(pack.packId, target as Storage | null) === "Awarded")
    .map((pack) => ({
      id: pack.packId,
      title: pack.title,
      client: pack.client,
      site: pack.site,
      key: storageKeyForPack(pack.packId),
    }));
}

export function awardedBoardJobs(
  estimates: Array<{ id: string; title: string; client: string; siteId?: string; unit?: string }> = [],
  sites: Array<{ id: string; name: string }> = [],
  store?: StorageLike | null,
): AwardedJobPick[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  return estimates
    .filter((row) => readEstimateStatus(row.id, target as Storage | null) === "Awarded")
    .map((row) => ({
      id: row.id,
      title: row.title,
      client: row.client,
      site: sites.find((site) => site.id === row.siteId)?.name || row.unit || "",
      key: estimateStorageKey(row.id),
    }));
}

export function mergeAwardedJobs(local: AwardedJobPick[], board: AwardedJobPick[]) {
  const seen = new Set<string>();
  const out: AwardedJobPick[] = [];
  for (const row of [...local, ...board]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function qualityHseTabIds(status?: EstimateStatus | string) {
  return showsQualityHseModules(status) ? [QUALITY_TAB_ID, HSE_TAB_ID] : [];
}
