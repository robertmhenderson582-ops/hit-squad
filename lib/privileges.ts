import type { PrivilegeId } from "./types.ts";
import { isRateVaultJamesEmail } from "./rate-vault.ts";

export type { PrivilegeId };

/** Owner-only capabilities that Settings → Privileges can grant or revoke. */
export const OWNER_ONLY_PRIVILEGES: readonly PrivilegeId[] = [
  "manage-users",
  "hitsquad-seats",
  "inbox-expand",
  "archive-delete",
  "view-as",
  "owner-log",
  "vault-wipe",
  "alias-config",
  "unaliased-export",
  "designer-ship",
  "security-billing",
  "rate-vault",
] as const;

export const PRIVILEGE_COPY: Record<PrivilegeId, { label: string; detail: string }> = {
  "manage-users": {
    label: "Manage users",
    detail: "Add users, issue passwords, and assign companies.",
  },
  "hitsquad-seats": {
    label: "Hit Squad seats",
    detail: "See operators assigned to Hit Squad. Hidden from President by default.",
  },
  "inbox-expand": {
    label: "Inbox circle expand",
    detail: "See Hit Squad Inbox contacts beyond the Madison circle.",
  },
  "archive-delete": {
    label: "Archive / Delete",
    detail: "Job card Archive, Delete, and Restore.",
  },
  "view-as": {
    label: "View as",
    detail: "Open another seat’s desk.",
  },
  "owner-log": {
    label: "Owner log",
    detail: "Delete or clear the Activity ledger.",
  },
  "vault-wipe": {
    label: "Vault / wipe",
    detail: "Data vault and wipe tools.",
  },
  "alias-config": {
    label: "Reveal / alias config",
    detail: "Turn catalog aliases on or off.",
  },
  "unaliased-export": {
    label: "Unaliased exports",
    detail: "Export real names with aliases off.",
  },
  "designer-ship": {
    label: "Designer / ship",
    detail: "Republish, Sites regular, and ship tools.",
  },
  "security-billing": {
    label: "Security / billing",
    detail: "Owner lock times and billing controls.",
  },
  "rate-vault": {
    label: "Rate Vault",
    detail: "P66 B-1 / rate builder workshop. Owner plus the Rate Vault seat. Hidden from testers unless granted.",
  },
};

/** Locked shared President desk. Not grant/revoke items. */
export const PRESIDENT_SHARED = [
  "Home doors",
  "Madison Jobs / estimate / Excel / Rates / Cost / CO / Purchasing / Quality / HSE",
  "Activity view",
  "Madison Inbox",
  "Profile / password / branding view",
  "Madison presence",
] as const;

export type PrivilegeViewer = {
  role?: string;
  email?: string;
  privileges?: readonly string[] | null;
};

export function isPrivilegeId(value: unknown): value is PrivilegeId {
  return typeof value === "string" && (OWNER_ONLY_PRIVILEGES as readonly string[]).includes(value);
}

export function normalizePrivileges(raw: unknown): PrivilegeId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isPrivilegeId))];
}

export function hasPrivilege(user: PrivilegeViewer | null | undefined, privilege: PrivilegeId): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (privilege === "rate-vault" && isRateVaultJamesEmail(user.email)) return true;
  return (user.privileges ?? []).includes(privilege);
}

export function grantedPrivileges(user: PrivilegeViewer | null | undefined): PrivilegeId[] {
  if (!user) return [];
  if (user.role === "owner") return [...OWNER_ONLY_PRIVILEGES];
  const next = normalizePrivileges(user.privileges);
  if (isRateVaultJamesEmail(user.email) && !next.includes("rate-vault")) next.push("rate-vault");
  return next;
}
