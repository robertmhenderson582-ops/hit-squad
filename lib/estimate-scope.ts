import { hasBuildDesk, isTester } from "./desk-role.ts";
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
  return email.trim().toLowerCase() === ownerVaultEmail();
}

export function packOwnerEmailForWrite(user: ScopeUser, existing?: string) {
  if (isTester(user)) return user.email.trim().toLowerCase();
  const current = (existing || "").trim().toLowerCase();
  if (current && (isOwnerVaultEmail(current) || current === user.email.trim().toLowerCase())) {
    return current;
  }
  return ownerVaultEmail();
}

export type ScopedPack = { ownerEmail?: string; sharedWith?: string[]; transferredFrom?: string };

export function packSharedEmails(pack: { sharedWith?: string[] }) {
  return normalizeEmails(pack.sharedWith);
}

export function packVisibleTo(user: ScopeUser, pack: ScopedPack) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  if (!ownerEmail) return false;
  if (ownerEmail === email || packSharedEmails(pack).includes(email)) {
    return isTester(user) || hasBuildDesk(user);
  }
  if (isTester(user)) return false;
  if (hasBuildDesk(user)) return isOwnerVaultEmail(ownerEmail);
  return false;
}

export function isPackOwner(user: ScopeUser, pack: { ownerEmail?: string }) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  return ownerEmail === email || (user.role === "owner" && isOwnerVaultEmail(ownerEmail));
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
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  if (isTester(user)) {
    return Boolean(ownerEmail) && (ownerEmail === email || packSharedEmails(pack).includes(email));
  }
  if (!hasBuildDesk(user)) return false;
  if (!ownerEmail) return true;
  return isOwnerVaultEmail(ownerEmail) || ownerEmail === email || packSharedEmails(pack).includes(email);
}

export function localPacksForUser<T extends ScopedPack>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => localPackVisibleTo(user, pack));
}

export function canWritePack(user: ScopeUser, pack: ScopedPack) {
  if (isTester(user)) return packVisibleTo(user, pack);
  return hasBuildDesk(user) && packVisibleTo(user, pack);
}
