import { companyName, type CompanyId } from "./companies.ts";
import { HSE_BRIEFS_VAULT_NAME, briefsFolderId, hseFolderId } from "./drive-data.ts";
import { DRIVE_FOLDER_MIME, DriveApiError, type DriveAdapter, type DriveFile } from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import {
  HSE_COMPANY_DOC_CATALOG,
  HSE_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  isHseCompanyDocsJobId,
  hseCompanyDocGoogleNativeType,
  hseCompanyDocLabel,
  hseCompanyDocPreviewType,
  hseCompanyDocsListedFor,
  type HseCompanyDocId,
} from "./hse-company-docs.ts";
import { hseFolderLabel, type HseFolderId } from "./hse-folders.ts";
import { isHseReadyShelfJobId, hseReadyShelfPackageLabel } from "./hse-package-shelf.ts";
import {
  HSE_LIBRARY_LOCK_KIND,
  HSE_LIBRARY_LOCK_NAME,
  HSE_UNVAULTED_MARK,
  HSE_VAULT_MISSING_ERROR,
  HSE_VAULT_SHARE_ERROR,
  HSE_VAULT_WRITE_ERROR,
  isHseLibraryLockName,
  mergeVaultedHseFiles,
  hseVaultStored,
  type HseListedFile,
  type HseVaultPlace,
  type HseVaultTreeRow,
} from "./hse-vault-shared.ts";

export {
  HSE_LIBRARY_LOCK_KIND,
  HSE_LIBRARY_LOCK_NAME,
  HSE_UNVAULTED_MARK,
  HSE_VAULT_MISSING_ERROR,
  HSE_VAULT_SHARE_ERROR,
  HSE_VAULT_WRITE_ERROR,
  isHseLibraryLockName,
  mergeVaultedHseFiles,
  hseVaultStored,
  type HseListedFile,
  type HseVaultPlace,
  type HseVaultTreeRow,
};

