import { companyName, type CompanyId } from "./companies.ts";
import { QUALITY_BRIEFS_VAULT_NAME, QUALITY_CONTROL_MANUAL_FILE_ID, briefsFolderId, qualityFolderId } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, DriveApiError, type DriveAdapter, type DriveFile } from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import {
  QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  isQualityCompanyDocsJobId,
  qualityCompanyDocGoogleNativeType,
  qualityCompanyDocLabel,
  qualityCompanyDocPreviewType,
  qualityCompanyDocsListedFor,
  type QualityCompanyDocId,
} from "./quality-company-docs.ts";
import { qualityFolderLabel, type QualityFolderId } from "./quality-folders.ts";
import {
  QUALITY_LIBRARY_LOCK_KIND,
  QUALITY_LIBRARY_LOCK_NAME,
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_ERROR,
  isQualityLibraryLockName,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
  type QualityVaultTreeRow,
} from "./quality-vault-shared.ts";

export {
  QUALITY_LIBRARY_LOCK_KIND,
  QUALITY_LIBRARY_LOCK_NAME,
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_ERROR,
  isQualityLibraryLockName,
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

function isQualityLibraryLock(row: DriveFile) {
  return (
    isQualityLibraryLockName(row.name) ||
    (row.properties?.kind || "").trim() === QUALITY_LIBRARY_LOCK_KIND
  );
}

function isQualityVaultFile(row: DriveFile) {
  if (row.mimeType === DRIVE_FOLDER_MIME) return false;
  const name = (row.name || "").trim();
  return Boolean(name) && name !== QUALITY_BRIEFS_VAULT_NAME && !isQualityLibraryLock(row);
}

export function qualityLibraryLockFromKids(kids: DriveFile[]) {
  const lock = kids.find((row) => isQualityLibraryLock(row));
  if (!lock) return { locked: false, known: true as const };
  return { locked: (lock.properties?.locked || "").trim() === "1", known: true as const };
}

function isQualityVaultFolder(row: DriveFile) {
  return Boolean(row.id && row.name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
}

export function isProtectedQualityCompanyDocFile(fileId?: string | null) {
  return (fileId || "").trim() === QUALITY_CONTROL_MANUAL_FILE_ID;
}

function qualityVaultListedFile(row: DriveFile) {
  return {
    name: row.name,
    type: qualityCompanyDocPreviewType({
      name: row.name,
      type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
    }),
    ...(isProtectedQualityCompanyDocFile(row.id) ? { protected: true as const } : {}),
  };
}

async function findQualityVaultChild(drive: DriveAdapter, parent: string, name: string) {
  const kids = await drive.listChildren!(parent);
  return kids.find((row) => row.name === name && isQualityVaultFolder(row)) ?? null;
}

/**
 * One company-folder walk, then parallel bucket lists.
 * Avoids 4× stacked Drive path + briefs round-trips on Quality rail refresh.
 */
export async function listQualityCompanyDocVaultFolders(
  drive: DriveAdapter | null | undefined,
  place: { companyId?: string; who?: string },
) {
  const folders = qualityCompanyDocsListedFor(place.companyId);
  const empty = Object.fromEntries(folders.map((folder) => [folder.id, [] as Array<{ name: string; type: string }>]));
  const unlocked = Object.fromEntries(folders.map((folder) => [folder.id, false])) as Record<string, boolean>;
  if (!qualityDriveReady(drive)) {
    return {
      filesByFolder: empty,
      locksByFolder: Object.fromEntries(folders.map((folder) => [folder.id, true])) as Record<string, boolean>,
      locksKnown: false,
      store: "unconfigured" as const,
      stored: false as const,
    };
  }
  try {
    const company = qualityCompanyVaultLabel(place.companyId);
    const companyFolder = await findQualityVaultChild(drive as DriveAdapter, qualityFolderId(), company);
    if (!companyFolder?.id) {
      return {
        filesByFolder: empty,
        locksByFolder: unlocked,
        locksKnown: true,
        store: "drive" as const,
        stored: true as const,
      };
    }
    const bucketKids = await drive!.listChildren!(companyFolder.id);
    const listed = await Promise.all(
      folders.map(async (folder) => {
        const label = qualityVaultFolderName(qualityCompanyDocLabel(folder.id, place.companyId));
        const bucket = bucketKids.find((row) => row.name === label && isQualityVaultFolder(row));
        if (!bucket?.id) {
          return [folder.id, [] as Array<{ name: string; type: string }>, { locked: false, known: true }] as const;
        }
        const kids = await drive!.listChildren!(bucket.id);
        const files = kids
          .filter((row) => qualityVaultFileVisible(row, place.who))
          .map((row) => qualityVaultListedFile(row));
        return [folder.id, files, qualityLibraryLockFromKids(kids)] as const;
      }),
    );
    return {
      filesByFolder: Object.fromEntries(listed.map(([id, files]) => [id, files])) as Record<
        string,
        Array<{ name: string; type: string }>
      >,
      locksByFolder: Object.fromEntries(listed.map(([id, , lock]) => [id, lock.locked])) as Record<string, boolean>,
      locksKnown: listed.every(([, , lock]) => lock.known),
      store: "drive" as const,
      stored: true as const,
    };
  } catch {
    return {
      filesByFolder: empty,
      locksByFolder: Object.fromEntries(folders.map((folder) => [folder.id, true])) as Record<string, boolean>,
      locksKnown: false,
      store: "drive" as const,
      stored: false as const,
    };
  }
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
    return {
      files: [] as Array<{ name: string; type: string }>,
      locked: true,
      locksKnown: false,
      store: "unconfigured" as const,
      stored: false as const,
    };
  }
  try {
    let parent = qualityFolderId();
    for (const name of qualityVaultPath(place)) {
      const kids = await drive!.listChildren!(parent);
      const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
      if (!existing?.id) {
        return { files: [], locked: false, locksKnown: true, store: "drive" as const, stored: true as const };
      }
      parent = existing.id;
    }
    const kids = await drive!.listChildren!(parent);
    const files = kids
      .filter((row) => qualityVaultFileVisible(row, place.who))
      .map((row) => qualityVaultListedFile(row));
    const lock = qualityLibraryLockFromKids(kids);
    return { files, locked: lock.locked, locksKnown: lock.known, store: "drive" as const, stored: true as const };
  } catch {
    return { files: [], locked: true, locksKnown: false, store: "drive" as const, stored: false as const };
  }
}

async function qualityVaultFolderId(drive: DriveAdapter, place: QualityVaultPlace) {
  let parent = qualityFolderId();
  for (const name of qualityVaultPath(place)) {
    const existing = await findQualityVaultChild(drive, parent, name);
    if (!existing?.id) return null;
    parent = existing.id;
  }
  return parent;
}

/** Trash vaulted extras by name. Never trash the standing Quality Control Manual PDF. */
export async function trashQualityVaultFile(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  fileName: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || isQualityLibraryLockName(wanted)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  if (!qualityDriveReady(drive) || !drive?.deleteJson) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const folderId = await qualityVaultFolderId(drive as DriveAdapter, place);
  if (!folderId) {
    return { missing: true as const, protectedKept: false, trashed: 0, store: "drive" as const, stored: true as const };
  }
  const kids = await drive.listChildren!(folderId);
  const matches = kids.filter((item) => isQualityVaultFile(item) && item.name === wanted && item.id);
  const extras = matches.filter((item) => !isProtectedQualityCompanyDocFile(item.id));
  const protectedKept = matches.some((item) => isProtectedQualityCompanyDocFile(item.id));
  if (!extras.length) {
    return {
      missing: !protectedKept,
      protectedKept,
      trashed: 0,
      store: "drive" as const,
      stored: true as const,
    };
  }
  for (const row of extras) {
    await drive.deleteJson(row.id);
  }
  const leftover = (await drive.listChildren!(folderId)).find(
    (item) => isQualityVaultFile(item) && item.name === wanted && !isProtectedQualityCompanyDocFile(item.id),
  );
  if (leftover?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  return {
    missing: false as const,
    protectedKept,
    trashed: extras.length,
    store: "drive" as const,
    stored: true as const,
  };
}

export async function writeQualityCompanyDocLock(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  locked: boolean,
  who?: string,
) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const folderId = await ensureQualityVaultPath(drive as DriveAdapter, place);
  const kids = await drive!.listChildren!(folderId);
  const existing = kids.find((row) => isQualityLibraryLock(row));
  const stamp = (who || "").trim().toLowerCase();
  const payload = `${JSON.stringify({
    locked: Boolean(locked),
    by: stamp,
    at: new Date().toISOString(),
  }, null, 2)}\n`;
  const properties = {
    kind: QUALITY_LIBRARY_LOCK_KIND,
    locked: locked ? "1" : "0",
    ...(stamp ? { who: stamp } : {}),
  };
  const written = existing?.id
    ? await drive!.updateJson(existing.id, payload, QUALITY_LIBRARY_LOCK_NAME, properties)
    : await drive!.createJson(folderId, QUALITY_LIBRARY_LOCK_NAME, payload, properties);
  if (!written?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const confirmed = qualityLibraryLockFromKids(await drive!.listChildren!(folderId));
  if (confirmed.locked !== Boolean(locked)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  return { locked: confirmed.locked, store: "drive" as const, stored: true as const };
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
    if (qualityCompanyDocGoogleNativeType(row.mimeType)) {
      return {
        file: null,
        store: "drive" as const,
        stored: true as const,
        error: QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
      };
    }
    const bytes = await drive.readBytes(row.id);
    return {
      file: {
        name: row.name,
        type: qualityCompanyDocPreviewType({
          name: row.name,
          type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
        }),
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
