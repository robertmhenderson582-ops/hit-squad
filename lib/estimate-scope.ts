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
  if (existing && isOwnerVaultEmail(existing)) return ownerVaultEmail();
  return ownerVaultEmail();
}

export function packVisibleTo(user: ScopeUser, pack: { ownerEmail?: string }) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  if (isTester(user)) return Boolean(ownerEmail) && ownerEmail === email;
  if (hasBuildDesk(user)) return isOwnerVaultEmail(ownerEmail) || ownerEmail === email;
  return false;
}

export function visiblePacks<T extends { ownerEmail?: string }>(user: ScopeUser, packs: T[]) {
  return packs.filter((pack) => packVisibleTo(user, pack));
}

export function canWritePack(user: ScopeUser, pack: { ownerEmail?: string }) {
  if (isTester(user)) return packVisibleTo(user, pack);
  return hasBuildDesk(user) && packVisibleTo(user, pack);
}
