/** Client-safe Quality vault copy and list helpers. No Drive / Node imports. */

export const QUALITY_VAULT_WRITE_ERROR =
  "Could not save to the Quality vault. Those files are only on this desk. Try again.";
/** Owner / build desk only. Never send to testers. No SA email, no Drive ids. */
export const QUALITY_VAULT_SHARE_ERROR =
  "Quality vault is not writable by the desk. Share the Quality room with the vault account as writer.";
export const QUALITY_VAULT_MISSING_ERROR =
  "Quality vault folder was not found. Confirm the Quality room is shared with the vault account.";
export const QUALITY_UNVAULTED_MARK = "on this desk only — not saved yet";
/** Per-bar lock marker inside a company-doc vault folder. Never a library file. */
export const QUALITY_LIBRARY_LOCK_NAME = "quality-library.lock.json";
export const QUALITY_LIBRARY_LOCK_KIND = "quality-library-lock";
export const QUALITY_COMPANY_DOC_LOCKED_NOTE = "Corporate locked this library";

export function isQualityLibraryLockName(name?: string | null) {
  return (name || "").trim() === QUALITY_LIBRARY_LOCK_NAME;
}

export type QualityVaultPlace = {
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobId?: string;
  jobLabel?: string;
  folderId: string;
  companyDocs?: boolean;
  /** Server-only uploader stamp. Never send Drive ids to testers. */
  who?: string;
};

export type QualityVaultTreeRow = {
  path: string[];
  files: string[];
};

export type QualityListedFile = {
  name: string;
  type: string;
  data?: string;
  vaulted: boolean;
};

export function qualityVaultStored(store?: string | null, stored?: boolean) {
  return store === "drive" && stored !== false;
}

export function qualityDropLeaks(payload: unknown) {
  return /quality-briefs\.json|1A7anV1UKx8m7|141Js9RQZKXq|1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|DRIVE_QUALITY|drive\.google\.com|owner vault|hitsquad-vault@|iam\.gserviceaccount\.com/i.test(
    JSON.stringify(payload ?? ""),
  );
}

export function mergeVaultedQualityFiles(
  vault: Array<{ name?: string; type?: string }>,
  local: Array<{ name?: string; type?: string; data?: string }>,
): QualityListedFile[] {
  const listed: QualityListedFile[] = [];
  const seen = new Set<string>();
  for (const file of vault) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name) || isQualityLibraryLockName(name)) continue;
    seen.add(name);
    listed.push({
      name,
      type: file.type || "application/octet-stream",
      vaulted: true,
    });
  }
  for (const file of local) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name) || isQualityLibraryLockName(name) || !file.data) continue;
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
