import { hasBuildDesk } from "./desk-role.ts";
import {
  leadBriefAdapter,
  listStoredBriefs,
  publicBrief,
  saveStoredBrief,
  type StoredLeadBrief,
} from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import {
  HSE_DROP_SIZE_ERROR,
  HSE_DROP_TYPE_ERROR,
  checkHseDrop,
  isHseFolderId,
  mergeHseFolderFiles,
  hseFolderBriefId,
  hseFolderDropsFor,
  hseFolderLabel,
  showsHseFolderDesk,
  type HseFolderId,
} from "./hse-folders.ts";
import { DriveApiError } from "./drive-estimates.ts";
import { isHseReadyShelfJobId } from "./hse-package-shelf.ts";
import {
  listHseVaultFiles,
  listHseVaultTree,
  persistHseVaultFiles,
  hseVaultWriteUserError,
} from "./hse-vault.ts";
import type { HseVaultTreeRow } from "./hse-vault-shared.ts";
import type { PublicUser } from "./types.ts";
import {
  filterVaultBriefsForViewer,
  filterVaultListedFiles,
  filterVaultTreeForViewer,
} from "./vault-list-filter.ts";

export type HseDropUser = Pick<PublicUser, "email" | "name" | "role">;

export type HseFolderSaveInput = {
  jobId?: unknown;
  folderId?: unknown;
  files?: unknown;
  companyId?: unknown;
  companyLabel?: unknown;
  siteLabel?: unknown;
  jobLabel?: unknown;
};

function hseDropCompanyId(input: { companyId?: unknown }) {
  return typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
}

function hseFolderAllowed(folderId: unknown, companyId?: string) {
  if (companyId && !showsHseFolderDesk(companyId)) return false;
  return isHseFolderId(folderId, companyId);
}

export function parseHseDropFiles(raw: unknown): LeadFile[] {
  if (!Array.isArray(raw)) return [];
  const files: LeadFile[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const file = row as { name?: unknown; type?: unknown; data?: unknown };
    if (typeof file.name !== "string" || !file.name.trim()) continue;
    if (typeof file.data !== "string" || !file.data) continue;
    files.push({
      name: file.name.replace(/\\/g, "/").split("/").pop()?.trim() || "file",
      type: typeof file.type === "string" && file.type.trim() ? file.type : "application/octet-stream",
      data: file.data,
    });
  }
  return files;
}

export function hseFolderSaveError(input: HseFolderSaveInput) {
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  const companyId = hseDropCompanyId(input);
  if (!jobId) return { status: 400, error: "Pick a job." };
  if (!hseFolderAllowed(input.folderId, companyId)) return { status: 400, error: "Pick a HSE folder." };
  const files = parseHseDropFiles(input.files);
  if (!files.length) return { status: 400, error: "Drop at least one file." };
  const check = checkHseDrop(files);
  if (!check.ok) return { status: 400, error: check.error };
  return null;
}