/** Status only. Never return Drive messages, SA email, or folder ids. */
export function hseVaultDriveStatus(error: unknown) {
  if (error instanceof DriveApiError && error.status) return error.status;
  if (error instanceof Error) {
    const match = /\b(403|404)\b/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return 0;
}

/** Testers always get HSE_VAULT_WRITE_ERROR. Owner sees share/missing copy on 403/404. */
export function hseVaultWriteUserError(error: unknown, ownerFacing: boolean) {
  if (!ownerFacing) return HSE_VAULT_WRITE_ERROR;
  const status = hseVaultDriveStatus(error);
  if (status === 403) return HSE_VAULT_SHARE_ERROR;
  if (status === 404) return HSE_VAULT_MISSING_ERROR;
  return HSE_VAULT_WRITE_ERROR;
}

export function hseVaultFolderName(name: string) {
  const cleaned = name
    .replace(/[\\/]+/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "folder";
}

export function hseCompanyVaultLabel(companyId?: string, companyLabel?: string) {
  const typed = (companyLabel || "").trim();
  if (typed) return hseVaultFolderName(typed);
  const id = (companyId || "").trim().toLowerCase();
  if (id) return hseVaultFolderName(companyName(id as CompanyId) || id);
  return "Madison";
}

export function hseVaultPath(place: HseVaultPlace): string[] {
  const company = hseCompanyVaultLabel(place.companyId, place.companyLabel);
  const folder = hseVaultFolderName(
    place.companyDocs
      ? hseCompanyDocLabel(place.folderId as HseCompanyDocId, place.companyId)
      : hseFolderLabel(place.folderId as HseFolderId, place.companyId),
  );
  if (place.companyDocs || isHseCompanyDocsJobId(place.jobId)) {
    return [company, folder];
  }
  if (place.shelf || isHseReadyShelfJobId(place.jobId)) {
    const pack = hseVaultFolderName(
      place.packageLabel || place.jobLabel || hseReadyShelfPackageLabel(place.jobId) || "Kit",
    );
    return [company, "Ready HSE packages", pack];
  }
  const site = hseVaultFolderName((place.siteLabel || "").trim() || "Site");
  const job = hseVaultFolderName((place.jobLabel || place.jobId || "").trim() || "Job");
  return [company, site, job, folder];
}

export function hseDriveReady(drive?: DriveAdapter | null) {
  return Boolean(
    drive?.configured && drive.listChildren && drive.createFolder && drive.uploadBytes && drive.updateBytes,
  );
}

function decodeLeadBytes(file: LeadFile) {
  return Uint8Array.from(Buffer.from(file.data, "base64"));
}

export async function ensureHseVaultPath(drive: DriveAdapter, place: HseVaultPlace) {
  if (!hseDriveReady(drive)) throw new Error(HSE_VAULT_WRITE_ERROR);
  let parent = hseFolderId();
  for (const name of hseVaultPath(place)) {
    const kids = await drive.listChildren!(parent);
    const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
    if (existing?.id) {
      parent = existing.id;
      continue;
    }
    const created = await drive.createFolder!(parent, name);
    if (!created?.id) throw new Error(HSE_VAULT_WRITE_ERROR);
    parent = created.id;
  }
  return parent;
}

function hseFileProperties(who?: string): Record<string, string> {
  const stamp = (who || "").trim().toLowerCase();
  return stamp ? { kind: "hse-file", who: stamp } : { kind: "hse-file" };
}

export async function writeHseVaultFiles(drive: DriveAdapter, folderId: string, files: LeadFile[], who?: string) {
  if (!hseDriveReady(drive)) throw new Error(HSE_VAULT_WRITE_ERROR);
  const kids = await drive.listChildren!(folderId);
  const written: DriveFile[] = [];
  for (const file of files) {
    if (!file.name || !file.data) continue;
    const bytes = decodeLeadBytes(file);
    const mime = file.type || "application/octet-stream";
    const existing = kids.find((row) => row.name === file.name && row.mimeType !== DRIVE_FOLDER_MIME);
    const row = existing?.id
      ? await drive.updateBytes!(existing.id, bytes, mime)
      : await drive.uploadBytes!(folderId, file.name, bytes, mime, hseFileProperties(who));
    if (!row?.id) throw new Error(HSE_VAULT_WRITE_ERROR);
    const confirmed = drive.readBytes ? await drive.readBytes(row.id) : bytes;
    if (drive.readBytes && confirmed.length !== bytes.length) throw new Error(HSE_VAULT_WRITE_ERROR);
    written.push({ ...row, properties: { ...row.properties, ...hseFileProperties(who) } });
    if (existing) existing.id = row.id;
    else kids.push({ ...row, name: file.name });
  }
  return written;
}

export async function persistHseVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: HseVaultPlace,
  files: LeadFile[],
) {
  if (!hseDriveReady(drive)) throw new Error(HSE_VAULT_WRITE_ERROR);
  const incoming = files.filter((file) => file.name && file.data);
  if (!incoming.length) throw new Error("Drop at least one file.");
  const folderId = await ensureHseVaultPath(drive as DriveAdapter, place);
  const written = await writeHseVaultFiles(drive as DriveAdapter, folderId, incoming, place.who);
  if (written.length !== incoming.length) throw new Error(HSE_VAULT_WRITE_ERROR);
  return { folderId, files: written, path: hseVaultPath(place), store: "drive" as const };
}

function isHseLibraryLock(row: DriveFile) {
  return (
    isHseLibraryLockName(row.name) ||
    (row.properties?.kind || "").trim() === HSE_LIBRARY_LOCK_KIND
  );
}

function isHseVaultFile(row: DriveFile) {
  if (row.mimeType === DRIVE_FOLDER_MIME) return false;
  const name = (row.name || "").trim();
  return Boolean(name) && name !== HSE_BRIEFS_VAULT_NAME && !isHseLibraryLock(row);
}

export function hseLibraryLockFromKids(kids: DriveFile[]) {
  const lock = kids.find((row) => isHseLibraryLock(row));
  if (!lock) return { locked: false, known: true as const };
  return { locked: (lock.properties?.locked || "").trim() === "1", known: true as const };
}

function isHseVaultFolder(row: DriveFile) {
  return Boolean(row.id && row.name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
}

/** No standing HSE PDF id is checked in. Empty-but-correct vault folders are enough. */
export function isProtectedHseCompanyDocFile(_fileId?: string | null) {
  return false;
}

type HseVaultListedName = {
  name: string;
  type: string;
  protected?: boolean;
};

function hseVaultListedFile(row: DriveFile): HseVaultListedName {
  return {
    name: row.name,
    type: hseCompanyDocPreviewType({
      name: row.name,
      type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
    }),
    ...(isProtectedHseCompanyDocFile(row.id) ? { protected: true as const } : {}),
  };
}

async function findHseVaultChild(drive: DriveAdapter, parent: string, name: string) {
  const kids = await drive.listChildren!(parent);
  return kids.find((row) => row.name === name && isHseVaultFolder(row)) ?? null;
}

/**
 * One company-folder walk, then parallel bucket lists.
 * Avoids 4× stacked Drive path + briefs round-trips on HSE rail refresh.
 */
export async function listHseCompanyDocVaultFolders(
  drive: DriveAdapter | null | undefined,
  place: { companyId?: string; who?: string },
) {
  const folders = hseCompanyDocsListedFor(place.companyId);
  const empty = Object.fromEntries(folders.map((folder) => [folder.id, [] as HseVaultListedName[]]));
  const unlocked = Object.fromEntries(folders.map((folder) => [folder.id, false])) as Record<string, boolean>;
  if (!hseDriveReady(drive)) {
    return {
      filesByFolder: empty,
      locksByFolder: Object.fromEntries(folders.map((folder) => [folder.id, true])) as Record<string, boolean>,
      locksKnown: false,
      store: "unconfigured" as const,
      stored: false as const,
    };
  }
  try {
    const company = hseCompanyVaultLabel(place.companyId);
    const companyFolder = await findHseVaultChild(drive as DriveAdapter, hseFolderId(), company);
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
        const label = hseVaultFolderName(hseCompanyDocLabel(folder.id, place.companyId));
        const bucket = bucketKids.find((row) => row.name === label && isHseVaultFolder(row));
        if (!bucket?.id) {
          return [folder.id, [] as HseVaultListedName[], { locked: false, known: true }] as const;
        }
        const kids = await drive!.listChildren!(bucket.id);
        const files = kids
          .filter((row) => hseVaultFileVisible(row, place.who))
          .map((row) => hseVaultListedFile(row));
        return [folder.id, files, hseLibraryLockFromKids(kids)] as const;
      }),
    );
    return {
      filesByFolder: Object.fromEntries(listed.map(([id, files]) => [id, files])) as Record<
        string,
        HseVaultListedName[]
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

export function hseVaultFileVisible(row: DriveFile, who?: string) {
  if (!isHseVaultFile(row)) return false;
  const key = (who || "").trim().toLowerCase();
  if (!key) return true;
  return (row.properties?.who || "").trim().toLowerCase() === key;
}

/** Wendell’s refresh list: Drive names at company/site/job/folder, filtered by who. Not the email-dump tree. */
export async function listHseVaultFiles(
  drive: DriveAdapter | null | undefined,
  place: HseVaultPlace,
) {
  if (!hseDriveReady(drive)) {
    return {
      files: [] as HseVaultListedName[],
      locked: true,
      locksKnown: false,
      store: "unconfigured" as const,
      stored: false as const,
    };
  }
  try {
    let parent = hseFolderId();
    for (const name of hseVaultPath(place)) {
      const kids = await drive!.listChildren!(parent);
      const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
      if (!existing?.id) {
        return { files: [] as HseVaultListedName[], locked: false, locksKnown: true, store: "drive" as const, stored: true as const };
      }
      parent = existing.id;
    }
    const kids = await drive!.listChildren!(parent);
    const files = kids
      .filter((row) => hseVaultFileVisible(row, place.who))
      .map((row) => hseVaultListedFile(row));
    const lock = hseLibraryLockFromKids(kids);
    return { files, locked: lock.locked, locksKnown: lock.known, store: "drive" as const, stored: true as const };
  } catch {
    return { files: [] as HseVaultListedName[], locked: true, locksKnown: false, store: "drive" as const, stored: false as const };
  }
}

async function hseVaultFolderId(drive: DriveAdapter, place: HseVaultPlace) {
  let parent = hseFolderId();
  for (const name of hseVaultPath(place)) {
    const existing = await findHseVaultChild(drive, parent, name);
    if (!existing?.id) return null;
    parent = existing.id;
  }
  return parent;
}

/** Trash vaulted extras by name. Never trash the standing Madison Safety Manual PDF. */
export async function trashHseVaultFile(
  drive: DriveAdapter | null | undefined,
  place: HseVaultPlace,
  fileName: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || isHseLibraryLockName(wanted)) throw new Error(HSE_VAULT_WRITE_ERROR);
  if (!hseDriveReady(drive) || !drive?.deleteJson) throw new Error(HSE_VAULT_WRITE_ERROR);
  const folderId = await hseVaultFolderId(drive as DriveAdapter, place);
  if (!folderId) {
    return { missing: true as const, protectedKept: false, trashed: 0, store: "drive" as const, stored: true as const };
  }
  const kids = await drive.listChildren!(folderId);
  const matches = kids.filter((item) => isHseVaultFile(item) && item.name === wanted && item.id);
  const extras = matches.filter((item) => !isProtectedHseCompanyDocFile(item.id));
  const protectedKept = matches.some((item) => isProtectedHseCompanyDocFile(item.id));
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
    (item) => isHseVaultFile(item) && item.name === wanted && !isProtectedHseCompanyDocFile(item.id),
  );
  if (leftover?.id) throw new Error(HSE_VAULT_WRITE_ERROR);
  return {
    missing: false as const,
    protectedKept,
    trashed: extras.length,
    store: "drive" as const,
    stored: true as const,
  };
}

