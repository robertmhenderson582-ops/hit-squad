import { hasBuildDesk, isTester } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import type { PublicUser } from "./types.ts";

export type ScopeUser = Pick<PublicUser, "email" | "role">;

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

export function packVisibleTo(user: ScopeUser, pack: { ownerEmail?: string }) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  if (!ownerEmail) return false;
  if (isTester(user)) return ownerEmail === email;
  if (hasBuildDesk(user)) return isOwnerVaultEmail(ownerEmail) || ownerEmail === email;
  return false;
}

export function canTransferPack(user: ScopeUser, pack: { ownerEmail?: string }) {
  if (!canWritePack(user, pack)) return false;
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  return ownerEmail === user.email.trim().toLowerCase() || (user.role === "owner" && isOwnerVaultEmail(ownerEmail));
}

export function visiblePacks<T extends { ownerEmail?: string }>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => packVisibleTo(user, pack));
}

/** Local leftover work with no owner stamp stays on the signed-in owner desk only. */
export function localPackVisibleTo(user: ScopeUser, pack: { ownerEmail?: string }) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  if (isTester(user)) return Boolean(ownerEmail) && ownerEmail === email;
  if (!hasBuildDesk(user)) return false;
  if (!ownerEmail) return true;
  return isOwnerVaultEmail(ownerEmail) || ownerEmail === email;
}

export function localPacksForUser<T extends { ownerEmail?: string }>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => localPackVisibleTo(user, pack));
}

export function canWritePack(user: ScopeUser, pack: { ownerEmail?: string }) {
  if (isTester(user)) return packVisibleTo(user, pack);
  return hasBuildDesk(user) && packVisibleTo(user, pack);
}
