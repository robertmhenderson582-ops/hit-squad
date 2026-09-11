import { hasBuildDesk, isQualityVaultSeat } from "./desk-role.ts";
import { driveAdapter, listDrivePacks } from "./drive-estimates.ts";
import { mergeQualityVaultJobs, qualityVaultJobsFromPacks, qualityVaultSeedJobs } from "./quality-vault-jobs.ts";
import type { JobRecord } from "./types.ts";

export async function listQualityVaultJobs(user: { email: string; role?: string }): Promise<JobRecord[]> {
  if (!isQualityVaultSeat(user) && !hasBuildDesk(user)) return [];
  const seeds = qualityVaultSeedJobs(user.email, user.role);
  const drive = driveAdapter();
  if (!drive.configured) return seeds;
  try {
    return mergeQualityVaultJobs(seeds, qualityVaultJobsFromPacks(await listDrivePacks(drive)));
  } catch {
    return seeds;
  }
}
