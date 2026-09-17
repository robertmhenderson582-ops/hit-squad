import { hasBuildDesk, isOwner, isProjectManager } from "./desk-role.ts";
import { defaultJobRoleForSeat, normalizeJobRoleLabel } from "./job-roles.ts";
import { plantSlugForSite } from "./jobs.ts";
import { canAssignSitePeople, type ModuleAccessUser } from "./module-access.ts";
import { addDays, formatYmd, parseYmd } from "./phase-schedule.ts";

/** PM-facing cover while Owner / Novus apply the grant. Never mention approval. */
export const SITE_ACCESS_DURATION_COPY = "Site access usually finishes within a few hours.";
export const SITE_ACCESS_LIVE_COPY = "Site access is live.";
export const SITE_ACCESS_FAILED_COPY = "Couldn't complete site access.";
export const SITE_ACCESS_EXPIRED_COPY = "Site access has ended.";
export const SITE_ACCESS_OWNER_PM_COPY = "Owner and Project Manager seats are not time-boxed.";
export const SITE_ACCESS_WINDOW_COPY =
  "General Foreman through Tool Room attendant access is time-limited. PM sets the window. Default is Job Setup through Post end plus about two weeks.";
export const FIELD_ACCESS_AFTER_POST_DAYS = 14;

export type SiteAccessState = "pending" | "live" | "failed";
export type PublicSiteAccessStatus = "working" | "live" | "failed" | "expired";

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
  timeboxed: boolean;
  startYmd: string | null;
  endYmd: string | null;
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
  timeboxed: boolean;
  startYmd: string | null;
  endYmd: string | null;
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

/** GF, Foreman, Tool Room attendant (and craft variants). Not Quality / HSE / Super. */
export function isFieldAccessTimeboxedTitle(title?: string | null): boolean {
  const label = normalizeJobRoleLabel(title).toLowerCase();
  if (!label) return false;
  if (label === "owner" || label === "project manager") return false;
  if (/\btool\s*room\b/.test(label)) return true;
  if (/\bgeneral\s+foreman\b/.test(label)) return true;
  if (/\bforeman\b/.test(label) && !/\bsuperintendent\b/.test(label)) return true;
  return false;
}

/** Owner and Project Manager seats are never time-boxed. Only GF → Tool Room attendant. */
export function fieldAccessTimeboxedFor(user?: ModuleAccessUser | null): boolean {
  if (!user) return false;
  if (isOwner(user)) return false;
  if (isProjectManager(user)) return false;
  const title = normalizeJobRoleLabel(user.jobTitle) || defaultJobRoleForSeat(user);
  return isFieldAccessTimeboxedTitle(title);
}

/** Job Setup start → Post end + 14 days, unless the PM overrides the dates. */
export function defaultFieldAccessWindow(
  jobStartYmd?: string | null,
  postEndYmd?: string | null,
  todayYmd?: string,
): { start: string; end: string } {
  const today = todayYmd && parseYmd(todayYmd) ? todayYmd : formatYmd(new Date());
  const start = jobStartYmd && parseYmd(jobStartYmd) ? jobStartYmd : today;
  const endBase = postEndYmd && parseYmd(postEndYmd) ? postEndYmd : start;
  let end = addDays(endBase, FIELD_ACCESS_AFTER_POST_DAYS);
  if (end < start) end = addDays(start, FIELD_ACCESS_AFTER_POST_DAYS);
  return { start, end };
}

export function siteAccessInWindow(grant: Pick<SiteAccessGrant, "timeboxed" | "startYmd" | "endYmd">, todayYmd?: string): boolean {
  if (!grant.timeboxed) return true;
  const today = todayYmd && parseYmd(todayYmd) ? todayYmd : formatYmd(new Date());
  if (grant.startYmd && today < grant.startYmd) return false;
  if (!grant.endYmd || today > grant.endYmd) return false;
  return true;
}

export function grantMatchesPack(
  grant: Pick<SiteAccessGrant, "siteId" | "siteName">,
  pack: { siteId?: string; site?: string } | null | undefined,
): boolean {
  if (!pack) return false;
  const grantId = normalizeSiteId(grant.siteId);
  if (!grantId) return false;
  const grantName = (grant.siteName || "").trim().toLowerCase();
  const packId = (pack.siteId || "").trim().toLowerCase();
  const packSite = (pack.site || "").trim().toLowerCase();
  if (packId && normalizeSiteId(packId) === grantId) return true;
  if (packSite && (packSite === grantId || (grantName && packSite === grantName))) return true;
  const packSlug = plantSlugForSite(pack.siteId, pack.site);
  if (packSlug && packSlug === grantId) return true;
  const compact = (value: string) => value.replace(/[^a-z0-9]+/g, "");
  const grantCompact = compact(grantId);
  if (packSite && grantCompact && compact(packSite).includes(grantCompact)) return true;
  if (grantName && packSite && compact(packSite).includes(compact(grantName))) return true;
  if (grantName && packId && compact(packId).includes(compact(grantName))) return true;
  return false;
}

