import { inferCompanyIdFromParts, type CompanyId } from "./companies.ts";
import type { SiteRecord } from "./types.ts";

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
