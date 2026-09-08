import { catalogSites } from "./desk-data.ts";
import { catalogSeedsAllowedOnDesk, jobsOnDesk, omitCatalogSeedJobs } from "./jobs.ts";
import { clientFolderId } from "./quality-hse-modules.ts";
import { jobTree, type JobTreeCompany } from "./job-tree.ts";
import { isRetiredPeerCompany, isRetiredPeerCompanyName, type CompanyScope } from "./companies.ts";
import type { JobMenuState } from "./job-menu.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";
import type { JobRecord, SiteRecord } from "./types.ts";

/**
 * Quality / HSE job scope.
 *
 * The desks used to key Board / Day-1 / registers by client folder
 * (`hs_*_module_v1:phillips-66`). That smashed every P66 job into one blob.
 *
 * Now the live key is the Jobs-tree job id (`hs_*_module_v1:job:job-new-b1726`).
 * Client → Site → Job picks reuse `jobTree` identities (Phillips 66 / Wood River /
 * Boiler 17), not a second client list. Jobs shows Division above Client;
 * these picks stay Client → Site → Job so Quality / HSE keys do not change.
 *
 * Legacy client-folder blobs stay readable under the old key. The first job
 * opened on that client gets a one-time copy; a claim key stops a second job
 * from inheriting the same board. Switching jobs never writes the client key.
 */

export const QUALITY_JOB_SCOPE_KEY = "hs_quality_job_scope_v1";
export const HSE_JOB_SCOPE_KEY = "hs_hse_job_scope_v1";

export type JobScopePick = {
  clientId: string;
  siteId: string;
  jobId: string;
};

export type JobScopeClient = { id: string; name: string };
export type JobScopeSite = { id: string; name: string; jobCount: number };
export type JobScopeJob = { id: string; title: string; code: string };

export function emptyJobScope(): JobScopePick {
  return { clientId: "", siteId: "", jobId: "" };
}

export function hydrateJobScope(raw: unknown): JobScopePick {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    clientId: typeof row.clientId === "string" ? row.clientId : "",
    siteId: typeof row.siteId === "string" ? row.siteId : "",
    jobId: typeof row.jobId === "string" ? row.jobId : "",
  };
}

export function readJobScope(key: string, store?: StorageLike | null): JobScopePick {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return emptyJobScope();
  try {
    const raw = target.getItem(key);
    if (!raw) return emptyJobScope();
    return hydrateJobScope(JSON.parse(raw));
  } catch {
    return emptyJobScope();
  }
}

export function writeJobScope(key: string, pick: JobScopePick, store?: StorageLike | null) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  try {
    target.setItem(key, JSON.stringify(hydrateJobScope(pick)));
  } catch {
    // keep the previous pick
  }
}

export function applyScopeClient(pick: JobScopePick, clientId: string): JobScopePick {
  return { clientId, siteId: "", jobId: "" };
}

export function applyScopeSite(pick: JobScopePick, siteId: string): JobScopePick {
  return { ...pick, siteId, jobId: "" };
}

export function applyScopeJob(pick: JobScopePick, jobId: string): JobScopePick {
  return { ...pick, jobId };
}

export function cascadeClients(tree: JobTreeCompany[]): JobScopeClient[] {
  const seen = new Map<string, JobScopeClient>();
  for (const company of tree) {
    if (isRetiredPeerCompany(company.id) || isRetiredPeerCompanyName(company.name)) continue;
    for (const client of company.clients) {
      if (isRetiredPeerCompany(client.id) || isRetiredPeerCompanyName(client.name)) continue;
      if (!seen.has(client.id)) seen.set(client.id, { id: client.id, name: client.name });
    }
  }
  return [...seen.values()];
}

