import {
  assignedCompanyId,
  canSeeCompany,
  companiesForScope,
  inferCompanyIdFromParts,
  isStandaloneId,
  seedCompanyForEmail,
  type Company,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import { estimateForJob, estimateHref } from "./estimate-open.ts";
import { isHisWoodRiverJob, isHisWoodRiverPack } from "./his-wood-river.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";
import { packForJob } from "./jobs.ts";
import type { LocalPack } from "./local-estimates.ts";
import type { EstimateRecord, JobRecord, SiteRecord } from "./types.ts";

export const UNASSIGNED_SITE_ID = "site-unassigned";

export type JobTreeSite = {
  id: string;
  name: string;
  city: string;
  client: string;
  assigned: boolean;
  jobs: JobRecord[];
};

export type JobTreeCompany = {
  id: CompanyId;
  name: string;
  sites: JobTreeSite[];
};

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function haystack(...parts: Array<string | undefined | null>) {
  return norm(parts.filter(Boolean).join(" "));
}

export function defaultOpenCompanyId(companies: Array<{ id: CompanyId }>) {
  if (companies.some((row) => row.id === "madison")) return "madison";
  return companies[0]?.id;
}

/** `""` is all collapsed. Only `undefined` (first paint / omitted prop) uses the default. */
export function resolveOpenCompanyId(
  openCompanyId: string | undefined,
  companies: Array<{ id: CompanyId }>,
) {
  if (openCompanyId === undefined) return defaultOpenCompanyId(companies) ?? "";
  return openCompanyId;
}

/** Sticky accordion: null = first paint default; `""` stays all-collapsed. */
export function stickyOpenCompanyId(
  openCompanyId: string | null,
  companies: Array<{ id: CompanyId }>,
) {
  if (openCompanyId === null) return defaultOpenCompanyId(companies) ?? "";
  if (openCompanyId === "") return "";
  if (companies.some((row) => row.id === openCompanyId)) return openCompanyId;
  return defaultOpenCompanyId(companies) ?? "";
}

/** Single-open accordion. Collapsing the open company yields `""` (none open). */
export function toggleOpenCompanyId(
  current: string | null,
  id: string,
  companies: Array<{ id: CompanyId }>,
) {
  const now = current === null ? defaultOpenCompanyId(companies) ?? "" : current;
  return now === id ? "" : id;
}

export function sitesForCompany(companyId: CompanyId, sites: SiteRecord[] = catalogSites()) {
  return sites.filter((site) => inferCompanyIdFromParts(site.client, site.name, site.family, site.city) === companyId);
}

export function matchCatalogSite(text: string, sites: SiteRecord[] = catalogSites()) {
  const hay = norm(text);
  if (!hay) return undefined;
  const woodRiver = sites.find((site) => site.id === "site-madison");
  if (woodRiver && /wood river|roxana|cat 2|mtaajd|unit 3|\bcoker\b/.test(hay)) return woodRiver;
  return sites.find((site) => {
    const name = norm(site.name);
    const city = norm((site.city || "").split(",")[0] || "");
    const code = norm(site.code);
    return Boolean((name && hay.includes(name)) || (city && hay.includes(city)) || (code && hay.includes(code)));
  });
}

function packOwnerHomeCompany(email?: string): CompanyId | null {
  const key = canonicalEmail(email) || (email || "").trim().toLowerCase();
  if (!key || isOwnerIdentity(key)) return null;
  return seedCompanyForEmail(key);
}

export function companyIdForJob(
  job: JobRecord,
  scope?: CompanyScope | null,
  pack?: Pick<LocalPack, "client" | "site" | "siteId" | "ownerEmail" | "packId" | "title">,
) {
  if (isHisWoodRiverPack(pack) || isHisWoodRiverJob(job)) {
    return canSeeCompany(scope, "madison") ? "madison" : assignedCompanyId(scope);
  }
  const inferred = inferCompanyIdFromParts(pack?.client, pack?.site, job.client, job.title, job.code);
  const home = packOwnerHomeCompany(pack?.ownerEmail);
  // CBI-only (and other non-Madison) seats cannot stand in for Madison Wood River.
  if (home && home !== inferred && inferred === "madison") {
    if (canSeeCompany(scope, home)) return home;
    return assignedCompanyId(scope);
  }
  if (canSeeCompany(scope, inferred)) return inferred;
  return assignedCompanyId(scope);
}

export function jobEstimateHref(
  job: JobRecord,
  estimates: EstimateRecord[] = [],
  packs: Array<{ packId: string }> = [],
) {
  const estimate = estimateForJob(job, estimates);
  const pack = packForJob(job, packs, estimate?.id);
  if (pack) return estimateHref(pack.packId);
  if (estimate) return estimateHref(estimate.id);
  if (job.id.startsWith("job-new-")) return estimateHref(job.id.slice(4));
  return undefined;
}

function liveSiteFromPack(pack?: Pick<LocalPack, "site" | "siteId" | "client">): JobTreeSite | null {
  const name = (pack?.site || "").split("—")[0]?.trim() || "";
  if (!name) return null;
  return {
    id: pack?.siteId || `site-live-${norm(name).replace(/\s+/g, "-")}`,
    name,
    city: "",
    client: pack?.client || "",
    assigned: true,
    jobs: [],
  };
}

function emptyUnassigned(): JobTreeSite {
  return {
    id: UNASSIGNED_SITE_ID,
    name: "Not assigned",
    city: "",
    client: "",
    assigned: false,
    jobs: [],
  };
}

export function jobTree(input: {
  scope?: CompanyScope | null;
  jobs: JobRecord[];
  sites?: SiteRecord[];
  packs?: LocalPack[];
  catalog?: Company[];
}): JobTreeCompany[] {
  const sites = input.sites ?? catalogSites();
  const packs = input.packs ?? [];
  const companies = companiesForScope(input.scope, input.catalog);
  const ownerSeesAll = !input.scope || input.scope.isOwner;
  const buckets = new Map<string, JobTreeCompany>();

  for (const company of companies) {
    const catalog = sitesForCompany(company.id, sites).filter((site) =>
      canSeeCompany(input.scope, inferCompanyIdFromParts(site.client, site.name, site.family, site.city)),
    );
    buckets.set(company.id, {
      id: company.id,
      name: company.name,
      // Testers: do not pre-list every catalog plant. Sites appear when this seat has jobs.
      sites: ownerSeesAll
        ? catalog.map((site) => ({
            id: site.id,
            name: site.name,
            city: site.city,
            client: site.client,
            assigned: site.openJobs > 0,
            jobs: [],
          }))
        : [],
    });
  }

  for (const job of input.jobs) {
    const estimateId = undefined;
    const pack = packForJob(job, packs, estimateId);
    const companyId = companyIdForJob(job, input.scope, pack);
    if (isStandaloneId(companyId) || !canSeeCompany(input.scope, companyId)) continue;
    let bucket = buckets.get(companyId);
    if (!bucket) {
      const name = companies.find((row) => row.id === companyId)?.name || companyId;
      bucket = { id: companyId, name, sites: [] };
      buckets.set(companyId, bucket);
    }
    const hay = haystack(job.client, job.title, job.code, pack?.site, pack?.client, pack?.siteId);
    const matched =
      (pack?.siteId ? bucket.sites.find((site) => site.id === pack.siteId) : undefined) ||
      (pack?.siteId ? sites.find((site) => site.id === pack.siteId) : undefined) ||
      matchCatalogSite(hay, sites);
    if (matched) {
      const existing = bucket.sites.find((site) => site.id === matched.id);
      if (existing) {
        existing.assigned = true;
        existing.jobs.push(job);
      } else if (
        canSeeCompany(
          input.scope,
          inferCompanyIdFromParts(matched.client, matched.name, "family" in matched ? matched.family : "", matched.city),
        )
      ) {
        bucket.sites.push({
          id: matched.id,
          name: matched.name,
          city: matched.city,
          client: matched.client,
          assigned: true,
          jobs: [job],
        });
      } else {
        const live = liveSiteFromPack(pack);
        if (live) {
          live.jobs.push(job);
          bucket.sites.push(live);
        } else {
          let unassigned = bucket.sites.find((site) => site.id === UNASSIGNED_SITE_ID);
          if (!unassigned) {
            unassigned = emptyUnassigned();
            bucket.sites.push(unassigned);
          }
          unassigned.jobs.push(job);
          unassigned.assigned = true;
        }
      }
      continue;
    }
    const live = liveSiteFromPack(pack);
    if (live) {
      const existing = bucket.sites.find((site) => site.id === live.id || norm(site.name) === norm(live.name));
      if (existing) {
        existing.assigned = true;
        existing.jobs.push(job);
      } else {
        live.jobs.push(job);
        bucket.sites.push(live);
      }
      continue;
    }
    let unassigned = bucket.sites.find((site) => site.id === UNASSIGNED_SITE_ID);
    if (!unassigned) {
      unassigned = emptyUnassigned();
      bucket.sites.push(unassigned);
    }
    unassigned.jobs.push(job);
    unassigned.assigned = true;
  }

  for (const company of buckets.values()) {
    const hasWork = company.sites.some((site) => site.jobs.length);
    if (ownerSeesAll && !hasWork && !company.sites.some((site) => site.id === UNASSIGNED_SITE_ID)) {
      company.sites.push(emptyUnassigned());
    }
    if (!ownerSeesAll) {
      company.sites = company.sites.filter((site) => site.jobs.length > 0);
    }
    for (const site of company.sites) {
      if (!site.jobs.length) site.assigned = false;
    }
  }

  return companies.map((company) => buckets.get(company.id)).filter((row): row is JobTreeCompany => Boolean(row));
}

/** Catalog sites this seat actually has work on. Empty placeholders are not assigned. */
export function assignedSiteIds(input: {
  scope?: CompanyScope | null;
  jobs: JobRecord[];
  sites?: SiteRecord[];
  packs?: LocalPack[];
  catalog?: Company[];
  companyId?: CompanyId;
}): string[] {
  const tree = jobTree(input);
  const rows = input.companyId ? tree.filter((row) => row.id === input.companyId) : tree;
  return rows.flatMap((company) =>
    company.sites
      .filter((site) => site.jobs.length > 0 && site.id !== UNASSIGNED_SITE_ID)
      .map((site) => site.id),
  );
}

