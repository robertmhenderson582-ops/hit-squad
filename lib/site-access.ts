import { hasBuildDesk, isOwner } from "./desk-role.ts";
import { canAssignSitePeople, type ModuleAccessUser } from "./module-access.ts";

/** PM-facing cover while Owner / Novus apply the grant. Never mention approval. */
export const SITE_ACCESS_DURATION_COPY = "Site access usually finishes within a few hours.";
export const SITE_ACCESS_LIVE_COPY = "Site access is live.";
export const SITE_ACCESS_FAILED_COPY = "Couldn't complete site access.";

export type SiteAccessState = "pending" | "live" | "failed";
export type PublicSiteAccessStatus = "working" | "live" | "failed";

export type SiteAccessGrant = {
  id: string;
  siteId: string;
  siteName: string;
  email: string;
  name: string;
  grantedByEmail: string;
  grantedByName: string;
  state: SiteAccessState;
  approvedByOwner: boolean;
  decidedByEmail: string;
  createdAt: number;
  decidedAt: number | null;
};

export type PublicSiteAccessGrant = {
  id: string;
  siteId: string;
  siteName: string;
  email: string;
  name: string;
  createdAt: number;
  status: PublicSiteAccessStatus;
  copy: string;
};

export function normalizeSiteId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function siteAccessGrantId(siteId: string, email: string): string {
  return `${normalizeSiteId(siteId)}::${email.trim().toLowerCase()}`;
}

export function canWriteSiteAccess(user?: ModuleAccessUser | null): boolean {
  return canAssignSitePeople(user);
}

/** Owner desk and Novus path. Hidden from the plant People tab. */
export function canSilentApproveSiteAccess(user?: ModuleAccessUser | null): boolean {
  return hasBuildDesk(user);
}

export function createSiteAccessGrant(input: {
  siteId: string;
  siteName?: string;
  email: string;
  name?: string;
  grantedByEmail: string;
  grantedByName?: string;
  actor?: ModuleAccessUser | null;
  now?: number;
}): SiteAccessGrant {
  const now = input.now ?? Date.now();
  const email = input.email.trim().toLowerCase();
  const siteId = normalizeSiteId(input.siteId);
  const actor = input.actor;
  const ownerPath = Boolean(actor && (isOwner(actor) || hasBuildDesk(actor)));
  return {
    id: siteAccessGrantId(siteId, email),
    siteId,
    siteName: (input.siteName || "").trim(),
    email,
    name: (input.name || "").trim(),
    grantedByEmail: input.grantedByEmail.trim().toLowerCase(),
    grantedByName: (input.grantedByName || "").trim(),
    state: ownerPath ? "live" : "pending",
    approvedByOwner: ownerPath,
    decidedByEmail: ownerPath ? input.grantedByEmail.trim().toLowerCase() : "",
    createdAt: now,
    decidedAt: ownerPath ? now : null,
  };
}

export function parseSiteAccessGrant(raw: unknown): SiteAccessGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<SiteAccessGrant> & { liveAt?: number };
  const siteId = normalizeSiteId(row.siteId);
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  if (!siteId || !email.includes("@")) return null;
  const createdAt = typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : Date.now();
  let state: SiteAccessState = "pending";
  if (row.state === "live" || row.state === "failed" || row.state === "pending") state = row.state;
  else if (row.approvedByOwner === true) state = "live";
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : siteAccessGrantId(siteId, email),
    siteId,
    siteName: typeof row.siteName === "string" ? row.siteName.trim() : "",
    email,
    name: typeof row.name === "string" ? row.name.trim() : "",
    grantedByEmail: typeof row.grantedByEmail === "string" ? row.grantedByEmail.trim().toLowerCase() : "",
    grantedByName: typeof row.grantedByName === "string" ? row.grantedByName.trim() : "",
    state,
    approvedByOwner: state === "live",
    decidedByEmail: typeof row.decidedByEmail === "string" ? row.decidedByEmail.trim().toLowerCase() : "",
    createdAt,
    decidedAt: typeof row.decidedAt === "number" && Number.isFinite(row.decidedAt) ? row.decidedAt : null,
  };
}

export function publicSiteAccessStatus(grant: SiteAccessGrant): PublicSiteAccessStatus {
  if (grant.state === "live") return "live";
  if (grant.state === "failed") return "failed";
  return "working";
}

export function siteAccessIsLive(grant: SiteAccessGrant): boolean {
  return grant.state === "live" && grant.approvedByOwner;
}

/** UI mask — never mention Owner, pending, or approval. */
export function siteAccessMaskCopy(grant: SiteAccessGrant): string {
  if (grant.state === "live") return SITE_ACCESS_LIVE_COPY;
  if (grant.state === "failed") return SITE_ACCESS_FAILED_COPY;
  return SITE_ACCESS_DURATION_COPY;
}

export function publicSiteAccessGrant(grant: SiteAccessGrant): PublicSiteAccessGrant {
  return {
    id: grant.id,
    siteId: grant.siteId,
    siteName: grant.siteName,
    email: grant.email,
    name: grant.name,
    createdAt: grant.createdAt,
    status: publicSiteAccessStatus(grant),
    copy: siteAccessMaskCopy(grant),
  };
}

export function applySiteAccessGrant(
  grant: SiteAccessGrant,
  actor: ModuleAccessUser | null | undefined,
  now = Date.now(),
): SiteAccessGrant | { error: string } {
  if (!canSilentApproveSiteAccess(actor)) return { error: "Could not complete that grant." };
  if (grant.state !== "pending") return { error: "That grant is already finished." };
  return {
    ...grant,
    state: "live",
    approvedByOwner: true,
    decidedByEmail: (actor?.email || "").trim().toLowerCase(),
    decidedAt: now,
  };
}

export function failSiteAccessGrant(
  grant: SiteAccessGrant,
  actor: ModuleAccessUser | null | undefined,
  now = Date.now(),
): SiteAccessGrant | { error: string } {
  if (!canSilentApproveSiteAccess(actor)) return { error: "Could not complete that grant." };
  if (grant.state !== "pending") return { error: "That grant is already finished." };
  return {
    ...grant,
    state: "failed",
    approvedByOwner: false,
    decidedByEmail: (actor?.email || "").trim().toLowerCase(),
    decidedAt: now,
  };
}
