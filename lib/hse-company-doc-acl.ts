import { isHseVaultSeat, isOwner } from "./desk-role.ts";
import { holdsForEmail, mergePositions, type OrgPosition, type OrgPositionHold } from "./org-positions.ts";
import { HSE_COMPANY_DOC_LOCKED_NOTE } from "./hse-vault-shared.ts";
import type { PublicUser } from "./types.ts";

/**
 * HSE company-rail seat map. Piggybacks the Quality rail ACL, gated on
 * existing product identities — no invented Corporate HSE title.
 *
 * | Seat                         | Product gate                                              |
 * |------------------------------|-----------------------------------------------------------|
 * | Owner (Robert)               | `role === "owner"`                                        |
 * | Field HSE (Wendell / Benny)  | `isHseVaultSeat` — VISUAL_ROSTER `"Trusted / HSE"`        |
 * | Lock / unlock                | Owner only (existing library lock).                       |
 *
 * Job-folder HSE radios stay out of this gate.
 */
export const HSE_COMPANY_DOC_EDIT_ERROR = "Only HSE seats can add or remove these files.";
export const HSE_COMPANY_DOC_LOCK_ERROR = "Only the owner can lock this library.";
export const HSE_COMPANY_DOC_KEEP_ERROR = "That file stays on the company safety library.";
export { HSE_COMPANY_DOC_LOCKED_NOTE };

export type HseCompanyDocActor = Pick<PublicUser, "email" | "name" | "role">;

export type HseCompanyDocAcl = {
  canAddRemove: boolean;
  canLock: boolean;
  /** Edit the JSA template structure (fields/rows). Same lock as the rail library. */
  canEditJsaTemplate: boolean;
  seat: "owner" | "field-hse" | "viewer";
};

export type HseCompanyDocPositions = {
  holds?: OrgPositionHold[];
  catalog?: OrgPosition[];
};

const HSE_SEAT_LABEL = /\b(hse|safety)\b/i;

export function isHseSeatLabel(label?: string | null) {
  return HSE_SEAT_LABEL.test((label || "").trim());
}

export function heldHsePositions(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  const key = (email || "").trim().toLowerCase();
  if (!key) return [] as OrgPosition[];
  return holdsForEmail(holds, key)
    .map((hold) => catalog.find((row) => row.id === hold.positionId))
    .filter((row): row is OrgPosition => Boolean(row && isHseSeatLabel(row.label)));
}

export function holdsFieldHsePosition(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
) {
  return heldHsePositions(email, holds, catalog).length > 0;
}

export function hseCompanyDocAcl(
  user: HseCompanyDocActor | null | undefined,
  positions: HseCompanyDocPositions = {},
): HseCompanyDocAcl {
  const holds = positions.holds ?? [];
  const catalog = positions.catalog ?? [];
  const field = holdsFieldHsePosition(user?.email, holds, catalog);
  const vaultSeat = isHseVaultSeat(user);
  const owner = isOwner(user);
  const canLock = owner;
  const canAddRemove = owner || vaultSeat || field;
  const seat: HseCompanyDocAcl["seat"] = owner ? "owner" : vaultSeat || field ? "field-hse" : "viewer";
  return {
    canAddRemove,
    canLock,
    canEditJsaTemplate: canAddRemove,
    seat,
  };
}

export function canMutateHseCompanyDoc(
  acl: HseCompanyDocAcl,
  locked: boolean,
  lockKnown = true,
) {
  if (!acl.canAddRemove) return false;
  if (acl.canLock) return true;
  if (!lockKnown || locked) return false;
  return true;
}

export function hseCompanyDocMutateError(acl: HseCompanyDocAcl, locked: boolean, lockKnown = true) {
  if (!acl.canAddRemove) return HSE_COMPANY_DOC_EDIT_ERROR;
  if (!acl.canLock && (!lockKnown || locked)) return HSE_COMPANY_DOC_LOCKED_NOTE;
  return null;
}

export function canEditHseJsaTemplate(acl: HseCompanyDocAcl, locked: boolean, lockKnown = true) {
  return canMutateHseCompanyDoc(acl, locked, lockKnown) && acl.canEditJsaTemplate;
}

export function emptyHseCompanyDocLocks(ids: readonly string[], locked: boolean) {
  return Object.fromEntries(ids.map((id) => [id, locked])) as Record<string, boolean>;
}

export function mergePositionsForAcl(stored: OrgPosition[] = [], removedIds: string[] = []) {
  return mergePositions(stored, removedIds);
}