function isHseCompanyDocVaultFolder(name: string, companyId?: string) {
  const label = hseVaultFolderName(name);
  return HSE_COMPANY_DOC_CATALOG.some(
    (doc) => hseVaultFolderName(hseCompanyDocLabel(doc.id, companyId)) === label,
  );
}

/**
 * Ripple remove: trash every vaulted copy of a filled filename.
 * Never touches company-rail libraries or the standing Madison Safety Manual.
 */
export async function trashHseVaultNamedCopies(
  drive: DriveAdapter | null | undefined,
  fileName: string,
  companyId?: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || isHseLibraryLockName(wanted)) throw new Error(HSE_VAULT_WRITE_ERROR);
  if (!hseDriveReady(drive) || !drive?.deleteJson || !drive.listChildren) {
    throw new Error(HSE_VAULT_WRITE_ERROR);
  }
  let trashed = 0;
  async function walk(parent: string, path: string[]) {
    const kids = await drive!.listChildren!(parent);
    const railFolder = path.length === 2 && isHseCompanyDocVaultFolder(path[1] || "", companyId);
    for (const item of kids) {
      if (!isHseVaultFile(item) || item.name !== wanted || !item.id) continue;
      if (railFolder || isProtectedHseCompanyDocFile(item.id)) continue;
      await drive!.deleteJson!(item.id);
      trashed += 1;
    }
    for (const folder of kids.filter(isHseVaultFolder)) {
      await walk(folder.id, [...path, folder.name || ""]);
    }
  }
  await walk(hseFolderId(), []);
  return { trashed, store: "drive" as const, stored: true as const };
}

