import { hasBuildDesk, isOwner, isProjectManager, isQualityVaultSeat } from "./desk-role.ts";
import {
  PROJECT_MANAGER_POSITION_ID,
  SITE_QC_MANAGER_POSITION_ID,
  holdsForEmail,
  type OrgPosition,
  type OrgPositionHold,
} from "./org-positions.ts";
import {
  holdsCorporateQualityPosition,
  holdsFieldQualityPosition,
  type QualityCompanyDocActor,
  type QualityCompanyDocPositions,
} from "./quality-company-doc-acl.ts";

/** Sentinel job id prefix. Kits live under company / Ready Quality packages / kit name. */
export const QUALITY_READY_SHELF_PREFIX = "quality-ready-shelf";
export const QUALITY_READY_SHELF_FOLDER = "Ready Quality packages";
export const QUALITY_PACKAGE_SHELF_ATTACH_ERROR = "Only Corporate QC, Site QC, or a PM / estimator can attach a Ready Quality package.";
export const QUALITY_PACKAGE_SHELF_BUILD_ERROR = "Only Quality seats can build Ready Quality packages.";

export type QualityPackageShelfActor = QualityCompanyDocActor;
export type QualityPackageShelfPositions = QualityCompanyDocPositions;

export type QualityPackageShelfAcl = {
  canBuild: boolean;
  canAttach: boolean;
  seat: "owner" | "corporate-qc" | "site-qc" | "pm" | "viewer";
};

export function isQualityReadyShelfJobId(jobId?: string | null): boolean {
  const raw = (jobId || "").trim();
  return raw === QUALITY_READY_SHELF_PREFIX || raw.startsWith(`${QUALITY_READY_SHELF_PREFIX}:`);
}

export function qualityReadyShelfJobId(packageId: string) {
  const id = packageId.trim().toLowerCase().replace(/[^a-z0-9:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${QUALITY_READY_SHELF_PREFIX}:${id || "kit"}`;
}

export function qualityReadyShelfPackageId(jobId?: string | null) {
  const raw = (jobId || "").trim();
  if (!isQualityReadyShelfJobId(raw)) return "";
  if (raw === QUALITY_READY_SHELF_PREFIX) return "";
  return raw.slice(QUALITY_READY_SHELF_PREFIX.length + 1);
}

export function qualityReadyShelfPackageLabel(jobId?: string | null) {
  const id = qualityReadyShelfPackageId(jobId);
  if (!id) return "Kit";
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function newQualityPackageId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${slug || "kit"}-${stamp}`;
}

export function parseQualityPackageName(value?: string | null): { label: string } | { error: string } {
  const label = (value ?? "").trim().replace(/\s+/g, " ");
  if (label.length < 2) return { error: "Type a package name." };
  if (label.length > 80) return { error: "That name is too long." };
  return { label };
}

function holdsPosition(
  email: string | undefined,
  positionId: string,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  const key = (email || "").trim().toLowerCase();
  if (!key) return false;
  return holdsForEmail(holds, key).some((hold) => {
    if (hold.positionId === positionId) return true;
    const row = catalog.find((item) => item.id === hold.positionId);
    return row?.id === positionId;
  });
}

export function holdsPmEstimatorSeat(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  return holdsPosition(email, PROJECT_MANAGER_POSITION_ID, holds, catalog);
}

export function holdsSiteQcSeat(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  return (
    holdsPosition(email, SITE_QC_MANAGER_POSITION_ID, holds, catalog) ||
    holdsFieldQualityPosition(email, holds, catalog)
  );
}

export function qualityPackageShelfAcl(
  user: QualityPackageShelfActor | null | undefined,
  positions: QualityPackageShelfPositions = {},
): QualityPackageShelfAcl {
  const holds = positions.holds ?? [];
  const catalog = positions.catalog ?? [];
  const owner = isOwner(user) || hasBuildDesk(user);
  const corporate = holdsCorporateQualityPosition(user?.email, holds, catalog);
  const siteQc = holdsSiteQcSeat(user?.email, holds, catalog) || isQualityVaultSeat(user);
  const pm = isProjectManager(user) || holdsPmEstimatorSeat(user?.email, holds, catalog);
  const canBuild = owner || corporate || siteQc;
  const canAttach = canBuild || pm;
  const seat: QualityPackageShelfAcl["seat"] = owner
    ? "owner"
    : corporate
      ? "corporate-qc"
      : siteQc
        ? "site-qc"
        : pm
          ? "pm"
          : "viewer";
  return { canBuild, canAttach, seat };
}
