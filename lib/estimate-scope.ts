import { companyScopeFor, type CompanyScope } from "./companies.ts";
import { dummyPacksForUser, mergeDummyPacks } from "./cbi-dummy.ts";
import { hasBuildDesk, isOwner, isTester } from "./desk-role.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";
import { listLocalPacks, type LocalPack, type StorageLike } from "./local-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import type { PublicUser } from "./types.ts";

export type ScopeUser = Pick<PublicUser, "email" | "role">;

export function normalizeEmails(values?: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((row) => (typeof row === "string" ? row.trim().toLowerCase() : "")).filter(Boolean))];
}

export function ownerVaultEmail() {
  return (process.env.OWNER_EMAIL || OWNER_LOGIN_EMAIL).trim().toLowerCase();
}

export function isOwnerVaultEmail(email = "") {
  return isOwnerIdentity(email) || email.trim().toLowerCase() === ownerVaultEmail();
}

function packOwnerKey(email = "") {
  return canonicalEmail(email) || email.trim().toLowerCase();
}

export function packOwnerEmailForWrite(user: ScopeUser, existing?: string) {
  if (isTester(user)) return user.email.trim().toLowerCase();
  const current = (existing || "").trim().toLowerCase();
  if (current && (isOwnerVaultEmail(current) || current === user.email.trim().toLowerCase())) {
    return current;
  }
  // A leftover owner flush must not restamp a tester-owned share as the owner vault.
  if (current && current !== user.email.trim().toLowerCase()) return current;
  return ownerVaultEmail();
}

export type ScopedPack = { ownerEmail?: string; sharedWith?: string[]; transferredFrom?: string };

export function packSharedEmails(pack: { sharedWith?: string[] }) {
  return normalizeEmails(pack.sharedWith);
}

export function packVisibleTo(user: ScopeUser, pack: ScopedPack) {
  if (isOwner(user)) return true;
  const ownerEmail = packOwnerKey(pack.ownerEmail);
  const email = user.email.trim().toLowerCase();
  if (!ownerEmail) return false;
  if (ownerEmail === email || packSharedEmails(pack).includes(email)) {
    return isTester(user) || hasBuildDesk(user);
  }
  if (isTester(user)) return false;
  if (hasBuildDesk(user)) return isOwnerVaultEmail(pack.ownerEmail);
  return false;
}

function transferredFromOwner(user: ScopeUser, pack: ScopedPack) {
  const from = (pack.transferredFrom || "").trim().toLowerCase();
  if (!from) return false;
  return from === user.email.trim().toLowerCase() || isOwnerVaultEmail(from);
}

/** Owner Company cards. Does not grant leftover write — use packVisibleTo for writes. */
export function packListedOnOwnerDesk(user: ScopeUser, pack: ScopedPack) {
  if (packVisibleTo(user, pack)) return true;
  return isOwner(user) && transferredFromOwner(user, pack);
}

export function listedDeskPacks<T extends ScopedPack>(user: ScopeUser, packs: T[]) {
  if (isTester(user)) return visiblePacks(user, packs);
  return packs.filter((pack) => packListedOnOwnerDesk(user, pack));
}

export function isPackOwner(user: ScopeUser, pack: { ownerEmail?: string }) {
  const ownerEmail = packOwnerKey(pack.ownerEmail);
  const email = user.email.trim().toLowerCase();
  return ownerEmail === email || (user.role === "owner" && isOwnerVaultEmail(pack.ownerEmail));
}

export function canTransferPack(user: ScopeUser, pack: ScopedPack) {
  if (!canWritePack(user, pack)) return false;
  return isPackOwner(user, pack);
}

export function canSharePack(user: ScopeUser, pack: ScopedPack) {
  return canTransferPack(user, pack);
}

export function canReturnPack(user: ScopeUser, pack: ScopedPack) {
  if (!canTransferPack(user, pack)) return false;
  const from = (pack.transferredFrom || "").trim().toLowerCase();
  return Boolean(from && from !== user.email.trim().toLowerCase());
}

export function visiblePacks<T extends ScopedPack>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => packVisibleTo(user, pack));
}

/** Local leftover work with no owner stamp stays on the signed-in owner desk only. */
export function localPackVisibleTo(user: ScopeUser, pack: ScopedPack) {
  if (isOwner(user)) return true;
  const ownerEmail = packOwnerKey(pack.ownerEmail);
  const email = user.email.trim().toLowerCase();
  if (isTester(user)) {
    return Boolean(ownerEmail) && (ownerEmail === email || packSharedEmails(pack).includes(email));
  }
  if (!hasBuildDesk(user)) return false;
  if (!ownerEmail) return true;
  return isOwnerVaultEmail(pack.ownerEmail) || ownerEmail === email || packSharedEmails(pack).includes(email);
}

export function localPacksForUser<T extends ScopedPack>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => localPackVisibleTo(user, pack));
}

/** Local packs for the current desk. Safe to read during first paint. */
export function visibleDeskPacks(
  user?: ScopeUser | null,
  viewingAs = false,
  store?: StorageLike | null,
  scope?: CompanyScope | null,
): LocalPack[] {
  if (!user) return dummyPacksForUser(scope);
  const next = scope ?? companyScopeFor(user);
  return mergeDummyPacks(
    localPacksForUser(user, listLocalPacks(store)).filter((pack) => !viewingAs || !pack.archived),
    next,
  );
}

export function canWritePack(user: ScopeUser, pack: ScopedPack) {
  if (isOwner(user)) return true;
  if (isTester(user)) return packVisibleTo(user, pack);
  return hasBuildDesk(user) && packVisibleTo(user, pack);
}
