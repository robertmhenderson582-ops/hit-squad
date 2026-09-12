/** Client-safe HSE vault copy and list helpers. No Drive / Node imports. */

import { vaultFileVisibleToViewer, type VaultListViewer } from "./vault-list-filter.ts";

export const HSE_VAULT_WRITE_ERROR =
  "Could not save to the HSE vault. Those files are only on this desk. Try again.";
/** Owner / build desk only. Never send to testers. No SA email, no Drive ids. */
export const HSE_VAULT_SHARE_ERROR =
  "HSE vault is not writable by the desk. Share the HSE room with the vault account as writer.";
export const HSE_VAULT_MISSING_ERROR =
  "HSE vault folder was not found. Confirm the HSE room is shared with the vault account.";
export const HSE_UNVAULTED_MARK = "on this desk only — not saved yet";
/** Per-bar lock marker inside a company-doc vault folder. Never a library file. */
export const HSE_LIBRARY_LOCK_NAME = "hse-library.lock.json";
export const HSE_LIBRARY_LOCK_KIND = "hse-library-lock";
export const HSE_COMPANY_DOC_LOCKED_NOTE = "This library is locked";

export function isHseLibraryLockName(name?: string | null) {
  return (name || "").trim() === HSE_LIBRARY_LOCK_NAME;
}

export type HseVaultPlace = {
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobId?: string;
  jobLabel?: string;
  folderId: string;
  companyDocs?: boolean;
  /** Pre-job Ready HSE package shelf — company / Ready HSE packages / kit. */
  shelf?: boolean;
  packageLabel?: string;
  /** Server-only uploader stamp. Never send Drive ids to testers. */
  who?: string;
};

export type HseVaultTreeRow = {
  path: string[];
  files: string[];
};

export type HseListedFile = {
  name: string;
  type: string;
  data?: string;
  vaulted: boolean;
  /** Standing library file — listed, not removable. Never a Drive id. */
  protected?: boolean;
};

export function hseVaultStored(store?: string | null, stored?: boolean) {
  return store === "drive" && stored !== false;
}

export function hseDropLeaks(payload: unknown) {
  return /hse-briefs\.json|quality-briefs\.json|1A7anV1UKx8m7|1IATimbehupRHwa9|141Js9RQZKXq|1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|DRIVE_HSE|DRIVE_QUALITY|drive\.google\.com|owner vault|hitsquad-vault@|iam\.gserviceaccount\.com/i.test(
    JSON.stringify(payload ?? ""),
  );
}

export function mergeHseListedProtected(
  current: boolean | undefined,
  incoming: boolean | undefined,
) {
  return Boolean(current) && Boolean(incoming);
}

export function mergeVaultedHseFiles(
  vault: Array<{ name?: string; type?: string; protected?: boolean }>,
  local: Array<{ name?: string; type?: string; data?: string }>,
  viewer?: VaultListViewer,
): HseListedFile[] {
  const listed: HseListedFile[] = [];
  const seen = new Set<string>();
  for (const file of vault) {
    const name = (file.name || "").trim();
    if (!name || isHseLibraryLockName(name) || !vaultFileVisibleToViewer(file, viewer)) continue;
    if (seen.has(name)) {
      const row = listed.find((item) => item.name === name);
      if (row) row.protected = mergeHseListedProtected(row.protected, file.protected);
      continue;
    }
    seen.add(name);
    listed.push({
      name,
      type: file.type || "application/octet-stream",
      vaulted: true,
      ...(file.protected ? { protected: true } : {}),
    });
  }
  for (const file of local) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name) || isHseLibraryLockName(name) || !vaultFileVisibleToViewer(file, viewer) || !file.data) continue;
    seen.add(name);
    listed.push({
      name,
      type: file.type || "application/octet-stream",
      data: file.data,
      vaulted: false,
    });
  }
  return listed;
}
