import { hasBuildDesk, isHseVaultSeat, isOwner, isProjectManager } from "./desk-role.ts";
import {
  PROJECT_MANAGER_POSITION_ID,
  holdsForEmail,
  type OrgPosition,
  type OrgPositionHold,
} from "./org-positions.ts";
import {
  holdsFieldHsePosition,
  type HseCompanyDocActor,
  type HseCompanyDocPositions,
} from "./hse-company-doc-acl.ts";

/** Sentinel job id prefix. Kits live under company / Ready HSE packages / kit name. */
export const HSE_READY_SHELF_PREFIX = "hse-ready-shelf";
export const HSE_READY_SHELF_FOLDER = "Ready HSE packages";
export const HSE_PACKAGE_SHELF_ATTACH_ERROR =
  "Only HSE seats or a PM / estimator can attach a Ready HSE package.";
export const HSE_PACKAGE_SHELF_BUILD_ERROR = "Only HSE seats can build Ready HSE packages.";

export type HsePackageShelfActor = HseCompanyDocActor;
export type HsePackageShelfPositions = HseCompanyDocPositions;

export type HsePackageShelfAcl = {
  canBuild: boolean;
  canAttach: boolean;
  seat: "owner" | "field-hse" | "pm" | "viewer";
};

export function isHseReadyShelfJobId(jobId?: string | null): boolean {
  const raw = (jobId || "").trim();
  return raw === HSE_READY_SHELF_PREFIX || raw.startsWith(`${HSE_READY_SHELF_PREFIX}:`);
}

export function hseReadyShelfJobId(packageId: string) {
  const id = packageId.trim().toLowerCase().replace(/[^a-z0-9:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${HSE_READY_SHELF_PREFIX}:${id || "kit"}`;
}

export function hseReadyShelfPackageId(jobId?: string | null) {
  const raw = (jobId || "").trim();
  if (!isHseReadyShelfJobId(raw)) return "";
  if (raw === HSE_READY_SHELF_PREFIX) return "";
  return raw.slice(HSE_READY_SHELF_PREFIX.length + 1);
}

export function hseReadyShelfPackageLabel(jobId?: string | null) {
  const id = hseReadyShelfPackageId(jobId);
  if (!id) return "Kit";
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function newHsePackageId(name: string) {
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

export function parseHsePackageName(value?: string | null): { label: string } | { error: string } {
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

export function hsePackageShelfAcl(
  user: HsePackageShelfActor | null | undefined,
  positions: HsePackageShelfPositions = {},
): HsePackageShelfAcl {
  const holds = positions.holds ?? [];
  const catalog = positions.catalog ?? [];
  const owner = isOwner(user) || hasBuildDesk(user);
  const fieldHse = holdsFieldHsePosition(user?.email, holds, catalog) || isHseVaultSeat(user);
  const pm = isProjectManager(user) || holdsPmEstimatorSeat(user?.email, holds, catalog);
  const canBuild = owner || fieldHse;
  const canAttach = canBuild || pm;
  const seat: HsePackageShelfAcl["seat"] = owner
    ? "owner"
    : fieldHse
      ? "field-hse"
      : pm
        ? "pm"
        : "viewer";
  return { canBuild, canAttach, seat };
}
