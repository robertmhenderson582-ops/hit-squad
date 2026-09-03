import { isClosed } from "./desk-closeout.ts";
import { readEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { estimateStorageKey } from "./estimate-open.ts";
import { listLocalPacks, storageKeyForPack, type LocalPack, type StorageLike } from "./local-estimates.ts";

export const QUALITY_TAB_ID = "quality";
export const QUALITY_TAB_LABEL = "Quality";
export const HSE_TAB_ID = "hse";
export const HSE_TAB_LABEL = "HSE";

export const OPEN_JOB_EMPTY_COPY = "Open or pick a job.";

/** Quality and HSE stay on while the job is being worked — not Awarded-only. */
export function showsQualityHseModules(status = "") {
  return status === "Estimate" || status === "Submitted" || status === "Awarded";
}

export type JobPick = {
  id: string;
  title: string;
  client: string;
  site: string;
  key: string;
  status: EstimateStatus;
};

export type AwardedJobPick = JobPick;

function packToJob(pack: LocalPack, store?: StorageLike | null): JobPick {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  return {
    id: pack.packId,
    title: pack.title,
    client: pack.client,
    site: pack.site,
    key: storageKeyForPack(pack.packId),
    status: readEstimateStatus(pack.packId, target as Storage | null),
  };
}

export function openLocalJobs(
  store?: StorageLike | null,
  packs: LocalPack[] = listLocalPacks(store),
): JobPick[] {
  return packs.filter((pack) => !pack.archived).map((pack) => packToJob(pack, store));
}

export function awardedLocalJobs(
  store?: StorageLike | null,
  packs: LocalPack[] = listLocalPacks(store),
): JobPick[] {
  return openLocalJobs(store, packs).filter((row) => row.status === "Awarded");
}

export function openBoardJobs(
  estimates: Array<{ id: string; title: string; client: string; siteId?: string; unit?: string }> = [],
  sites: Array<{ id: string; name: string }> = [],
  store?: StorageLike | null,
): JobPick[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  return estimates.map((row) => ({
    id: row.id,
    title: row.title,
    client: row.client,
    site: sites.find((site) => site.id === row.siteId)?.name || row.unit || "",
    key: estimateStorageKey(row.id),
    status: readEstimateStatus(row.id, target as Storage | null),
  }));
}

export function awardedBoardJobs(
  estimates: Array<{ id: string; title: string; client: string; siteId?: string; unit?: string }> = [],
  sites: Array<{ id: string; name: string }> = [],
  store?: StorageLike | null,
): JobPick[] {
  return openBoardJobs(estimates, sites, store).filter((row) => row.status === "Awarded");
}

export function mergeOpenJobs(local: JobPick[], board: JobPick[]) {
  const seen = new Set<string>();
  const out: JobPick[] = [];
  for (const row of [...local, ...board]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export const mergeAwardedJobs = mergeOpenJobs;

export function pickOpenJob<T extends { id: string }>(jobs: T[], picked = ""): T | null {
  if (picked) {
    const found = jobs.find((row) => row.id === picked);
    if (found) return found;
  }
  return jobs[0] ?? null;
}

export function dropClosedJobs(jobs: JobPick[], closed: (id: string) => boolean = isClosed) {
  return jobs.filter((row) => !closed(row.id));
}

export function qualityHseTabIds(status?: EstimateStatus | string) {
  return showsQualityHseModules(status) ? [QUALITY_TAB_ID, HSE_TAB_ID] : [];
}
