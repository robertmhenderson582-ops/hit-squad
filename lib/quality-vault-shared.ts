/** Client-safe Quality vault copy and list helpers. No Drive / Node imports. */

export const QUALITY_VAULT_WRITE_ERROR =
  "Could not save to the Quality vault. Those files are only on this desk. Try again.";
export const QUALITY_UNVAULTED_MARK = "on this desk only — not saved yet";

export type QualityVaultPlace = {
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobId?: string;
  jobLabel?: string;
  folderId: string;
  companyDocs?: boolean;
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

export function mergeVaultedQualityFiles(
  vault: Array<{ name?: string; type?: string }>,
  local: Array<{ name?: string; type?: string; data?: string }>,
): QualityListedFile[] {
  const listed: QualityListedFile[] = [];
  const seen = new Set<string>();
  for (const file of vault) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    listed.push({
      name,
      type: file.type || "application/octet-stream",
      vaulted: true,
    });
  }
  for (const file of local) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name) || !file.data) continue;
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
