import { companyScopeFor, inferCompanyIdFromParts, type CompanyScope } from "./companies.ts";
import { dummyPacksForUser, mergeDummyPacks } from "./cbi-dummy.ts";
import { hasWorkingDesk, isOwner, isPresident, isTester } from "./desk-role.ts";
import { hisMatchForPack, mergeHisWoodRiverCards, NATHAN_DESK_EMAIL, shouldPaintHisCards } from "./his-wood-river.ts";
import { canonicalEmail, isOwnerIdentity, isSamePerson } from "./identity.ts";
import { listLocalPacks, type LocalPack, type StorageLike } from "./local-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { isRodeoMonroeWakePack } from "./rodeo-monroe-wake.ts";
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

export function packOwnerEmailForWrite(
  user: ScopeUser,
  existing?: string,
  pack?: { packId?: string; title?: string; client?: string; site?: string; siteId?: string },
) {
  if (hisMatchForPack({ ...pack, ownerEmail: existing })) {
    const current = canonicalEmail(existing) || (existing || "").trim().toLowerCase();
    if (current === NATHAN_DESK_EMAIL || isOwnerIdentity(current)) {
      return isOwnerIdentity(current) ? ownerVaultEmail() : NATHAN_DESK_EMAIL;
    }
    return NATHAN_DESK_EMAIL;
  }
  if (isTester(user)) return user.email.trim().toLowerCase();
  const current = (existing || "").trim();
  if (current && (isOwnerVaultEmail(current) || isSamePerson(current, user.email))) {
    return ownerVaultEmail();
  }
  // A leftover owner flush must not restamp a tester-owned share as the owner vault.
  if (current && !isSamePerson(current, user.email)) {
    return canonicalEmail(current) || current.trim().toLowerCase();
  }
  return ownerVaultEmail();
}

export type ScopedPack = {
  ownerEmail?: string;
  sharedWith?: string[];
  transferredFrom?: string;
  packId?: string;
  title?: string;
  client?: string;
  site?: string;
  siteId?: string;
};

/** Madison-operated identity — HIS / wake / P66-Yates-Monroe plants. Not Hit Squad product work. */
export function isMadisonOperatedPack(pack?: ScopedPack | null): boolean {
  if (!pack) return false;
  if (hisMatchForPack(pack)) return true;
  if (pack.packId && isRodeoMonroeWakePack({ packId: pack.packId, title: pack.title, site: pack.site, siteId: pack.siteId })) {
    return true;
  }
  return inferCompanyIdFromParts(pack.client, pack.site, pack.title, pack.siteId) === "madison";
}

export function packSharedEmails(pack: { sharedWith?: string[] }) {
  return normalizeEmails(pack.sharedWith);
}

export function packVisibleTo(user: ScopeUser, pack: ScopedPack) {
  if (isOwner(user)) return true;
  const ownerEmail = packOwnerKey(pack.ownerEmail);
  const email = user.email.trim().toLowerCase();
  if (!ownerEmail) return false;
  if (ownerEmail === email || packSharedEmails(pack).includes(email)) {
    return isTester(user) || hasWorkingDesk(user);
  }
  if (isTester(user)) return false;
  if (hasWorkingDesk(user)) return isOwnerVaultEmail(pack.ownerEmail);
  return false;
}

function transferredFromOwner(user: ScopeUser, pack: ScopedPack) {
  const from = (pack.transferredFrom || "").trim().toLowerCase();
  if (!from) return false;
  return from === user.email.trim().toLowerCase() || isOwnerVaultEmail(from);
}

/** Owner Company cards. Does not grant leftover write — use packVisibleTo for writes. */
export function packListedOnOwnerDesk(user: ScopeUser, pack: ScopedPack) {
  if (isPresident(user)) {
    if (isMadisonOperatedPack(pack)) return true;
    const ownerEmail = packOwnerKey(pack.ownerEmail);
    const email = user.email.trim().toLowerCase();
    return ownerEmail === email || packSharedEmails(pack).includes(email);
  }
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
  if (!hasWorkingDesk(user)) return false;
  if (isPresident(user)) {
    if (isMadisonOperatedPack(pack)) return true;
    return Boolean(ownerEmail) && (ownerEmail === email || packSharedEmails(pack).includes(email));
  }
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
  const packs = mergeDummyPacks(
    localPacksForUser(user, listLocalPacks(store)).filter((pack) => !viewingAs || !pack.archived),
    next,
  );
  if (shouldPaintHisCards(user)) return mergeHisWoodRiverCards(packs);
  return packs;
}

export function canWritePack(user: ScopeUser, pack: ScopedPack) {
  if (isOwner(user)) return true;
  if (isTester(user)) return packVisibleTo(user, pack);
  return hasWorkingDesk(user) && packVisibleTo(user, pack);
}
