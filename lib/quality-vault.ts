import { companyName, type CompanyId } from "./companies.ts";
import { QUALITY_BRIEFS_VAULT_NAME, QUALITY_CONTROL_MANUAL_FILE_ID, briefsFolderId, qualityFolderId } from "./drive-data.ts";
import {
  DRIVE_FOLDER_MIME,
  DriveApiError,
  driveFailureKind,
  driveFolderName,
  isDriveFolderRow,
  sameDriveFileName,
  sameDriveFolderName,
  writableDriveFolderId,
  type DriveAdapter,
  type DriveFile,
} from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import {
  QUALITY_COMPANY_DOC_CATALOG,
  QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  isQualityCompanyDocsJobId,
  qualityCompanyDocGoogleNativeType,
  qualityCompanyDocLabel,
  qualityCompanyDocPreviewType,
  qualityCompanyDocsListedFor,
  type QualityCompanyDocId,
} from "./quality-company-docs.ts";
import { qualityFolderLabel, type QualityFolderId } from "./quality-folders.ts";
import { isQualityReadyShelfJobId, qualityReadyShelfPackageLabel } from "./quality-package-shelf.ts";
import {
  QUALITY_LIBRARY_LOCK_KIND,
  QUALITY_LIBRARY_LOCK_NAME,
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_FOLDER_ERROR,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_OAUTH_ERROR,
  QUALITY_VAULT_QUOTA_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_DEADLINE_MS,
  QUALITY_VAULT_WRITE_ERROR,
  QUALITY_VAULT_WRITE_TIMEOUT_ERROR,
  QUALITY_TEMPLATE_FILL_SAVE_DEADLINE_MS,
  isQualityLibraryLockName,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
  type QualityVaultPlace,
  type QualityVaultTreeRow,
} from "./quality-vault-shared.ts";
import {
  filterVaultListedFiles,
  vaultFileVisibleToViewer,
  type VaultListViewer,
} from "./vault-list-filter.ts";

export {
  QUALITY_LIBRARY_LOCK_KIND,
  QUALITY_LIBRARY_LOCK_NAME,
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_FOLDER_ERROR,
  QUALITY_VAULT_MISSING_ERROR,
  QUALITY_VAULT_OAUTH_ERROR,
  QUALITY_VAULT_QUOTA_ERROR,
  QUALITY_VAULT_SHARE_ERROR,
  QUALITY_VAULT_WRITE_DEADLINE_MS,
  QUALITY_VAULT_WRITE_ERROR,
  QUALITY_VAULT_WRITE_TIMEOUT_ERROR,
  QUALITY_TEMPLATE_FILL_SAVE_DEADLINE_MS,
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

/** Testers always get QUALITY_VAULT_WRITE_ERROR. Timeout copy is safe for every seat. Owner sees quota / oauth / folder / share / missing. */
export function qualityVaultWriteUserError(error: unknown, ownerFacing: boolean) {
  if (error instanceof Error && error.message === QUALITY_VAULT_WRITE_TIMEOUT_ERROR) {
    return QUALITY_VAULT_WRITE_TIMEOUT_ERROR;
  }
  if (!ownerFacing) return QUALITY_VAULT_WRITE_ERROR;
  const kind = driveFailureKind(error);
  if (kind === "quota") return QUALITY_VAULT_QUOTA_ERROR;
  if (kind === "oauth") return QUALITY_VAULT_OAUTH_ERROR;
  if (kind === "folder") return QUALITY_VAULT_FOLDER_ERROR;
  if (kind === "share") return QUALITY_VAULT_SHARE_ERROR;
  if (kind === "missing") return QUALITY_VAULT_MISSING_ERROR;
  return QUALITY_VAULT_WRITE_ERROR;
}

export function qualityVaultFolderName(name: string) {
  return driveFolderName(name);
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
  if (place.shelf || isQualityReadyShelfJobId(place.jobId)) {
    const pack = qualityVaultFolderName(
      place.packageLabel || place.jobLabel || qualityReadyShelfPackageLabel(place.jobId) || "Kit",
    );
    return [company, "Ready Quality packages", pack];
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

export async function ensureQualityVaultPath(
  drive: DriveAdapter,
  place: QualityVaultPlace,
  created: string[] = [],
) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  let parent = qualityFolderId();
  for (const name of qualityVaultPath(place)) {
    const kids = await drive.listChildren!(parent);
    const existing = kids.find((row) => sameDriveFolderName(row.name, name) && isDriveFolderRow(row));
    const existingId = writableDriveFolderId(existing);
    if (existingId) {
      parent = existingId;
      continue;
    }
    try {
      const folder = await drive.createFolder!(parent, name);
      const folderId = writableDriveFolderId(folder) || folder?.id;
      if (!folderId) throw new Error(QUALITY_VAULT_WRITE_ERROR);
      created.push(folderId);
      parent = folderId;
    } catch (error) {
      if (!(error instanceof DriveApiError) || (error.status !== 400 && error.status !== 403)) throw error;
      const again = (await drive.listChildren!(parent)).find(
        (row) => sameDriveFolderName(row.name, name) && isDriveFolderRow(row),
      );
      const recovered = writableDriveFolderId(again);
      if (!recovered) throw error;
      parent = recovered;
    }
  }
  return parent;
}

function qualityFileProperties(who?: string): Record<string, string> {
  const stamp = (who || "").trim().toLowerCase();
  return stamp ? { kind: "quality-file", who: stamp } : { kind: "quality-file" };
}

async function confirmQualityVaultBytes(drive: DriveAdapter, fileId: string, bytes: Uint8Array) {
  if (!drive.readBytes) return true;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const confirmed = await drive.readBytes(fileId);
      if (confirmed.length === bytes.length) return true;
    } catch {
      // Media can lag the upload id. Retry before fail-closed rollback.
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
  }
  return false;
}

async function uploadQualityVaultFile(
  drive: DriveAdapter,
  folderId: string,
  file: LeadFile,
  bytes: Uint8Array,
  mime: string,
  who?: string,
) {
  const properties = qualityFileProperties(who);
  try {
    const row = await drive.uploadBytes!(folderId, file.name, bytes, mime, properties);
    if (row?.id) return row;
  } catch (error) {
    if (mime !== "text/plain") throw error;
  }
  if (mime === "text/plain") {
    const row = await drive.uploadBytes!(folderId, file.name, bytes, "application/octet-stream", properties);
    if (row?.id) return row;
  }
  throw new Error(QUALITY_VAULT_WRITE_ERROR);
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
      : await uploadQualityVaultFile(drive, folderId, file, bytes, mime, who);
    if (!row?.id) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    if (!(await confirmQualityVaultBytes(drive, row.id, bytes))) throw new Error(QUALITY_VAULT_WRITE_ERROR);
    written.push({ ...row, properties: { ...row.properties, ...qualityFileProperties(who) } });
    if (existing) existing.id = row.id;
    else kids.push({ ...row, name: file.name });
  }
  return written;
}