export async function writeHseCompanyDocLock(
  drive: DriveAdapter | null | undefined,
  place: HseVaultPlace,
  locked: boolean,
  who?: string,
) {
  if (!hseDriveReady(drive)) throw new Error(HSE_VAULT_WRITE_ERROR);
  const folderId = await ensureHseVaultPath(drive as DriveAdapter, place);
  const kids = await drive!.listChildren!(folderId);
  const existing = kids.find((row) => isHseLibraryLock(row));
  const stamp = (who || "").trim().toLowerCase();
  const payload = `${JSON.stringify({
    locked: Boolean(locked),
    by: stamp,
    at: new Date().toISOString(),
  }, null, 2)}\n`;
  const properties = {
    kind: HSE_LIBRARY_LOCK_KIND,
    locked: locked ? "1" : "0",
    ...(stamp ? { who: stamp } : {}),
  };
  const written = existing?.id
    ? await drive!.updateJson(existing.id, payload, HSE_LIBRARY_LOCK_NAME, properties)
    : await drive!.createJson(folderId, HSE_LIBRARY_LOCK_NAME, payload, properties);
  if (!written?.id) throw new Error(HSE_VAULT_WRITE_ERROR);
  const confirmed = hseLibraryLockFromKids(await drive!.listChildren!(folderId));
  if (confirmed.locked !== Boolean(locked)) throw new Error(HSE_VAULT_WRITE_ERROR);
  return { locked: confirmed.locked, store: "drive" as const, stored: true as const };
}

