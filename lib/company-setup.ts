import {
  COMPANY_MODULE_KEYS,
  inferCompanyIdFromParts,
  type CompanyId,
  type CompanyModuleKey,
} from "./companies.ts";
import type { SiteRecord } from "./types.ts";

export type CompanyModuleCatalogLabel = "Included" | "Add-on" | "Not open for trial";

export type CompanyModuleCatalogRow = {
  key: CompanyModuleKey;
  label: string;
  note: string;
  catalogLabel: CompanyModuleCatalogLabel;
};

/**
 * Owner-facing catalog on Company Setup. Labels are display-only — no payment.
 * Jobs / Quality / HSE ship with the desk. Dispatch is the paid-later add-on.
 * Accounting stays closed chrome.
 */
export const COMPANY_MODULE_CATALOG: readonly CompanyModuleCatalogRow[] = [
  {
    key: "jobs",
    label: "Jobs",
    note: "Company → Division → Client → Site → Job directory.",
    catalogLabel: "Included",
  },
  {
    key: "quality",
    label: "Quality",
    note: "Independent Quality studio. Fillable forms and working boards.",
    catalogLabel: "Included",
  },
  {
    key: "hse",
    label: "HSE",
    note: "Independent site safety. Talks, permits, and observations.",
    catalogLabel: "Included",
  },
  {
    key: "accounting",
    label: "Accounting",
    note: "Closed chrome only — no invented boards or clocks.",
    catalogLabel: "Not open for trial",
  },
  {
    key: "dispatch",
    label: "Dispatch / Control Center",
    note: "Hiring + HSE onboarding board. Off hides the Home tile and /onboard for company seats.",
    catalogLabel: "Add-on",
  },
] as const;

export function companyModuleCatalogKeys(): CompanyModuleKey[] {
  return COMPANY_MODULE_CATALOG.map((row) => row.key);
}

export function companyModuleCatalogCoversHomeDock(): boolean {
  return COMPANY_MODULE_KEYS.every((key) => COMPANY_MODULE_CATALOG.some((row) => row.key === key));
}

export type CompanySetupSite = {
  id: string;
  name: string;
  client: string;
  city: string;
  companyId: CompanyId;
};

export function siteCompanyId(site: Pick<SiteRecord, "client" | "name" | "family" | "city">): CompanyId {
  return inferCompanyIdFromParts(site.client, site.name, site.family, site.city);
}

export function toCompanySetupSite(site: SiteRecord): CompanySetupSite {
  return {
    id: site.id,
    name: site.name,
    client: site.client,
    city: site.city,
    companyId: siteCompanyId(site),
  };
}

export function sitesForCompany(companyId: string, sites: CompanySetupSite[]): CompanySetupSite[] {
  return sites.filter((site) => site.companyId === companyId);
}