export function cascadeSites(tree: JobTreeCompany[], clientId: string): JobScopeSite[] {
  if (!clientId) return [];
  const seen = new Map<string, JobScopeSite>();
  for (const company of tree) {
    const client = company.clients.find((row) => row.id === clientId);
    if (!client) continue;
    for (const site of client.sites) {
      const current = seen.get(site.id);
      const jobCount = site.jobs.length;
      if (!current || jobCount > current.jobCount) {
        seen.set(site.id, { id: site.id, name: site.name, jobCount });
      }
    }
  }
  return [...seen.values()].sort((a, b) => {
    const aWork = a.jobCount > 0 ? 0 : 1;
    const bWork = b.jobCount > 0 ? 0 : 1;
    if (aWork !== bWork) return aWork - bWork;
    return a.name.localeCompare(b.name);
  });
}

export function cascadeJobs(tree: JobTreeCompany[], clientId: string, siteId: string): JobScopeJob[] {
  if (!clientId || !siteId) return [];
  const seen = new Map<string, JobScopeJob>();
  for (const company of tree) {
    const client = company.clients.find((row) => row.id === clientId);
    const site = client?.sites.find((row) => row.id === siteId);
    if (!site) continue;
    for (const job of site.jobs) {
      if (!seen.has(job.id)) seen.set(job.id, { id: job.id, title: job.title, code: job.code });
    }
  }
  return [...seen.values()];
}

/** Drop stale ids after the tree loads. Empty tree leaves the sticky pick alone. */
export function resolveJobScope(pick: JobScopePick, tree: JobTreeCompany[]): JobScopePick {
  const clients = cascadeClients(tree);
  if (!clients.length) return pick;
  if (pick.clientId && !clients.some((row) => row.id === pick.clientId)) return emptyJobScope();
  const sites = cascadeSites(tree, pick.clientId);
  if (pick.siteId && !sites.some((row) => row.id === pick.siteId)) {
    return { clientId: pick.clientId, siteId: "", jobId: "" };
  }
  const jobs = cascadeJobs(tree, pick.clientId, pick.siteId);
  if (pick.jobId && !jobs.some((row) => row.id === pick.jobId)) {
    return { clientId: pick.clientId, siteId: pick.siteId, jobId: "" };
  }
  return pick;
}

export function moduleJobKey(prefix: string, jobId: string) {
  return `${prefix}job:${jobId.trim()}`;
}

export function moduleLegacyClaimKey(prefix: string, folder: string) {
  return `${prefix}legacy-claim:${clientFolderId(folder)}`;
}

/**
 * Copy a leftover client-folder blob onto the first job that opens it.
 * Later jobs on that client start empty. The old folder key stays readable.
 */
export function attachLegacyClientModule(
  store: StorageLike | null | undefined,
  opts: { jobKey: string; folderKey: string; claimKey: string },
): string | null {
  if (!store) return null;
  try {
    const existing = store.getItem(opts.jobKey);
    if (existing) return existing;
    if (store.getItem(opts.claimKey)) return null;
    const raw = store.getItem(opts.folderKey);
    if (!raw) return null;
    store.setItem(opts.jobKey, raw);
    store.setItem(opts.claimKey, JSON.stringify({ jobKey: opts.jobKey, at: new Date().toISOString() }));
    return raw;
  } catch {
    return null;
  }
}

/** Same job list the Jobs tree uses for this seat — awarded, Locked, and live packs. */
export function qualityHseJobTree(input: {
  scope?: CompanyScope | null;
  serverJobs?: JobRecord[];
  packs?: LocalPack[];
  sites?: SiteRecord[];
  viewingAs?: boolean;
  seat?: string | null;
  menu?: JobMenuState | null;
}): JobTreeCompany[] {
  const packs = input.packs ?? [];
  const includeSeeds = catalogSeedsAllowedOnDesk(input.scope, input.seat);
  const deskJobs = jobsOnDesk(input.serverJobs ?? [], packs, Boolean(input.viewingAs), input.scope, input.menu, {
    includeSeeds,
    seat: input.seat,
  });
  return jobTree({
    scope: input.scope,
    jobs: includeSeeds ? deskJobs : omitCatalogSeedJobs(deskJobs),
    sites: input.sites ?? catalogSites(),
    packs,
  });
}