export async function saveHseFolderDrop(user: HseDropUser, input: HseFolderSaveInput) {
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  const companyId = hseDropCompanyId(input);
  if (!jobId) return { ok: false as const, status: 400, error: "Pick a job." };
  if (!hseFolderAllowed(folderId, companyId) || !isHseFolderId(folderId, companyId)) {
    return { ok: false as const, status: 400, error: "Pick a HSE folder." };
  }
  const incoming = parseHseDropFiles(input.files);
  const check = checkHseDrop(incoming);
  if (!check.accepted.length) {
    return {
      ok: false as const,
      status: 400,
      error: check.rejected[0]?.error || "Drop at least one file.",
      rejected: check.rejected,
    };
  }
  const who = user.email.trim().toLowerCase();
  const existing = await listStoredBriefs("hse", who, { jobId, folderId, companyId });
  const prior = existing[0];
  const merged = mergeHseFolderFiles(prior?.files ?? [], check.accepted as LeadFile[]);
  const companyLabel = typeof input.companyLabel === "string" ? input.companyLabel : undefined;
  const siteLabel = typeof input.siteLabel === "string" ? input.siteLabel : undefined;
  const jobLabel = typeof input.jobLabel === "string" ? input.jobLabel : undefined;
  try {
    await persistHseVaultFiles(leadBriefAdapter("hse"), {
      companyId,
      companyLabel,
      siteLabel,
      jobId,
      jobLabel,
      folderId,
      who,
      shelf: isHseReadyShelfJobId(jobId),
      packageLabel: jobLabel,
    }, check.accepted as LeadFile[]);
    const brief = await saveStoredBrief({
      kind: "hse",
      who,
      whoName: user.name,
      describe: hseFolderLabel(folderId, companyId),
      files: merged,
      jobId,
      folderId,
      companyId,
      mergeFiles: true,
    });
    return {
      ok: true as const,
      brief: publicBrief(brief),
      rejected: check.rejected,
      kept: merged.map((file) => file.name),
      stored: true as const,
      store: "drive" as const,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`hse-vault: folder write failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
      rejected: check.rejected,
    };
  }
}

export async function listHseFolderDrops(
  user: HseDropUser,
  jobId: string,
  folderId: HseFolderId,
  companyId?: string,
  place?: { companyLabel?: string; siteLabel?: string; jobLabel?: string },
) {
  const job = jobId.trim();
  const company = companyId?.trim() || undefined;
  if (!job || !hseFolderAllowed(folderId, company)) {
    return {
      briefs: [] as PublicLeadBrief[],
      files: [] as Array<{ name: string; type: string }>,
      store: "server-json-file" as const,
      stored: false as const,
    };
  }
  // Briefs index is metadata after a confirmed Drive write. Refresh merges Drive names + brief names.
  const who = hasBuildDesk(user) ? undefined : user.email;
  const briefs = await listStoredBriefs("hse", who, { jobId: job, folderId, companyId: company });
  const mine = hseFolderDropsFor(briefs, job, folderId, hasBuildDesk(user) ? undefined : user.email);
  const briefFiles = mine.flatMap((row) => row.files);
  const vault = await listHseVaultFiles(leadBriefAdapter("hse"), {
    companyId: company,
    companyLabel: place?.companyLabel,
    siteLabel: place?.siteLabel,
    jobId: job,
    jobLabel: place?.jobLabel,
    folderId,
    who,
    shelf: isHseReadyShelfJobId(job),
    packageLabel: place?.jobLabel,
  }, user);
  const files = vault.stored ? filterVaultListedFiles(mergeVaultedHseNames(vault.files, briefFiles), user) : [];
  return {
    briefs: filterVaultBriefsForViewer(briefs.map(publicBrief), user),
    files,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

function mergeVaultedHseNames(
  vault: Array<{ name: string; type: string }>,
  extra: Array<{ name: string; type: string }>,
) {
  const seen = new Set<string>();
  const files: Array<{ name: string; type: string }> = [];
  for (const file of [...vault, ...extra]) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    files.push({ name, type: file.type || "application/octet-stream" });
  }
  return files;
}

export async function listHseVaultOwnerTree(user: HseDropUser) {
  if (!hasBuildDesk(user)) return [] as HseVaultTreeRow[];
  return filterVaultTreeForViewer(await listHseVaultTree(leadBriefAdapter("hse")), user);
}

export function hseFolderRowId(who: string, jobId: string, folderId: HseFolderId) {
  return hseFolderBriefId(who, jobId, folderId);
}

export { hseDropLeaks } from "./hse-vault-shared.ts";

export function visibleHseBriefsForTester(briefs: StoredLeadBrief[], who: string) {
  return briefs.filter((row) => row.who === who.trim().toLowerCase());
}

export { HSE_DROP_SIZE_ERROR, HSE_DROP_TYPE_ERROR };
