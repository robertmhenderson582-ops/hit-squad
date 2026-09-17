import { canAssignSitePeople, type ModuleAccessUser } from "./module-access.ts";

export const SITE_ACCESS_PROVISION_MS = 15 * 60 * 1000;
export const SITE_ACCESS_DURATION_COPY = "Site access takes a duration to complete.";
export const SITE_ACCESS_LIVE_COPY = "Site access is live.";

export type SiteAccessGrant = {
  id: string;
  siteId: string;
  email: string;
  name: string;
  grantedByEmail: string;
  /** Always true. PM grants are silently Owner-approved before they go live. */
  approvedByOwner: true;
  createdAt: number;
  liveAt: number;
};

export function normalizeSiteId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function siteAccessGrantId(siteId: string, email: string): string {
  return `${normalizeSiteId(siteId)}::${email.trim().toLowerCase()}`;
}

export function createSiteAccessGrant(input: {
  siteId: string;
  email: string;
  name?: string;
  grantedByEmail: string;
  now?: number;
}): SiteAccessGrant {
  const now = input.now ?? Date.now();
  const email = input.email.trim().toLowerCase();
  const siteId = normalizeSiteId(input.siteId);
  return {
    id: siteAccessGrantId(siteId, email),
    siteId,
    email,
    name: (input.name || "").trim(),
    grantedByEmail: input.grantedByEmail.trim().toLowerCase(),
    approvedByOwner: true,
    createdAt: now,
    liveAt: now + SITE_ACCESS_PROVISION_MS,
  };
}

export function parseSiteAccessGrant(raw: unknown): SiteAccessGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<SiteAccessGrant>;
  const siteId = normalizeSiteId(row.siteId);
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  if (!siteId || !email.includes("@")) return null;
  const createdAt = typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : Date.now();
  const liveAt =
    typeof row.liveAt === "number" && Number.isFinite(row.liveAt) ? row.liveAt : createdAt + SITE_ACCESS_PROVISION_MS;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : siteAccessGrantId(siteId, email),
    siteId,
    email,
    name: typeof row.name === "string" ? row.name.trim() : "",
    grantedByEmail: typeof row.grantedByEmail === "string" ? row.grantedByEmail.trim().toLowerCase() : "",
    approvedByOwner: true,
    createdAt,
    liveAt,
  };
}

export function siteAccessStatus(grant: SiteAccessGrant, now = Date.now()): "provisioning" | "live" {
  return grant.approvedByOwner && now >= grant.liveAt ? "live" : "provisioning";
}

export function siteAccessIsLive(grant: SiteAccessGrant, now = Date.now()): boolean {
  return siteAccessStatus(grant, now) === "live";
}

/** UI mask — never mention Owner approval. */
export function siteAccessMaskCopy(grant: SiteAccessGrant, now = Date.now()): string {
  return siteAccessIsLive(grant, now) ? SITE_ACCESS_LIVE_COPY : SITE_ACCESS_DURATION_COPY;
}

export function canWriteSiteAccess(user?: ModuleAccessUser | null): boolean {
  return canAssignSitePeople(user);
}
