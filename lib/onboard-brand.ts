import {
  companyIdForUser,
  companyLogoSrc,
  companyName,
  isStandaloneId,
  type Company,
  type CompanyId,
} from "./companies.ts";
import { CONTROL_CENTER_TITLE } from "./onboard-pipeline.ts";

/** Phase 1 Control Center tenant. Owner / Hit Squad seats fall back here. */
export const CONTROL_CENTER_COMPANY_ID: CompanyId = "madison";

/**
 * Shipped default marks for Control Center header when the live catalog has no logo.
 * Owner upload / URL on Settings → Branding (companies vault) wins over these.
 * Add a public file + an entry here for a new tenant default, or skip and upload in Branding.
 */
export const CONTROL_CENTER_SEED_LOGOS: Readonly<Record<string, string>> = {
  madison: "/madison.png",
};

export type ControlCenterBrand = {
  companyId: string;
  name: string;
  logo: string | null;
  fallbackLabel: string;
};

export function controlCenterTenantId(user?: { email?: string; role?: string } | null): CompanyId {
  const assigned = companyIdForUser(user);
  if (assigned && !isStandaloneId(assigned) && assigned !== "hitsquad") return assigned;
  return CONTROL_CENTER_COMPANY_ID;
}

export function controlCenterBrand(
  catalog: readonly Company[] = [],
  companyId: string = CONTROL_CENTER_COMPANY_ID,
): ControlCenterBrand {
  const row = catalog.find((company) => company.id === companyId);
  const name = row?.name || (isCompanyIdLike(companyId) ? companyName(companyId) : companyId) || CONTROL_CENTER_TITLE;
  const uploaded = companyLogoSrc(row?.logo);
  const seeded = companyLogoSrc(CONTROL_CENTER_SEED_LOGOS[companyId]);
  return {
    companyId,
    name,
    logo: uploaded ?? seeded,
    fallbackLabel: name || CONTROL_CENTER_TITLE,
  };
}

export function controlCenterBrandForUser(
  user?: { email?: string; role?: string } | null,
  catalog: readonly Company[] = [],
) {
  return controlCenterBrand(catalog, controlCenterTenantId(user));
}

export function parseControlCenterBrand(raw: unknown): ControlCenterBrand | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ControlCenterBrand>;
  if (typeof row.companyId !== "string" || !row.companyId.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  const fallback =
    typeof row.fallbackLabel === "string" && row.fallbackLabel.trim() ? row.fallbackLabel.trim() : row.name.trim();
  return {
    companyId: row.companyId.trim(),
    name: row.name.trim(),
    logo: companyLogoSrc(typeof row.logo === "string" ? row.logo : null),
    fallbackLabel: fallback,
  };
}

function isCompanyIdLike(value: string): value is CompanyId {
  return /^[a-z][a-z0-9]{0,39}$/.test(value);
}