/** Bytes for open/view. Names + base64 only — never Drive ids. */
export async function readHseVaultFile(
  drive: DriveAdapter | null | undefined,
  place: HseVaultPlace,
  fileName: string,
) {
  const wanted = (fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!wanted || !hseDriveReady(drive) || !drive?.readBytes) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  try {
    let parent = hseFolderId();
    for (const name of hseVaultPath(place)) {
      const kids = await drive.listChildren!(parent);
      const existing = kids.find((row) => row.name === name && (!row.mimeType || row.mimeType === DRIVE_FOLDER_MIME));
      if (!existing?.id) {
        return { file: null, store: "drive" as const, stored: true as const };
      }
      parent = existing.id;
    }
    const kids = await drive.listChildren!(parent);
    const row = kids.find((item) => hseVaultFileVisible(item, place.who) && item.name === wanted);
    if (!row?.id) {
      return { file: null, store: "drive" as const, stored: true as const };
    }
    if (hseCompanyDocGoogleNativeType(row.mimeType)) {
      return {
        file: null,
        store: "drive" as const,
        stored: true as const,
        error: HSE_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
      };
    }
    const bytes = await drive.readBytes(row.id);
    return {
      file: {
        name: row.name,
        type: hseCompanyDocPreviewType({
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

export async function listHseVaultTree(drive: DriveAdapter | null | undefined): Promise<HseVaultTreeRow[]> {
  if (!hseDriveReady(drive)) return [];
  try {
    return await walkHseVaultTree(drive as DriveAdapter, hseFolderId(), []);
  } catch {
    return [];
  }
}

async function walkHseVaultTree(drive: DriveAdapter, parent: string, path: string[]): Promise<HseVaultTreeRow[]> {
  const kids = await drive.listChildren!(parent);
  const files = kids.filter(isHseVaultFile).map((row) => row.name);
  const rows: HseVaultTreeRow[] = files.length ? [{ path: path.length ? path : ["HSE"], files }] : [];
  for (const folder of kids.filter((row) => row.mimeType === DRIVE_FOLDER_MIME && row.id && row.name)) {
    rows.push(...(await walkHseVaultTree(drive, folder.id, [...path, folder.name])));
  }
  return rows;
}

export function briefsIndexFolderId() {
  return briefsFolderId("hse");
}
