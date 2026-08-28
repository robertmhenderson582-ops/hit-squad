import {
  assignedCompanyId,
  canSeeCompany,
  companiesForScope,
  inferCompanyIdFromParts,
  type Company,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import { estimateForJob, estimateHref } from "./estimate-open.ts";
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

export function sitesForCompany(companyId: CompanyId, sites: SiteRecord[] = catalogSites()) {
  return sites.filter((site) => inferCompanyIdFromParts(site.client, site.name, site.family, site.city) === companyId);
}

export function matchCatalogSite(text: string, sites: SiteRecord[] = catalogSites()) {
  const hay = norm(text);
  if (!hay) return undefined;
  const coker = sites.find((site) => site.id === "site-coker-pad");
  if (coker && /\bcoker\b/.test(hay)) return coker;
  const woodRiver = sites.find((site) => site.id === "site-madison");
  if (woodRiver && /wood river|roxana|cat 2|mtaajd|unit 3/.test(hay)) return woodRiver;
  return sites.find((site) => {
    const name = norm(site.name);
    const city = norm((site.city || "").split(",")[0] || "");
    const code = norm(site.code);
    return Boolean((name && hay.includes(name)) || (city && hay.includes(city)) || (code && hay.includes(code)));
  });
}

export function companyIdForJob(
  job: JobRecord,
  scope?: CompanyScope | null,
  pack?: Pick<LocalPack, "client" | "site" | "siteId">,
) {
  const inferred = inferCompanyIdFromParts(pack?.client, pack?.site, job.client, job.title, job.code);
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
  const buckets = new Map<string, JobTreeCompany>();

  for (const company of companies) {
    const catalog = sitesForCompany(company.id, sites).filter((site) =>
      canSeeCompany(input.scope, inferCompanyIdFromParts(site.client, site.name, site.family, site.city)),
    );
    buckets.set(company.id, {
      id: company.id,
      name: company.name,
      sites: catalog.map((site) => ({
        id: site.id,
        name: site.name,
        city: site.city,
        client: site.client,
        assigned: site.openJobs > 0,
        jobs: [],
      })),
    });
  }

  for (const job of input.jobs) {
    const estimateId = undefined;
    const pack = packForJob(job, packs, estimateId);
    const companyId = companyIdForJob(job, input.scope, pack);
    if (!canSeeCompany(input.scope, companyId)) continue;
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
    if (!hasWork && !company.sites.some((site) => site.id === UNASSIGNED_SITE_ID)) {
      company.sites.push(emptyUnassigned());
    }
    for (const site of company.sites) {
      if (!site.jobs.length) site.assigned = false;
    }
  }

  return companies.map((company) => buckets.get(company.id)).filter((row): row is JobTreeCompany => Boolean(row));
}

