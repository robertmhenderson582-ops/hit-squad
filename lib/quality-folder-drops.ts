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
import { persistQualityVaultFiles, QUALITY_VAULT_WRITE_ERROR } from "./quality-vault.ts";
import type { PublicUser } from "./types.ts";

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
    await persistQualityVaultFiles(leadBriefAdapter(), {
      companyId,
      companyLabel,
      siteLabel,
      jobId,
      jobLabel,
      folderId,
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
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: QUALITY_VAULT_WRITE_ERROR,
      rejected: check.rejected,
    };
  }
}

export async function listQualityFolderDrops(
  user: QualityDropUser,
  jobId: string,
  folderId: QualityFolderId,
  companyId?: string,
) {
  const job = jobId.trim();
  const company = companyId?.trim() || undefined;
  if (!job || !qualityFolderAllowed(folderId, company)) {
    return { briefs: [] as PublicLeadBrief[], files: [] as Array<{ name: string; type: string }> };
  }
  const who = hasBuildDesk(user) ? undefined : user.email;
  const briefs = await listStoredBriefs("quality", who, { jobId: job, folderId, companyId: company });
  const mine = qualityFolderDropsFor(briefs, job, folderId, hasBuildDesk(user) ? undefined : user.email);
  const files = mine.flatMap((row) => row.files);
  return {
    briefs: briefs.map(publicBrief),
    files,
  };
}

export function qualityFolderRowId(who: string, jobId: string, folderId: QualityFolderId) {
  return qualityFolderBriefId(who, jobId, folderId);
}

export function qualityDropLeaks(payload: unknown) {
  return /quality-briefs\.json|1A7anV1UKx8m7|141Js9RQZKXq|1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|DRIVE_QUALITY|drive\.google\.com|owner vault/i.test(
    JSON.stringify(payload ?? ""),
  );
}

export function visibleQualityBriefsForTester(briefs: StoredLeadBrief[], who: string) {
  return briefs.filter((row) => row.who === who.trim().toLowerCase());
}

export { QUALITY_DROP_SIZE_ERROR, QUALITY_DROP_TYPE_ERROR };
