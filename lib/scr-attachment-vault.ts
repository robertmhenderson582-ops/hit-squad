/**
 * SCR backup files live next to the estimate pack in Drive:
 *   {estimates folder}/SCR attachments/{packId}/{rowId}/{filename}
 * Bytes go through the same Quality vault upload confirm path.
 */
import {
  DRIVE_FOLDER_MIME,
  DriveApiError,
  driveFolderName,
  estimatesFolderId,
  isDriveFolderRow,
  sameDriveFolderName,
  writableDriveFolderId,
  type DriveAdapter,
  type DriveFile,
} from "./drive-estimates.ts";
import type { LeadFile } from "./lead-briefs.ts";
import {
  awaitQualityVaultDeadline,
  qualityDriveReady,
  writeQualityVaultFiles,
} from "./quality-vault.ts";
import { SCR_ATTACHMENT_MISSING_ERROR, SCR_ATTACHMENT_WRITE_ERROR } from "./scr-attachment-shared.ts";

export const SCR_ATTACHMENT_ROOT = "SCR attachments";
export const SCR_ATTACHMENT_KIND = "scr-attachment";
export { SCR_ATTACHMENT_MISSING_ERROR, SCR_ATTACHMENT_WRITE_ERROR };

export type ScrAttachmentPlace = {
  packId: string;
  rowId: string;
};

export type PersistedScrAttachmentFile = {
  name: string;
  type: string;
  size: number;
  driveId: string;
};

export function scrAttachmentVaultPath(place: ScrAttachmentPlace): string[] {
  return [
    driveFolderName(SCR_ATTACHMENT_ROOT),
    driveFolderName(place.packId.trim() || "pack"),
    driveFolderName(place.rowId.trim() || "scr"),
  ];
}

export function scrAttachmentFileProperties(place: ScrAttachmentPlace, who?: string): Record<string, string> {
  const stamp = (who || "").trim().toLowerCase();
  return {
    kind: SCR_ATTACHMENT_KIND,
    packId: place.packId.trim(),
    scrRowId: place.rowId.trim(),
    ...(stamp ? { who: stamp } : {}),
  };
}

async function ensureScrAttachmentPath(drive: DriveAdapter, place: ScrAttachmentPlace, created: string[] = []) {
  if (!qualityDriveReady(drive)) throw new Error(SCR_ATTACHMENT_WRITE_ERROR);
  let parent = estimatesFolderId();
  for (const name of scrAttachmentVaultPath(place)) {
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
      if (!folderId) throw new Error(SCR_ATTACHMENT_WRITE_ERROR);
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

async function scrAttachmentFolderId(drive: DriveAdapter, place: ScrAttachmentPlace) {
  let parent = estimatesFolderId();
  for (const name of scrAttachmentVaultPath(place)) {
    const kids = await drive.listChildren!(parent);
    const existing = kids.find((row) => sameDriveFolderName(row.name, name) && isDriveFolderRow(row));
    const existingId = writableDriveFolderId(existing);
    if (!existingId) return null;
    parent = existingId;
  }
  return parent;
}

function listedFile(row: DriveFile, size = 0): PersistedScrAttachmentFile {
  return {
    name: row.name,
    type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
    size,
    driveId: row.id,
  };
}

export async function persistScrAttachmentFiles(
  drive: DriveAdapter | null | undefined,
  place: ScrAttachmentPlace,
  files: LeadFile[],
  who?: string,
) {
  if (!qualityDriveReady(drive)) throw new Error(SCR_ATTACHMENT_WRITE_ERROR);
  const incoming = files.filter((file) => file.name && file.data);
  if (!incoming.length) throw new Error("Drop at least one file.");
  const created: string[] = [];
  try {
    return await awaitQualityVaultDeadline((async () => {
      const folderId = await ensureScrAttachmentPath(drive as DriveAdapter, place, created);
      const written = await writeQualityVaultFiles(drive as DriveAdapter, folderId, incoming, who);
      if (written.length !== incoming.length) throw new Error(SCR_ATTACHMENT_WRITE_ERROR);
      const kids = await drive!.listChildren!(folderId);
      const filesOut = written.map((row) => {
        const match = incoming.find((file) => file.name === row.name);
        const listed = kids.find((item) => item.id === row.id) ?? row;
        return {
          ...listedFile(listed),
          type: match?.type || listedFile(listed).type,
          size: match ? Buffer.from(match.data, "base64").byteLength : 0,
        };
      });
      return { folderId, files: filesOut, path: scrAttachmentVaultPath(place), store: "drive" as const, created };
    })());
  } catch (error) {
    for (const name of incoming.map((file) => file.name)) {
      try {
        await trashScrAttachmentFile(drive, place, { fileName: name });
      } catch {
        // keep sweeping
      }
    }
    for (const folderId of [...created].reverse()) {
      try {
        if (!drive?.listChildren || !drive.deleteJson) continue;
        const kids = await drive.listChildren(folderId);
        if (kids.some((row) => row.id && (row.name || "").trim())) continue;
        await drive.deleteJson(folderId);
      } catch {
        // leftover parent is retried after children go
      }
    }
    throw error;
  }
}

export async function trashScrAttachmentFile(
  drive: DriveAdapter | null | undefined,
  place: ScrAttachmentPlace,
  target: { driveId?: string; fileName?: string },
) {
  if (!qualityDriveReady(drive) || !drive?.deleteJson) throw new Error(SCR_ATTACHMENT_WRITE_ERROR);
  const folderId = await scrAttachmentFolderId(drive as DriveAdapter, place);
  if (!folderId) return { missing: true as const, trashed: 0, store: "drive" as const, stored: true as const };
  const kids = await drive.listChildren!(folderId);
  const driveId = (target.driveId || "").trim();
  const wanted = (target.fileName || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
  const matches = kids.filter((row) => {
    if (!row.id || row.mimeType === DRIVE_FOLDER_MIME) return false;
    if (driveId) return row.id === driveId;
    return Boolean(wanted) && row.name === wanted;
  });
  if (!matches.length) {
    return { missing: true as const, trashed: 0, store: "drive" as const, stored: true as const };
  }
  for (const row of matches) {
    await drive.deleteJson(row.id);
  }
  return { missing: false as const, trashed: matches.length, store: "drive" as const, stored: true as const };
}

export async function readScrAttachmentFile(
  drive: DriveAdapter | null | undefined,
  place: ScrAttachmentPlace,
  driveId: string,
) {
  const id = driveId.trim();
  if (!id || !qualityDriveReady(drive) || !drive?.readBytes) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  const folderId = await scrAttachmentFolderId(drive as DriveAdapter, place);
  if (!folderId) return { file: null, store: "drive" as const, stored: true as const };
  const kids = await drive.listChildren!(folderId);
  const row = kids.find((item) => item.id === id && item.mimeType !== DRIVE_FOLDER_MIME);
  if (!row?.id) return { file: null, store: "drive" as const, stored: true as const };
  const bytes = await drive.readBytes(row.id);
  return {
    file: {
      name: row.name,
      type: row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME ? row.mimeType : "application/octet-stream",
      bytes,
    },
    store: "drive" as const,
    stored: true as const,
  };
}

export { QUALITY_VAULT_WRITE_ERROR };