export async function trashQualityVaultFolderIfEmpty(drive: DriveAdapter | null | undefined, folderId: string) {
  const id = folderId.trim();
  if (!id || !qualityDriveReady(drive) || !drive?.deleteJson || !drive.listChildren) return { trashed: false as const };
  const kids = await drive.listChildren(id);
  if (kids.some((row) => row.id && (row.name || "").trim())) return { trashed: false as const };
  await drive.deleteJson(id);
  return { trashed: true as const };
}

/** Undo a failed persist: trash this write's files, then empty folders this call created. */
export async function rollbackQualityVaultPersist(
  drive: DriveAdapter | null | undefined,
  input: {
    place: QualityVaultPlace;
    created?: string[];
    fileNames?: string[];
  },
) {
  for (const name of input.fileNames ?? []) {
    try {
      await trashQualityVaultFile(drive, input.place, name);
    } catch {
      // Keep sweeping so a failed confirm does not leave a named copy listed.
    }
  }
  for (const folderId of [...(input.created ?? [])].reverse()) {
    try {
      await trashQualityVaultFolderIfEmpty(drive, folderId);
    } catch {
      // Leaf-first. A leftover parent is retried after its children go.
    }
  }
}

let qualityVaultDeadlineOverrideMs: number | undefined;

export function useQualityVaultDeadlineForTests(ms?: number) {
  qualityVaultDeadlineOverrideMs = ms;
}