export function fieldSeatHasLiveSiteAccess(
  user: ModuleAccessUser | null | undefined,
  pack: { siteId?: string; site?: string } | null | undefined,
  grants: SiteAccessGrant[],
  todayYmd?: string,
): boolean {
  if (!fieldAccessTimeboxedFor(user)) return true;
  const email = (user?.email || "").trim().toLowerCase();
  if (!email || !pack) return false;
  return grants.some((grant) => grant.email === email && grantMatchesPack(grant, pack) && siteAccessIsLive(grant, todayYmd));
}

function resolveWindow(input: {
  assignee?: ModuleAccessUser | null;
  startYmd?: string | null;
  endYmd?: string | null;
  jobStartYmd?: string | null;
  postEndYmd?: string | null;
  todayYmd?: string;
}): { timeboxed: boolean; startYmd: string | null; endYmd: string | null } {
  const timeboxed = fieldAccessTimeboxedFor(input.assignee);
  if (!timeboxed) return { timeboxed: false, startYmd: null, endYmd: null };
  const fallback = defaultFieldAccessWindow(input.jobStartYmd, input.postEndYmd, input.todayYmd);
  const start = input.startYmd && parseYmd(input.startYmd) ? input.startYmd : fallback.start;
  const end = input.endYmd && parseYmd(input.endYmd) ? input.endYmd : fallback.end;
  return { timeboxed: true, startYmd: start, endYmd: end };
}

export function createSiteAccessGrant(input: {
  siteId: string;
  siteName?: string;
  email: string;
  name?: string;
  grantedByEmail: string;
  grantedByName?: string;
  actor?: ModuleAccessUser | null;
  assignee?: ModuleAccessUser | null;
  startYmd?: string | null;
  endYmd?: string | null;
  jobStartYmd?: string | null;
  postEndYmd?: string | null;
  todayYmd?: string;
  now?: number;
}): SiteAccessGrant {
  const now = input.now ?? Date.now();
  const email = input.email.trim().toLowerCase();
  const siteId = normalizeSiteId(input.siteId);
  const actor = input.actor;
  const ownerPath = Boolean(actor && (isOwner(actor) || hasBuildDesk(actor)));
  const window = resolveWindow(input);
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
    timeboxed: window.timeboxed,
    startYmd: window.startYmd,
    endYmd: window.endYmd,
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
  const startYmd = typeof row.startYmd === "string" && parseYmd(row.startYmd) ? row.startYmd : null;
  const endYmd = typeof row.endYmd === "string" && parseYmd(row.endYmd) ? row.endYmd : null;
  const timeboxed = row.timeboxed === true || (row.timeboxed !== false && Boolean(startYmd || endYmd));
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
    timeboxed,
    startYmd,
    endYmd,
  };
}

export function publicSiteAccessStatus(grant: SiteAccessGrant, todayYmd?: string): PublicSiteAccessStatus {
  if (grant.state === "failed") return "failed";
  if (grant.state === "pending") return "working";
  if (grant.state === "live" && grant.approvedByOwner && !siteAccessInWindow(grant, todayYmd)) return "expired";
  if (grant.state === "live") return "live";
  return "working";
}

export function siteAccessIsLive(grant: SiteAccessGrant, todayYmd?: string): boolean {
  return grant.state === "live" && grant.approvedByOwner && siteAccessInWindow(grant, todayYmd);
}

/** UI mask — never mention Owner, pending, or approval. */
export function siteAccessMaskCopy(grant: SiteAccessGrant, todayYmd?: string): string {
  if (grant.state === "failed") return SITE_ACCESS_FAILED_COPY;
  if (grant.state === "pending") return SITE_ACCESS_DURATION_COPY;
  if (grant.state === "live" && !siteAccessInWindow(grant, todayYmd)) return SITE_ACCESS_EXPIRED_COPY;
  if (grant.state === "live") return SITE_ACCESS_LIVE_COPY;
  return SITE_ACCESS_DURATION_COPY;
}

export function publicSiteAccessGrant(grant: SiteAccessGrant, todayYmd?: string): PublicSiteAccessGrant {
  return {
    id: grant.id,
    siteId: grant.siteId,
    siteName: grant.siteName,
    email: grant.email,
    name: grant.name,
    createdAt: grant.createdAt,
    status: publicSiteAccessStatus(grant, todayYmd),
    copy: siteAccessMaskCopy(grant, todayYmd),
    timeboxed: grant.timeboxed,
    startYmd: grant.startYmd,
    endYmd: grant.endYmd,
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

/** PM extends the window on an already-decided grant. Does not re-queue Owner/Novus. */
export function extendSiteAccessGrant(
  grant: SiteAccessGrant,
  input: {
    actor?: ModuleAccessUser | null;
    startYmd?: string | null;
    endYmd?: string | null;
    jobStartYmd?: string | null;
    postEndYmd?: string | null;
    todayYmd?: string;
  },
): SiteAccessGrant | { error: string } {
  if (!canWriteSiteAccess(input.actor)) return { error: "Owner and Project Managers set the access window." };
  if (!grant.timeboxed) return { error: SITE_ACCESS_OWNER_PM_COPY };
  const fallback = defaultFieldAccessWindow(input.jobStartYmd, input.postEndYmd, input.todayYmd);
  const start = input.startYmd && parseYmd(input.startYmd) ? input.startYmd : grant.startYmd || fallback.start;
  const end = input.endYmd && parseYmd(input.endYmd) ? input.endYmd : fallback.end;
  return {
    ...grant,
    startYmd: start,
    endYmd: end,
  };
}
