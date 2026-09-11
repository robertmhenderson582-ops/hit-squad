import { isOwner, isQualityVaultSeat } from "./desk-role.ts";
import { holdsForEmail, mergePositions, type OrgPosition, type OrgPositionHold } from "./org-positions.ts";
import { QUALITY_COMPANY_DOC_LOCKED_NOTE } from "./quality-vault-shared.ts";
import type { PublicUser } from "./types.ts";

/**
 * Company-rail seat map (Robert 2026-09-11).
 *
 * Wishlist titles are not PrivilegeIds and are not seeded in seats.json /
 * positions.json. Gate on the closest existing product identities:
 *
 * | Wishlist              | Product gate                                              |
 * |-----------------------|-----------------------------------------------------------|
 * | Owner (Robert)        | `role === "owner"`                                        |
 * | Field QC / QC Manager | `isQualityVaultSeat` — Chance’s VISUAL_ROSTER             |
 * |                       | `"Trusted / Quality"` (+ Owner / Novus via build desk)    |
 * | Corporate QC Manager  | Seeded org seat `corporate-qc-manager` (Owner assigns).   |
 * |                       | `holdsCorporateQualityPosition` — lock + unlock.          |
 *
 * `VIEW_RESPONSIBILITIES` includes "Quality manager" — view-as filter only.
 * `RosterModules.quality` is unused for this ACL.
 * Job-folder Quality radios stay out of this gate.
 */
export const QUALITY_COMPANY_DOC_EDIT_ERROR = "Only Quality seats can add or remove these files.";
export const QUALITY_COMPANY_DOC_LOCK_ERROR = "Only Corporate Quality or the owner can lock this library.";
export const QUALITY_COMPANY_DOC_KEEP_ERROR = "That file is the company Quality Control Manual.";
export { QUALITY_COMPANY_DOC_LOCKED_NOTE };

export type QualityCompanyDocActor = Pick<PublicUser, "email" | "name" | "role">;

export type QualityCompanyDocAcl = {
  canAddRemove: boolean;
  canLock: boolean;
  seat: "owner" | "corporate-qc" | "field-qc" | "viewer";
};

export type QualityCompanyDocPositions = {
  holds?: OrgPositionHold[];
  catalog?: OrgPosition[];
};

const QUALITY_SEAT_LABEL = /\b(quality|qc)\b/i;

export function isQualitySeatLabel(label?: string | null) {
  return QUALITY_SEAT_LABEL.test((label || "").trim());
}

export function heldQualityPositions(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  const key = (email || "").trim().toLowerCase();
  if (!key) return [] as OrgPosition[];
  return holdsForEmail(holds, key)
    .map((hold) => catalog.find((row) => row.id === hold.positionId))
    .filter((row): row is OrgPosition => Boolean(row && isQualitySeatLabel(row.label)));
}

export function holdsFieldQualityPosition(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  return heldQualityPositions(email, holds, catalog).some((row) => row.desk !== "corporate");
}

export function holdsCorporateQualityPosition(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  return heldQualityPositions(email, holds, catalog).some((row) => row.desk === "corporate");
}

export function qualityCompanyDocAcl(
  user: QualityCompanyDocActor | null | undefined,
  positions: QualityCompanyDocPositions = {},
): QualityCompanyDocAcl {
  const holds = positions.holds ?? [];
  const catalog = positions.catalog ?? [];
  const corporate = holdsCorporateQualityPosition(user?.email, holds, catalog);
  const field = holdsFieldQualityPosition(user?.email, holds, catalog);
  const vaultSeat = isQualityVaultSeat(user);
  const owner = isOwner(user);
  const canLock = owner || corporate;
  const canAddRemove = owner || vaultSeat || field || corporate;
  const seat: QualityCompanyDocAcl["seat"] = owner
    ? "owner"
    : corporate
      ? "corporate-qc"
      : vaultSeat || field
        ? "field-qc"
        : "viewer";
  return { canAddRemove, canLock, seat };
}

export function canMutateQualityCompanyDoc(
  acl: QualityCompanyDocAcl,
  locked: boolean,
  lockKnown = true,
) {
  if (!acl.canAddRemove) return false;
  if (acl.canLock) return true;
  if (!lockKnown || locked) return false;
  return true;
}

export function qualityCompanyDocMutateError(acl: QualityCompanyDocAcl, locked: boolean, lockKnown = true) {
  if (!acl.canAddRemove) return QUALITY_COMPANY_DOC_EDIT_ERROR;
  if (!acl.canLock && (!lockKnown || locked)) return QUALITY_COMPANY_DOC_LOCKED_NOTE;
  return null;
}

export function emptyQualityCompanyDocLocks(ids: readonly string[], locked: boolean) {
  return Object.fromEntries(ids.map((id) => [id, locked])) as Record<string, boolean>;
}

export function mergePositionsForAcl(stored: OrgPosition[] = [], removedIds: string[] = []) {
  return mergePositions(stored, removedIds);
}
