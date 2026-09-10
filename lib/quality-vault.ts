import { companyName, type CompanyId } from "./companies.ts";
import { briefsFolderId, qualityFolderId } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, type DriveAdapter, type DriveFile } from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { isQualityCompanyDocsJobId, qualityCompanyDocLabel, type QualityCompanyDocId } from "./quality-company-docs.ts";
import { qualityFolderLabel, type QualityFolderId } from "./quality-folders.ts";
import {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
} from "./quality-vault-shared.ts";

export {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
};

export function qualityVaultFolderName(name: string) {
  const cleaned = name
    .replace(/[\\/]+/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "folder";
}

export function qualityCompanyVaultLabel(companyId?: string, companyLabel?: string) {
  const typed = (companyLabel || "").trim();
  if (typed) return qualityVaultFolderName(typed);
  const id = (companyId || "").trim().toLowerCase();
  if (id) return qualityVaultFolderName(companyName(id as CompanyId) || id);
  return "Madison";
}

export function qualityVaultPath(place: QualityVaultPlace): string[] {
  const company = qualityCompanyVaultLabel(place.companyId, place.companyLabel);
  const folder = qualityVaultFolderName(
    place.companyDocs
      ? qualityCompanyDocLabel(place.folderId as QualityCompanyDocId, place.companyId)
      : qualityFolderLabel(place.folderId as QualityFolderId, place.companyId),
  );
  if (place.companyDocs || isQualityCompanyDocsJobId(place.jobId)) {
    return [company, folder];
  }
  const site = qualityVaultFolderName((place.siteLabel || "").trim() || "Site");
  const job = qualityVaultFolderName((place.jobLabel || place.jobId || "").trim() || "Job");
  return [company, site, job, folder];
}

export function qualityDriveReady(drive?: DriveAdapter | null) {
  return Boolean(
    drive?.configured && drive.listChildren && drive.createFolder && drive.uploadBytes && drive.updateBytes,
  );
}

function decodeLeadBytes(file: LeadFile) {
  return Uint8Array.from(Buffer.from(file.data, "base64"));
}

export async function ensureQualityVaultPath(drive: DriveAdapter, place: QualityVaultPlace) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  let parent = qualityFolderId();
  for (const name of qualityVaultPath(place)) {
    const kids = await drive.listChildren!(parent);
    const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
    if (existing?.id) {
      parent = existing.id;
      continue;
    }
    const created = await drive.createFolder!(parent, name);
    if (!created?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    parent = created.id;
  }
  return parent;
}

export async function writeQualityVaultFiles(drive: DriveAdapter, folderId: string, files: LeadFile[]) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const kids = await drive.listChildren!(folderId);
  const written: DriveFile[] = [];
  for (const file of files) {
    if (!file.name || !file.data) continue;
    const bytes = decodeLeadBytes(file);
    const mime = file.type || "application/octet-stream";
    const existing = kids.find((row) => row.name === file.name && row.mimeType !== DRIVE_FOLDER_MIME);
    const row = existing?.id
      ? await drive.updateBytes!(existing.id, bytes, mime)
      : await drive.uploadBytes!(folderId, file.name, bytes, mime, { kind: "quality-file" });
    if (!row?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    const confirmed = drive.readBytes ? await drive.readBytes(row.id) : bytes;
    if (drive.readBytes && confirmed.length !== bytes.length) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    written.push(row);
    if (existing) existing.id = row.id;
    else kids.push({ ...row, name: file.name });
  }
  return written;
}

export async function persistQualityVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  files: LeadFile[],
) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const incoming = files.filter((file) => file.name && file.data);
  if (!incoming.length) throw new Error("Drop at least one file.");
  const folderId = await ensureQualityVaultPath(drive as DriveAdapter, place);
  const written = await writeQualityVaultFiles(drive as DriveAdapter, folderId, incoming);
  if (written.length !== incoming.length) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  return { folderId, files: written, path: qualityVaultPath(place), store: "drive" as const };
}

export function briefsIndexFolderId() {
  return briefsFolderId("quality");
}
