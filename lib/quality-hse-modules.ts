import { readEstimateStatus, resolveEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { estimateStorageKey } from "./estimate-open.ts";
import { listLocalPacks, storageKeyForPack, type LocalPack, type StorageLike } from "./local-estimates.ts";

export const QUALITY_TAB_ID = "quality";
export const QUALITY_TAB_LABEL = "Quality";
export const HSE_TAB_ID = "hse";
export const HSE_TAB_LABEL = "HSE";

/**
 * GOAL: the estimate notifies Quality/HSE when a job is Awarded.
 * V1.51 keeps that hinge in code and leaves it off. A later lead ask turns this on.
 */
export const QUALITY_HSE_INTERACTION_ACTIVE = false;

/** Awarded hinge. True when the estimate would notify Quality/HSE. Does not fire by itself. */
export function qualityHseAwardedHinge(status = "") {
  return status === "Awarded";
}

/**
 * Interaction gate. Inactive for V1.51 — no estimate tabs, no Job setup doors, no fired notify.
 * Chance, Wendell, and Benny still fill /quality and /hse on their own.
 */
export function showsQualityHseModules(status = "") {
  return QUALITY_HSE_INTERACTION_ACTIVE && qualityHseAwardedHinge(status);
}

export function qualityHseTabIds(status?: EstimateStatus | string) {
  return showsQualityHseModules(status) ? [QUALITY_TAB_ID, HSE_TAB_ID] : [];
}

/** Quiet Job setup doors. Mount only when a lead asks. V1.51 does not mount this. */
export function qualityHseQuietDoorsOn(status = "") {
  return showsQualityHseModules(status);
}

export const CLIENT_FOLDERS = [
  { id: "phillips-66", label: "Phillips 66" },
  { id: "georgia-power", label: "Georgia Power" },
  { id: "other", label: "Other" },
] as const;

export type ClientFolderId = (typeof CLIENT_FOLDERS)[number]["id"];

/** Ironwood and Phillips 66 share phillips-66. */
export function clientFolderId(label = ""): ClientFolderId {
  const hay = label.trim().toLowerCase();
  if (/phillips|p66|ironwood/.test(hay)) return "phillips-66";
  if (/georgia|piedmont/.test(hay)) return "georgia-power";
  if (hay === "other") return "other";
  return "other";
}

export { emptyRegisterRow, hydrateRegisterRows, type ModuleRegisterRow } from "./register-rows.ts";

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
    .filter(
      (pack) =>
        resolveEstimateStatus(pack.status, pack.packId, target as Storage | null, pack.site, pack.client) === "Awarded",
    )
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
