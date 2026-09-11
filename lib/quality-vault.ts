import { companyName, type CompanyId } from "./companies.ts";
import { QUALITY_BRIEFS_VAULT_NAME, briefsFolderId, qualityFolderId } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, DriveApiError, type DriveAdapter, type DriveFile } from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { isQualityCompanyDocsJobId, qualityCompanyDocLabel, type QualityCompanyDocId } from "./quality-company-docs.ts";
import { qualityFolderLabel, type QualityFolderId } from "./quality-folders.ts";
import {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
  type QualityVaultTreeRow,
} from "./quality-vault-shared.ts";

export {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
  type QualityVaultTreeRow,
};

/** Status only. Never return Drive messages, SA email, or folder ids. */
export function qualityVaultDriveStatus(error: unknown) {
  if (error instanceof DriveApiError && error.status) return error.status;
  if (error instanceof Error) {
    const match = /\b(403|404)\b/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return 0;
}

/** Testers always get QUALITY_VAULT_WRITE_ERROR. Owner sees share/missing copy on 403/404. */
export function qualityVaultWriteUserError(error: unknown, ownerFacing: boolean) {
  if (!ownerFacing) return QUALITY_VAULT_WRITE_ERROR;
  const status = qualityVaultDriveStatus(error);
  if (status === 403) return QUALITY_VAULT_SHARE_ERROR;
  if (status === 404) return QUALITY_VAULT_MISSING_ERROR;
  return QUALITY_VAULT_WRITE_ERROR;
}

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

function qualityFileProperties(who?: string): Record<string, string> {
  const stamp = (who || "").trim().toLowerCase();
  return stamp ? { kind: "quality-file", who: stamp } : { kind: "quality-file" };
}

export async function writeQualityVaultFiles(drive: DriveAdapter, folderId: string, files: LeadFile[], who?: string) {
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
      : await drive.uploadBytes!(folderId, file.name, bytes, mime, qualityFileProperties(who));
    if (!row?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    const confirmed = drive.readBytes ? await drive.readBytes(row.id) : bytes;
    if (drive.readBytes && confirmed.length !== bytes.length) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    written.push({ ...row, properties: { ...row.properties, ...qualityFileProperties(who) } });
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
  const written = await writeQualityVaultFiles(drive as DriveAdapter, folderId, incoming, place.who);
  if (written.length !== incoming.length) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  return { folderId, files: written, path: qualityVaultPath(place), store: "drive" as const };
}

function isQualityVaultFile(row: DriveFile) {
  if (row.mimeType === DRIVE_FOLDER_MIME) return false;
  const name = (row.name || "").trim();
  return Boolean(name) && name !== QUALITY_BRIEFS_VAULT_NAME;
}

export function qualityVaultFileVisible(row: DriveFile, who?: string) {
  if (!isQualityVaultFile(row)) return false;
  const key = (who || "").trim().toLowerCase();
  if (!key) return true;
  return (row.properties?.who || "").trim().toLowerCase() === key;
}

/** Chance’s refresh list: Drive names at company/site/job/folder, filtered by who. Not the email-dump tree. */
export async function listQualityVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
) {
  if (!qualityDriveReady(drive)) {
    return { files: [] as Array<{ name: string; type: string }>, store: "unconfigured" as const, stored: false as const };
  }
  try {
    let parent = qualityFolderId();
    for (const name of qualityVaultPath(place)) {
      const kids = await drive!.listChildren!(parent);
      const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
      if (!existing?.id) {
        return { files: [], store: "drive" as const, stored: true as const };
      }
      parent = existing.id;
    }
    const kids = await drive!.listChildren!(parent);
    const files = kids
      .filter((row) => qualityVaultFileVisible(row, place.who))
      .map((row) => ({
        name: row.name,
        type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
      }));
    return { files, store: "drive" as const, stored: true as const };
  } catch {
    return { files: [], store: "drive" as const, stored: false as const };
  }
}

/** Bytes for open/view. Names + base64 only — never Drive ids. */
export async function readQualityVaultFile(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  fileName: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || !qualityDriveReady(drive) || !drive?.readBytes) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  try {
    let parent = qualityFolderId();
    for (const name of qualityVaultPath(place)) {
      const kids = await drive.listChildren!(parent);
      const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
      if (!existing?.id) {
        return { file: null, store: "drive" as const, stored: true as const };
      }
      parent = existing.id;
    }
    const kids = await drive.listChildren!(parent);
    const row = kids.find((item) => qualityVaultFileVisible(item, place.who) && item.name === wanted);
    if (!row?.id) {
      return { file: null, store: "drive" as const, stored: true as const };
    }
    const bytes = await drive.readBytes(row.id);
    return {
      file: {
        name: row.name,
        type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
        data: Buffer.from(bytes).toString("base64"),
      },
      store: "drive" as const,
      stored: true as const,
    };
  } catch {
    return { file: null, store: "drive" as const, stored: false as const };
  }
}

export async function listQualityVaultTree(drive: DriveAdapter | null | undefined): Promise<QualityVaultTreeRow[]> {
  if (!qualityDriveReady(drive)) return [];
  try {
    return await walkQualityVaultTree(drive as DriveAdapter, qualityFolderId(), []);
  } catch {
    return [];
  }
}

async function walkQualityVaultTree(drive: DriveAdapter, parent: string, path: string[]): Promise<QualityVaultTreeRow[]> {
  const kids = await drive.listChildren!(parent);
  const files = kids.filter(isQualityVaultFile).map((row) => row.name);
  const rows: QualityVaultTreeRow[] = files.length ? [{ path: path.length ? path : ["Quality"], files }] : [];
  for (const folder of kids.filter((row) => row.mimeType === DRIVE_FOLDER_MIME && row.id && row.name)) {
    rows.push(...(await walkQualityVaultTree(drive, folder.id, [...path, folder.name])));
  }
  return rows;
}

export function briefsIndexFolderId() {
  return briefsFolderId("quality");
}
