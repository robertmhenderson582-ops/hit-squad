import {
  assignedCompanyId,
  canSeeCompany,
  companiesForScope,
  inferCompanyIdFromParts,
  isRetiredPeerCompany,
  isRetiredPeerCompanyName,
  isStandaloneId,
  seedCompanyForEmail,
  type Company,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import {
  divisionsForCompany,
  inferDivisionId,
  MECHANICAL_DIVISION_ID,
  POWER_DIVISION_ID,
  PULP_AND_PAPER_DIVISION_ID,
  seedDivisions,
  type Division,
} from "./divisions.ts";
import { estimateForJob, estimateHref } from "./estimate-open.ts";
import { isHisWoodRiverJob, isHisWoodRiverPack } from "./his-wood-river.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";
import { jobPlantHref, packForJob, plantSlugForSite } from "./jobs.ts";
import type { LocalPack } from "./local-estimates.ts";
import { isWakeIdentityOnly, wakeMatchForPack, type WakePackHint } from "./rodeo-monroe-wake.ts";
import type { EstimateRecord, JobRecord, SiteRecord } from "./types.ts";

export const UNASSIGNED_SITE_ID = "site-unassigned";

export const PHILLIPS_66_CLIENT_ID = "phillips-66";
export const GEORGIA_POWER_CLIENT_ID = "georgia-power";
export const MONROE_ENERGY_CLIENT_ID = "monroe-energy";
export const OTHER_CLIENT_ID = "other";

/** Yates is Georgia Power. Never list it under Phillips 66. */
export const JOB_TREE_CLIENT_SITE_IDS = {
  [PHILLIPS_66_CLIENT_ID]: ["site-madison", "site-rodeo", "site-bayway", "site-ferndale", "site-billings"],
  [GEORGIA_POWER_CLIENT_ID]: ["site-yates"],
  [MONROE_ENERGY_CLIENT_ID]: ["site-monroe"],
} as const;

const MADISON_CLIENT_ORDER = [PHILLIPS_66_CLIENT_ID, GEORGIA_POWER_CLIENT_ID, MONROE_ENERGY_CLIENT_ID] as const;

export type JobTreeSite = {
  id: string;
  name: string;
  city: string;
  client: string;
  assigned: boolean;
  jobs: JobRecord[];
};

export type JobTreeClient = {
  id: string;
  name: string;
  sites: JobTreeSite[];
};

export type JobTreeDivision = {
  id: string;
  name: string;
  code: string;
  clients: JobTreeClient[];
};

export type JobTreeCompany = {
  id: CompanyId;
  name: string;
  divisions: JobTreeDivision[];
  /** Flattened clients across divisions — Quality / HSE still cascade Client → Site → Job. */
  clients: JobTreeClient[];
  /** Flattened sites across clients — HIS / cards still look up Wood River here. */
  sites: JobTreeSite[];
};

type ClientHost = { clients: JobTreeClient[] };

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

export function siteTreeKey(companyId: string, siteId: string) {
  return `${companyId}:${siteId}`;
}

export function clientTreeKey(companyId: string, clientId: string) {
  return `${companyId}:client:${clientId}`;
}

export function divisionTreeKey(companyId: string, divisionId: string) {
  return `${companyId}:division:${divisionId}`;
}

/** Clients always collapse so a PM can hide a whole owner (P66 / Georgia Power). */
export function clientIsCollapsible() {
  return true;
}

/** Divisions always collapse so a PM can hide Mechanical / Power / Pulp and Paper. */
export function divisionIsCollapsible() {
  return true;
}

/** Empty clients start collapsed. Clients with jobs start open. Explicit keys win. */
export function defaultCollapsedClientKeys(tree: Array<{ id: string; clients: JobTreeClient[] }>) {
  const keys = new Set<string>();
  for (const company of tree) {
    for (const client of company.clients) {
      if (!client.sites.some((site) => site.jobs.length > 0)) {
        keys.add(clientTreeKey(company.id, client.id));
      }
    }
  }
  return keys;
}

function divisionHasWork(division: { clients: readonly { sites: readonly { jobs: readonly unknown[] }[] }[] }) {
  return division.clients.some((client) => client.sites.some((site) => site.jobs.length > 0));
}

/** Empty divisions start collapsed. Divisions with jobs start open. Explicit keys win. */
export function defaultCollapsedDivisionKeys(tree: Array<{ id: string; divisions: JobTreeDivision[] }>) {
  const keys = new Set<string>();
  for (const company of tree) {
    for (const division of company.divisions) {
      if (!divisionHasWork(division)) {
        keys.add(divisionTreeKey(company.id, division.id));
      }
    }
  }
  return keys;
}

export function resolveDivisionOpen(
  collapsed: ReadonlySet<string>,
  companyId: string,
  division: { id: string; clients: readonly { sites: readonly { jobs: readonly unknown[] }[] }[] },
) {
  const key = divisionTreeKey(companyId, division.id);
  if (collapsed.has(key)) return false;
  if (!divisionHasWork(division) && !collapsed.has(`open:${key}`)) {
    return false;
  }
  return true;
}

export function toggleCollapsedDivision(
  collapsed: ReadonlySet<string>,
  companyId: string,
  division: { id: string; clients: readonly { sites: readonly { jobs: readonly unknown[] }[] }[] },
) {
  const next = new Set(collapsed);
  const key = divisionTreeKey(companyId, division.id);
  const openKey = `open:${key}`;
  const open = resolveDivisionOpen(collapsed, companyId, division);
  if (open) {
    next.add(key);
    next.delete(openKey);
  } else {
    next.delete(key);
    next.add(openKey);
  }
  return next;
}

export function resolveClientOpen(
  collapsed: ReadonlySet<string>,
  companyId: string,
  client: { id: string; sites: readonly { jobs: readonly unknown[] }[] },
) {
  const key = clientTreeKey(companyId, client.id);
  if (collapsed.has(key)) return false;
  if (!client.sites.some((site) => site.jobs.length > 0) && !collapsed.has(`open:${key}`)) {
    return false;
  }
  return true;
}

export function toggleCollapsedClient(
  collapsed: ReadonlySet<string>,
  companyId: string,
  client: { id: string; sites: readonly { jobs: readonly unknown[] }[] },
) {
  const next = new Set(collapsed);
  const key = clientTreeKey(companyId, client.id);
  const openKey = `open:${key}`;
  const open = resolveClientOpen(collapsed, companyId, client);
  if (open) {
    next.add(key);
    next.delete(openKey);
  } else {
    next.delete(key);
    next.add(openKey);
  }
  return next;
}

/** Only sites with 2+ jobs/estimates collapse. 0–1 stay open. */
export function siteIsCollapsible(site: { jobs: readonly unknown[] }) {
  return site.jobs.length >= 2;
}

/** Missing key = expanded (first paint). Collapsed keys stay collapsed across re-renders. */
export function resolveSiteOpen(
  collapsed: ReadonlySet<string>,
  companyId: string,
  site: { id: string; jobs: readonly unknown[] },
) {
  if (!siteIsCollapsible(site)) return true;
  return !collapsed.has(siteTreeKey(companyId, site.id));
}

export function toggleCollapsedSite(
  collapsed: ReadonlySet<string>,
  companyId: string,
  site: { id: string; jobs: readonly unknown[] },
) {
  const next = new Set(collapsed);
  if (!siteIsCollapsible(site)) return next;
  const key = siteTreeKey(companyId, site.id);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
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

export function jobTreeClientId(...parts: Array<string | undefined | null>) {
  const hay = haystack(...parts);
  // Yates / Bowen / Scherer are Georgia Power even if someone also typed P66.
  if (/georgia|piedmont|\byates\b|\bbowen\b|\bscherer\b/.test(hay)) return GEORGIA_POWER_CLIENT_ID;
  if (/phillips|\bp66\b|ironwood|rodeo|bayway|ferndale|wood river|roxana|billings/.test(hay)) {
    return PHILLIPS_66_CLIENT_ID;
  }
  if (/monroe|trainer/.test(hay)) return MONROE_ENERGY_CLIENT_ID;
  if (/\bcbi\b/.test(hay) || /lucky\s*13/.test(hay)) return OTHER_CLIENT_ID;
  if (!hay) return OTHER_CLIENT_ID;
  return `client-${norm(hay).replace(/\s+/g, "-").slice(0, 40)}`;
}

export function jobTreeClientLabel(id: string, fallback = "") {
  if (id === PHILLIPS_66_CLIENT_ID) return "Phillips 66";
  if (id === GEORGIA_POWER_CLIENT_ID) return "Georgia Power";
  if (id === MONROE_ENERGY_CLIENT_ID) return "Monroe Energy";
  if (id === OTHER_CLIENT_ID) return fallback.trim() || "Other";
  if (isRetiredPeerCompany(id) || isRetiredPeerCompanyName(fallback)) return "Other";
  return fallback.trim() || "Other";
}

export function clientIdForSite(site: { id?: string; client?: string; name?: string; family?: string }) {
  if (site.id) {
    for (const [clientId, siteIds] of Object.entries(JOB_TREE_CLIENT_SITE_IDS)) {
      if ((siteIds as readonly string[]).includes(site.id)) return clientId;
    }
  }
  const labeled = `${site.family || ""} ${site.client || ""}`.trim();
  if (labeled) return jobTreeClientId(labeled, site.name);
  return jobTreeClientId(site.client, site.name, site.family);
}

export function matchCatalogSite(text: string, sites: SiteRecord[] = catalogSites()) {
  const hay = norm(text);
  if (!hay) return undefined;
  const rodeo = sites.find((site) => site.id === "site-rodeo");
  if (rodeo && /\bu110\b|\bu250\b|u-250|unit 110|unit 250/.test(hay) && !/wood river|roxana|cat 2|mtaajd/.test(hay)) {
    return rodeo;
  }
  const monroe = sites.find((site) => site.id === "site-monroe");
  if (monroe && /\b541v\b|u541|u541\s+vac/.test(hay) && !/wood river|roxana/.test(hay)) return monroe;
  const woodRiver = sites.find((site) => site.id === "site-madison");
  if (woodRiver && /wood river|roxana|cat 2|mtaajd|unit 3|\bcoker\b|boiler 17|b1726/.test(hay)) return woodRiver;
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
  // Retired peer seats (and other non-Madison homes) cannot stand in for Madison Wood River.
  if (home && home !== inferred && inferred === "madison") {
    if (canSeeCompany(scope, home)) return home;
    return assignedCompanyId(scope);
  }
  if (canSeeCompany(scope, inferred)) return inferred;
  // President stays on Madison work. Do not park Hit Squad-only cards on his tree.
  if (scope?.role === "president") return inferred;
  return assignedCompanyId(scope);
}

export function jobEstimateHref(
  job: JobRecord,
  estimates: EstimateRecord[] = [],
  packs: WakePackHint[] = [],
) {
  const estimate = estimateForJob(job, estimates);
  const pack = packForJob(job, packs, estimate?.id);
  if (pack && isWakeIdentityOnly(pack)) {
    const shell = wakeMatchForPack(pack);
    return jobPlantHref(
      job.code,
      undefined,
      plantSlugForSite(pack.siteId || shell?.siteId, pack.site || shell?.site) || shell?.plantSlug,
    );
  }
  if (pack) return estimateHref(pack.packId);
  if (estimate) return estimateHref(estimate.id);
  if (job.id.startsWith("job-new-")) return estimateHref(job.id.slice(4));
  return undefined;
}

function liveSiteFromPack(pack?: Pick<LocalPack, "site" | "siteId" | "client">): JobTreeSite | null {
  const name = (pack?.site || "").split("—")[0]?.trim() || "";
  if (!name) return null;
  const id = pack?.siteId || `site-live-${norm(name).replace(/\s+/g, "-")}`;
  return {
    id,
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
    name: "Unplaced",
    city: "",
    client: "",
    assigned: false,
    jobs: [],
  };
}

function emptyCompany(id: CompanyId, name: string): JobTreeCompany {
  return { id, name, divisions: [], clients: [], sites: [] };
}

function ensureDivision(company: JobTreeCompany, row: Pick<Division, "id" | "name" | "code">): JobTreeDivision {
  let division = company.divisions.find((item) => item.id === row.id);
  if (!division) {
    division = { id: row.id, name: row.name, code: row.code || "", clients: [] };
    company.divisions.push(division);
  } else {
    if (!division.name && row.name) division.name = row.name;
    if (!division.code && row.code) division.code = row.code;
  }
  return division;
}

function ensureClient(host: ClientHost, id: string, name: string): JobTreeClient {
  let client = host.clients.find((row) => row.id === id);
  if (!client) {
    client = { id, name, sites: [] };
    host.clients.push(client);
  } else if (!client.name && name) {
    client.name = name;
  }
  return client;
}

function hostsOnCompany(company: JobTreeCompany): ClientHost[] {
  return company.divisions.length ? company.divisions : [company];
}

function findSiteOnCompany(company: JobTreeCompany, pred: (site: JobTreeSite) => boolean): JobTreeSite | undefined {
  for (const host of hostsOnCompany(company)) {
    for (const client of host.clients) {
      const hit = client.sites.find(pred);
      if (hit) return hit;
    }
  }
  return undefined;
}

function pushSite(host: ClientHost, clientId: string, clientName: string, site: JobTreeSite) {
  const client = ensureClient(host, clientId, clientName);
  client.sites.push(site);
  return site;
}

function placeJob(
  host: ClientHost,
  company: JobTreeCompany,
  site: JobTreeSite,
  job: JobRecord,
  clientId: string,
  clientName: string,
) {
  const existing = findSiteOnCompany(company, (row) => row.id === site.id || norm(row.name) === norm(site.name));
  if (existing) {
    existing.assigned = true;
    existing.jobs.push(job);
    if (!existing.client && site.client) existing.client = site.client;
    return existing;
  }
  const next = { ...site, assigned: true, jobs: [...site.jobs, job] };
  return pushSite(host, clientId, clientName, next);
}

function hostForDivision(company: JobTreeCompany, catalog: Division[], ...parts: Array<string | undefined | null>): ClientHost {
  const rows = divisionsForCompany(company.id, catalog);
  if (!rows.length) return company;
  const inferred = inferDivisionId(company.id, ...parts);
  const match = rows.find((row) => row.id === inferred) || rows[0];
  return ensureDivision(company, match);
}

function clientMetaForSite(
  site: { id?: string; client?: string; name?: string; family?: string },
  pack?: Pick<LocalPack, "client" | "site">,
) {
  const id = clientIdForSite({
    id: site.id,
    client: site.client || pack?.client,
    name: site.name,
    family: "family" in site ? String(site.family || "") : "",
  });
  const name = jobTreeClientLabel(id, site.client || pack?.client || "");
  return { id, name };
}

function flattenCompanyTree(company: JobTreeCompany) {
  if (company.divisions.length) {
    company.clients = company.divisions.flatMap((division) => division.clients);
  }
  company.sites = company.clients.flatMap((client) => client.sites);
}

function sortClientList(clients: JobTreeClient[]) {
  clients.sort((a, b) => {
    const aIdx = MADISON_CLIENT_ORDER.indexOf(a.id as (typeof MADISON_CLIENT_ORDER)[number]);
    const bIdx = MADISON_CLIENT_ORDER.indexOf(b.id as (typeof MADISON_CLIENT_ORDER)[number]);
    const aRank = aIdx === -1 ? 100 : aIdx;
    const bRank = bIdx === -1 ? 100 : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
  for (const client of clients) {
    client.sites.sort((a, b) => {
      const aWork = a.jobs.length > 0 ? 0 : 1;
      const bWork = b.jobs.length > 0 ? 0 : 1;
      if (aWork !== bWork) return aWork - bWork;
      return 0;
    });
  }
}

function sortDivisions(company: JobTreeCompany) {
  const order = [MECHANICAL_DIVISION_ID, POWER_DIVISION_ID, PULP_AND_PAPER_DIVISION_ID];
  company.divisions.sort((a, b) => {
    const aIdx = order.indexOf(a.id);
    const bIdx = order.indexOf(b.id);
    const aRank = aIdx === -1 ? 100 : aIdx;
    const bRank = bIdx === -1 ? 100 : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

function sortClients(company: JobTreeCompany) {
  sortDivisions(company);
  for (const division of company.divisions) sortClientList(division.clients);
  sortClientList(company.clients);
}

export function jobTree(input: {
  scope?: CompanyScope | null;
  jobs: JobRecord[];
  sites?: SiteRecord[];
  packs?: LocalPack[];
  catalog?: Company[];
  divisions?: Division[];
}): JobTreeCompany[] {
  const sites = input.sites ?? catalogSites();
  const packs = input.packs ?? [];
  const companies = companiesForScope(input.scope, input.catalog);
  const divisionCatalog = input.divisions ?? seedDivisions();
  const ownerSeesAll = !input.scope || input.scope.isOwner;
  const buckets = new Map<string, JobTreeCompany>();

  for (const company of companies) {
    const catalog = sitesForCompany(company.id, sites).filter((site) =>
      canSeeCompany(input.scope, inferCompanyIdFromParts(site.client, site.name, site.family, site.city)),
    );
    const bucket = emptyCompany(company.id, company.name);
    for (const division of divisionsForCompany(company.id, divisionCatalog)) {
      ensureDivision(bucket, division);
    }
    if (ownerSeesAll) {
      for (const site of catalog) {
        const client = clientMetaForSite(site);
        const host = hostForDivision(bucket, divisionCatalog, site.client, site.name, site.family, site.city);
        pushSite(host, client.id, client.name, {
          id: site.id,
          name: site.name,
          city: site.city,
          client: site.client,
          assigned: site.openJobs > 0,
          jobs: [],
        });
      }
      if (company.id === "madison") {
        const mechanical = ensureDivision(bucket, {
          id: MECHANICAL_DIVISION_ID,
          name: "Mechanical",
          code: "307000",
        });
        const power = ensureDivision(bucket, { id: POWER_DIVISION_ID, name: "Power", code: "303000" });
        ensureClient(mechanical, PHILLIPS_66_CLIENT_ID, jobTreeClientLabel(PHILLIPS_66_CLIENT_ID));
        ensureClient(power, GEORGIA_POWER_CLIENT_ID, jobTreeClientLabel(GEORGIA_POWER_CLIENT_ID));
      }
    }
    buckets.set(company.id, bucket);
  }

  for (const job of input.jobs) {
    const estimateId = undefined;
    const pack = packForJob(job, packs, estimateId);
    const companyId = companyIdForJob(job, input.scope, pack);
    const inferred = inferCompanyIdFromParts(pack?.client, pack?.site, job.client, job.title, job.code);
    if (
      isStandaloneId(companyId) ||
      isRetiredPeerCompany(companyId) ||
      isRetiredPeerCompany(inferred) ||
      isRetiredPeerCompanyName(pack?.client) ||
      isRetiredPeerCompanyName(job.client) ||
      !canSeeCompany(input.scope, companyId)
    ) {
      continue;
    }
    let bucket = buckets.get(companyId);
    if (!bucket) {
      const name = companies.find((row) => row.id === companyId)?.name || companyId;
      bucket = emptyCompany(companyId, name);
      for (const division of divisionsForCompany(companyId, divisionCatalog)) {
        ensureDivision(bucket, division);
      }
      buckets.set(companyId, bucket);
    }
    const hay = haystack(job.client, job.title, job.code, pack?.site, pack?.client, pack?.siteId);
    const matched =
      (pack?.siteId ? findSiteOnCompany(bucket, (site) => site.id === pack.siteId) : undefined) ||
      (pack?.siteId ? sites.find((site) => site.id === pack.siteId) : undefined) ||
      matchCatalogSite(hay, sites);
    const place = (site: JobTreeSite, clientId: string, clientName: string) => {
      const host = hostForDivision(
        bucket!,
        divisionCatalog,
        site.client,
        site.name,
        pack?.client,
        pack?.site,
        job.client,
        job.title,
      );
      placeJob(host, bucket!, site, job, clientId, clientName);
    };
    if (matched) {
      const visible = canSeeCompany(
        input.scope,
        inferCompanyIdFromParts(matched.client, matched.name, "family" in matched ? matched.family : "", matched.city),
      );
      if (visible || findSiteOnCompany(bucket, (site) => site.id === matched.id)) {
        const client = clientMetaForSite(matched, pack);
        place(
          {
            id: matched.id,
            name: matched.name,
            city: "city" in matched ? matched.city : "",
            client: matched.client,
            assigned: true,
            jobs: [],
          },
          client.id,
          client.name,
        );
        continue;
      }
      const live = liveSiteFromPack(pack);
      if (live) {
        const client = clientMetaForSite(live, pack);
        place(live, client.id, client.name);
      } else {
        const client = clientMetaForSite({ client: pack?.client, name: pack?.site }, pack);
        place(emptyUnassigned(), client.id, client.name);
      }
      continue;
    }
    const live = liveSiteFromPack(pack);
    if (live) {
      const client = clientMetaForSite(live, pack);
      place(live, client.id, client.name);
      continue;
    }
    const client = clientMetaForSite({ client: pack?.client || job.client, name: pack?.site }, pack);
    place(emptyUnassigned(), client.id, client.name);
  }

  for (const company of buckets.values()) {
    const filterClients = (clients: JobTreeClient[]) => {
      if (!ownerSeesAll) {
        for (const client of clients) {
          client.sites = client.sites.filter((site) => site.jobs.length > 0);
        }
        return clients.filter((client) => client.sites.length > 0);
      }
      const next = clients.filter((client) => {
        const seededMadison =
          company.id === "madison" &&
          (client.id === PHILLIPS_66_CLIENT_ID || client.id === GEORGIA_POWER_CLIENT_ID);
        const hasSites = client.sites.length > 0;
        const hasWork = client.sites.some((site) => site.jobs.length > 0);
        if (seededMadison) return true;
        if (hasWork) return true;
        if (hasSites && MADISON_CLIENT_ORDER.includes(client.id as (typeof MADISON_CLIENT_ORDER)[number])) {
          return true;
        }
        return hasSites && client.sites.some((site) => site.id !== UNASSIGNED_SITE_ID);
      });
      for (const client of next) {
        client.sites = client.sites.filter((site) => site.jobs.length > 0 || site.id !== UNASSIGNED_SITE_ID);
      }
      return next;
    };

    if (company.divisions.length) {
      for (const division of company.divisions) {
        division.clients = filterClients(division.clients);
      }
      if (!ownerSeesAll) {
        company.divisions = company.divisions.filter((division) => division.clients.length > 0);
      }
    } else {
      company.clients = filterClients(company.clients);
    }
    for (const host of hostsOnCompany(company)) {
      for (const client of host.clients) {
        for (const site of client.sites) {
          if (!site.jobs.length) site.assigned = false;
        }
      }
    }
    sortClients(company);
    flattenCompanyTree(company);
    sortClientList(company.clients);
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
  divisions?: Division[];
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
