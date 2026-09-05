import { clampEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import type { SiteRecord } from "./types.ts";

/** Seed Regular (budget lane). Owner can flip any site later — no plant-list lane. */
export const REGULAR_CLIENT_SEED_IDS = ["site-madison", "site-bayway", "site-rodeo"] as const;

export const REGULAR_CLIENT_FIELD = "regularClient";

export function seedRegularClient(siteId = ""): boolean {
  return (REGULAR_CLIENT_SEED_IDS as readonly string[]).includes(siteId);
}

export function siteIsRegular(site?: Pick<SiteRecord, "id" | "regularClient"> | null): boolean {
  if (!site) return false;
  if (typeof site.regularClient === "boolean") return site.regularClient;
  return seedRegularClient(site.id);
}

function norm(value = "") {
  return value.trim().toLowerCase();
}

/** Match a pack/site string to a catalog row. Unknown/new → no row → bid. */
export function matchSiteForRegular(site = "", client = "", catalog: SiteRecord[] = []): SiteRecord | undefined {
  const hay = norm(`${site} ${client}`);
  if (!hay) return undefined;
  const named = catalog.find((row) => {
    const name = norm(row.name);
    const id = norm(row.id);
    const city = norm((row.city || "").split(",")[0] || "");
    const code = norm(row.code);
    return Boolean(
      (name && hay.includes(name)) ||
        (id && hay.includes(id)) ||
        (city && hay.includes(city)) ||
        (code && hay.includes(code)),
    );
  });
  if (named) return named;
  return catalog.find((row) => row.id === "site-madison" && /wood river|roxana/.test(hay));
}

export function regularClientFromParts(site = "", client = "", catalog: SiteRecord[] = []): boolean {
  return siteIsRegular(matchSiteForRegular(site, client, catalog));
}

export function clampStatusForSite(
  status: EstimateStatus,
  site = "",
  client = "",
  catalog: SiteRecord[] = [],
): EstimateStatus {
  return clampEstimateStatus(status, regularClientFromParts(site, client, catalog));
}

export function applyRegularClient(
  sites: SiteRecord[],
  overrides: Record<string, boolean> = {},
): SiteRecord[] {
  return sites.map((row) => ({
    ...row,
    regularClient: row.id in overrides ? Boolean(overrides[row.id]) : seedRegularClient(row.id),
  }));
}
