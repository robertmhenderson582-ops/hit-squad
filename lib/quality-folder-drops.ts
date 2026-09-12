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
  QUALITY_DROP_SIZE_ERROR,
  QUALITY_DROP_TYPE_ERROR,
  checkQualityDrop,
  isQualityFolderId,
  mergeQualityFolderFiles,
  qualityFolderBriefId,
  qualityFolderDropsFor,
  qualityFolderLabel,
  showsQualityFolderDesk,
  type QualityFolderId,
} from "./quality-folders.ts";
import { DriveApiError } from "./drive-estimates.ts";
import { isQualityReadyShelfJobId } from "./quality-package-shelf.ts";
import {
  listQualityVaultFiles,
  listQualityVaultTree,
  persistQualityVaultFiles,
  qualityVaultWriteUserError,
} from "./quality-vault.ts";
import type { QualityVaultTreeRow } from "./quality-vault-shared.ts";
import type { PublicUser } from "./types.ts";
import {
  filterVaultBriefsForViewer,
  filterVaultListedFiles,
  filterVaultTreeForViewer,
} from "./vault-list-filter.ts";

export type QualityDropUser = Pick<PublicUser, "email" | "name" | "role">;

export type QualityFolderSaveInput = {
  jobId?: unknown;
  folderId?: unknown;
  files?: unknown;
  companyId?: unknown;
  companyLabel?: unknown;
  siteLabel?: unknown;
  jobLabel?: unknown;
};

function qualityDropCompanyId(input: { companyId?: unknown }) {
  return typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
}

function qualityFolderAllowed(folderId: unknown, companyId?: string) {
  if (companyId && !showsQualityFolderDesk(companyId)) return false;
  return isQualityFolderId(folderId, companyId);
}

export function parseQualityDropFiles(raw: unknown): LeadFile[] {
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

export function qualityFolderSaveError(input: QualityFolderSaveInput) {
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  const companyId = qualityDropCompanyId(input);
  if (!jobId) return { status: 400, error: "Pick a job." };
  if (!qualityFolderAllowed(input.folderId, companyId)) return { status: 400, error: "Pick a Quality folder." };
  const files = parseQualityDropFiles(input.files);
  if (!files.length) return { status: 400, error: "Drop at least one file." };
  const check = checkQualityDrop(files);
  if (!check.ok) return { status: 400, error: check.error };
  return null;
}

export async function saveQualityFolderDrop(user: QualityDropUser, input: QualityFolderSaveInput) {
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  const companyId = qualityDropCompanyId(input);
  if (!jobId) return { ok: false as const, status: 400, error: "Pick a job." };
  if (!qualityFolderAllowed(folderId, companyId) || !isQualityFolderId(folderId, companyId)) {
    return { ok: false as const, status: 400, error: "Pick a Quality folder." };
  }
  const incoming = parseQualityDropFiles(input.files);
  const check = checkQualityDrop(incoming);
  if (!check.accepted.length) {
    return {
      ok: false as const,
      status: 400,
      error: check.rejected[0]?.error || "Drop at least one file.",
      rejected: check.rejected,
    };
  }
  const who = user.email.trim().toLowerCase();
  const existing = await listStoredBriefs("quality", who, { jobId, folderId, companyId });
  const prior = existing[0];
  const merged = mergeQualityFolderFiles(prior?.files ?? [], check.accepted as LeadFile[]);
  const companyLabel = typeof input.companyLabel === "string" ? input.companyLabel : undefined;
  const siteLabel = typeof input.siteLabel === "string" ? input.siteLabel : undefined;
  const jobLabel = typeof input.jobLabel === "string" ? input.jobLabel : undefined;
  try {
    await persistQualityVaultFiles(leadBriefAdapter("quality"), {
      companyId,
      companyLabel,
      siteLabel,
      jobId,
      jobLabel,
      folderId,
      who,
      shelf: isQualityReadyShelfJobId(jobId),
      packageLabel: jobLabel,
    }, check.accepted as LeadFile[]);
    const brief = await saveStoredBrief({
      kind: "quality",
      who,
      whoName: user.name,
      describe: qualityFolderLabel(folderId, companyId),
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
    console.warn(`quality-vault: folder write failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
      rejected: check.rejected,
    };
  }
}

export async function listQualityFolderDrops(
  user: QualityDropUser,
  jobId: string,
  folderId: QualityFolderId,
  companyId?: string,
  place?: { companyLabel?: string; siteLabel?: string; jobLabel?: string },
) {
  const job = jobId.trim();
  const company = companyId?.trim() || undefined;
  if (!job || !qualityFolderAllowed(folderId, company)) {
    return {
      briefs: [] as PublicLeadBrief[],
      files: [] as Array<{ name: string; type: string }>,
      store: "server-json-file" as const,
      stored: false as const,
    };
  }
  // Briefs index is metadata after a confirmed Drive write. Refresh merges Drive names + brief names.
  const who = hasBuildDesk(user) ? undefined : user.email;
  const briefs = await listStoredBriefs("quality", who, { jobId: job, folderId, companyId: company });
  const mine = qualityFolderDropsFor(briefs, job, folderId, hasBuildDesk(user) ? undefined : user.email);
  const briefFiles = mine.flatMap((row) => row.files);
  const vault = await listQualityVaultFiles(leadBriefAdapter("quality"), {
    companyId: company,
    companyLabel: place?.companyLabel,
    siteLabel: place?.siteLabel,
    jobId: job,
    jobLabel: place?.jobLabel,
    folderId,
    who,
    shelf: isQualityReadyShelfJobId(job),
    packageLabel: place?.jobLabel,
  }, user);
  const files = vault.stored ? filterVaultListedFiles(mergeVaultedQualityNames(vault.files, briefFiles), user) : [];
  return {
    briefs: filterVaultBriefsForViewer(briefs.map(publicBrief), user),
    files,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

function mergeVaultedQualityNames(
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

export async function listQualityVaultOwnerTree(user: QualityDropUser) {
  if (!hasBuildDesk(user)) return [] as QualityVaultTreeRow[];
  return filterVaultTreeForViewer(await listQualityVaultTree(leadBriefAdapter("quality")), user);
}

export function qualityFolderRowId(who: string, jobId: string, folderId: QualityFolderId) {
  return qualityFolderBriefId(who, jobId, folderId);
}

export { qualityDropLeaks } from "./quality-vault-shared.ts";

export function visibleQualityBriefsForTester(briefs: StoredLeadBrief[], who: string) {
  return briefs.filter((row) => row.who === who.trim().toLowerCase());
}

export { QUALITY_DROP_SIZE_ERROR, QUALITY_DROP_TYPE_ERROR };