/** Fail closed when Drive never settles. Existing persist rollback still runs. */
export async function awaitQualityVaultDeadline<T>(
  work: Promise<T>,
  ms = qualityVaultDeadlineOverrideMs ?? QUALITY_VAULT_WRITE_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(QUALITY_VAULT_WRITE_TIMEOUT_ERROR)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function persistQualityVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  files: LeadFile[],
) {
  if (!qualityDriveReady(drive)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  const incoming = files.filter((file) => file.name && file.data);
  if (!incoming.length) throw new Error("Drop at least one file.");
  const created: string[] = [];
  try {
    return await awaitQualityVaultDeadline((async () => {
      const folderId = await ensureQualityVaultPath(drive as DriveAdapter, place, created);
      const written = await writeQualityVaultFiles(drive as DriveAdapter, folderId, incoming, place.who);
      if (written.length !== incoming.length) throw new Error(QUALITY_VAULT_WRITE_ERROR);
      return { folderId, files: written, path: qualityVaultPath(place), store: "drive" as const, created };
    })());
  } catch (error) {
    await rollbackQualityVaultPersist(drive, {
      place,
      created,
      fileNames: incoming.map((file) => file.name),
    });
    throw error;
  }
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

function isQualityListableFile(row: DriveFile) {
  return Boolean((row.name || "").trim()) && row.mimeType !== DRIVE_FOLDER_MIME;
}

export function qualityLibraryLockFromKids(kids: DriveFile[]) {
  const lock = kids.find((row) => isQualityLibraryLock(row));
  if (!lock) return { locked: false, known: true as const };
  return { locked: (lock.properties?.locked || "").trim() === "1", known: true as const };
}

function isQualityVaultFolder(row: DriveFile) {
  return isDriveFolderRow(row);
}

export function isProtectedQualityCompanyDocFile(fileId?: string | null) {
  return (fileId || "").trim() === QUALITY_CONTROL_MANUAL_FILE_ID;
}

type QualityVaultListedName = {
  name: string;
  type: string;
  protected?: boolean;
};

function qualityVaultListedFile(row: DriveFile): QualityVaultListedName {
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
  const existing = kids.find((row) => sameDriveFolderName(row.name, name) && isQualityVaultFolder(row));
  if (!existing) return null;
  const id = writableDriveFolderId(existing);
  return id ? { ...existing, id } : null;
}

/**
 * One company-folder walk, then parallel bucket lists.
 * Avoids 4× stacked Drive path + briefs round-trips on Quality rail refresh.
 */
export async function listQualityCompanyDocVaultFolders(
  drive: DriveAdapter | null | undefined,
  place: { companyId?: string; who?: string },
  viewer?: VaultListViewer,
) {
  const folders = qualityCompanyDocsListedFor(place.companyId);
  const empty = Object.fromEntries(folders.map((folder) => [folder.id, [] as QualityVaultListedName[]]));
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
        const bucket = bucketKids.find((row) => sameDriveFolderName(row.name, label) && isQualityVaultFolder(row));
        if (!bucket?.id) {
          return [folder.id, [] as QualityVaultListedName[], { locked: false, known: true }] as const;
        }
        const kids = await drive!.listChildren!(bucket.id);
        const files = filterVaultListedFiles(
          kids.filter((row) => qualityVaultFileVisible(row, place.who)).map((row) => qualityVaultListedFile(row)),
          viewer,
        );
        return [folder.id, files, qualityLibraryLockFromKids(kids)] as const;
      }),
    );
    return {
      filesByFolder: Object.fromEntries(listed.map(([id, files]) => [id, files])) as Record<
        string,
        QualityVaultListedName[]
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
  if (!isQualityListableFile(row)) return false;
  const key = (who || "").trim().toLowerCase();
  if (!key) return true;
  return (row.properties?.who || "").trim().toLowerCase() === key;
}

