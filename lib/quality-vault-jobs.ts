import { inferCompanyIdFromParts, isRetiredPeerPack } from "./companies.ts";
import { visibleSeedJobs } from "./jobs.ts";
import type { JobRecord } from "./types.ts";

/** Job identity only — no estimate money, crew, or Drive ids. */
export function qualityVaultJobFromPack(pack: {
  packId: string;
  title?: string;
  client?: string;
  site?: string;
}): JobRecord {
  return {
    id: `job-${pack.packId}`,
    ownerId: "quality-vault",
    code: pack.packId,
    title: pack.title || pack.packId,
    client: pack.client || "",
    discipline: "mechanical",
    kind: "estimate",
    status: "OPEN",
    window: "",
    workingFigure: "",
    hseNote: "",
  };
}

export function qualityVaultJobsFromPacks(
  packs: Array<{ packId: string; title?: string; client?: string; site?: string; siteId?: string }>,
): JobRecord[] {
  const seen = new Set<string>();
  const jobs: JobRecord[] = [];
  for (const pack of packs) {
    if (isRetiredPeerPack(pack)) continue;
    if (inferCompanyIdFromParts(pack.client, pack.site, pack.title, pack.siteId) !== "madison") continue;
    const job = qualityVaultJobFromPack(pack);
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    jobs.push(job);
  }
  return jobs;
}

export function qualityVaultSeedJobs(email: string, role?: string): JobRecord[] {
  return visibleSeedJobs({ isOwner: false, email, companyId: "madison", role }).map((job) => ({
    ...job,
    workingFigure: "",
    hseNote: "",
  }));
}

export function mergeQualityVaultJobs(current: JobRecord[], extra: JobRecord[]) {
  const seen = new Set(current.map((job) => job.id));
  return [...current, ...extra.filter((job) => !seen.has(job.id))];
}