/** Chance’s refresh list: Drive names at company/site/job/folder, filtered by who. Not the email-dump tree. */
export async function listQualityVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: QualityVaultPlace,
  viewer?: VaultListViewer,
) {
  if (!qualityDriveReady(drive)) {
    return {
      files: [] as QualityVaultListedName[],
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
      const existing = kids.find((row) => sameDriveFolderName(row.name, name) && isQualityVaultFolder(row));
      const existingId = writableDriveFolderId(existing);
      if (!existingId) {
        return { files: [] as QualityVaultListedName[], locked: false, locksKnown: true, store: "drive" as const, stored: true as const };
      }
      parent = existingId;
    }
    const kids = await drive!.listChildren!(parent);
    const files = filterVaultListedFiles(
      kids.filter((row) => qualityVaultFileVisible(row, place.who)).map((row) => qualityVaultListedFile(row)),
      viewer,
    );
    const lock = qualityLibraryLockFromKids(kids);
    return { files, locked: lock.locked, locksKnown: lock.known, store: "drive" as const, stored: true as const };
  } catch {
    return { files: [] as QualityVaultListedName[], locked: true, locksKnown: false, store: "drive" as const, stored: false as const };
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

function isQualityCompanyDocVaultFolder(name: string, companyId?: string) {
  const label = qualityVaultFolderName(name);
  return QUALITY_COMPANY_DOC_CATALOG.some(
    (doc) => qualityVaultFolderName(qualityCompanyDocLabel(doc.id, companyId)) === label,
  );
}

/**
 * Ripple remove: trash every vaulted copy of a filled filename.
 * Never touches company-rail libraries or the standing Quality Control Manual.
 */
export async function trashQualityVaultNamedCopies(
  drive: DriveAdapter | null | undefined,
  fileName: string,
  companyId?: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || isQualityLibraryLockName(wanted)) throw new Error(QUALITY_VAULT_WRITE_ERROR);
  if (!qualityDriveReady(drive) || !drive?.deleteJson || !drive.listChildren) {
    throw new Error(QUALITY_VAULT_WRITE_ERROR);
  }
  let trashed = 0;
  async function walk(parent: string, path: string[]) {
    const kids = await drive!.listChildren!(parent);
    const railFolder = path.length === 2 && isQualityCompanyDocVaultFolder(path[1] || "", companyId);
    for (const item of kids) {
      if (!isQualityVaultFile(item) || item.name !== wanted || !item.id) continue;
      if (railFolder || isProtectedQualityCompanyDocFile(item.id)) continue;
      await drive!.deleteJson!(item.id);
      trashed += 1;
    }
    for (const folder of kids.filter(isQualityVaultFolder)) {
      await walk(folder.id, [...path, folder.name || ""]);
    }
  }
  await walk(qualityFolderId(), []);
  return { trashed, store: "drive" as const, stored: true as const };
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
  viewer?: VaultListViewer,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || !qualityDriveReady(drive) || !drive?.readBytes) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  if (!vaultFileVisibleToViewer(wanted, viewer)) {
    return { file: null, store: "drive" as const, stored: true as const };
  }
  try {
    let parent = qualityFolderId();
    for (const name of qualityVaultPath(place)) {
      const kids = await drive.listChildren!(parent);
      const existing = kids.find((row) => sameDriveFolderName(row.name, name) && isQualityVaultFolder(row));
      const existingId = writableDriveFolderId(existing);
      if (!existingId) {
        return { file: null, store: "drive" as const, stored: true as const };
      }
      parent = existingId;
    }
    const kids = await drive.listChildren!(parent);
    const row = kids.find((item) => qualityVaultFileVisible(item, place.who) && sameDriveFileName(item.name, wanted));
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

/**
 * Last-resort retrieve: walk the Quality tree for a filled filename when the
 * job-label path misses. Never opens company-rail templates.
 */
export async function readQualityVaultNamedFile(
  drive: DriveAdapter | null | undefined,
  fileName: string,
  companyId?: string,
  viewer?: VaultListViewer,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || !qualityDriveReady(drive) || !drive?.readBytes) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  if (!vaultFileVisibleToViewer(wanted, viewer)) {
    return { file: null, store: "drive" as const, stored: true as const };
  }
  async function walk(parent: string, path: string[]): Promise<{ name: string; type: string; data: string } | null> {
    const kids = await drive!.listChildren!(parent);
    const railFolder = path.length === 2 && isQualityCompanyDocVaultFolder(path[1] || "", companyId);
    for (const item of kids) {
      if (!isQualityVaultFile(item) || !item.id || !sameDriveFileName(item.name, wanted)) continue;
      if (railFolder || isProtectedQualityCompanyDocFile(item.id)) continue;
      if (qualityCompanyDocGoogleNativeType(item.mimeType)) continue;
      const bytes = await drive!.readBytes!(item.id);
      if (!bytes?.length) continue;
      return {
        name: item.name,
        type: qualityCompanyDocPreviewType({
          name: item.name,
          type: item.mimeType && item.mimeType !== DRIVE_FOLDER_MIME ? item.mimeType : "application/octet-stream",
        }),
        data: Buffer.from(bytes).toString("base64"),
      };
    }
    for (const folder of kids.filter((row) => isQualityVaultFolder(row) && row.id)) {
      const found = await walk(folder.id, [...path, folder.name || ""]);
      if (found) return found;
    }
    return null;
  }
  try {
    const file = await walk(qualityFolderId(), []);
    return { file, store: "drive" as const, stored: true as const };
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
  const files = kids.filter(isQualityListableFile).map((row) => row.name);
  const rows: QualityVaultTreeRow[] = files.length ? [{ path: path.length ? path : ["Quality"], files }] : [];
  for (const folder of kids.filter((row) => row.mimeType === DRIVE_FOLDER_MIME && row.id && row.name)) {
    rows.push(...(await walkQualityVaultTree(drive, folder.id, [...path, folder.name])));
  }
  return rows;
}

export function briefsIndexFolderId() {
  return briefsFolderId("quality");
}
