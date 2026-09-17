import { hasBuildDesk, isTester } from "./desk-role.ts";
import { DriveApiError, driveFailureKind, type DriveAdapter } from "./drive-estimates.ts";
import { packListedOnOwnerDesk, packVisibleTo, type ScopedPack, type ScopeUser } from "./estimate-scope.ts";
import { canEditChangeOrders } from "./module-access.ts";
import { estimateVaultAdapter, getVisiblePack } from "./estimate-vault.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { parseQualityDropFiles } from "./quality-folder-drops.ts";
import { checkQualityDrop, QUALITY_DROP_ACCEPT, QUALITY_DROP_SIZE_ERROR, QUALITY_DROP_TYPE_ERROR } from "./quality-folders.ts";
import { SCR_ATTACHMENT_MISSING_ERROR, SCR_ATTACHMENT_VIEW_ERROR, SCR_ATTACHMENT_WRITE_ERROR } from "./scr-attachment-shared.ts";
import {
  persistScrAttachmentFiles,
  readScrAttachmentFile,
  trashScrAttachmentFile,
} from "./scr-attachment-vault.ts";
import type { PublicUser } from "./types.ts";
import type { ScrAttachment } from "./change-order-packet.ts";

export {
  QUALITY_DROP_ACCEPT,
  QUALITY_DROP_SIZE_ERROR,
  QUALITY_DROP_TYPE_ERROR,
  SCR_ATTACHMENT_VIEW_ERROR,
  SCR_ATTACHMENT_WRITE_ERROR,
};

export type ScrAttachmentUser = Pick<PublicUser, "email" | "name" | "role"> & {
  jobTitle?: string;
  privileges?: PublicUser["privileges"];
};

export type ScrAttachmentSaveInput = {
  packId?: unknown;
  rowId?: unknown;
  files?: unknown;
};

export type ScrAttachmentRemoveInput = {
  packId?: unknown;
  rowId?: unknown;
  driveId?: unknown;
  fileName?: unknown;
};

export type ScrAttachmentReadInput = {
  packId?: unknown;
  rowId?: unknown;
  driveId?: unknown;
};

export type ScrAttachmentDeps = {
  drive?: DriveAdapter;
  pack?: ScopedPack | null;
};

function asId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function placeOf(input: { packId?: unknown; rowId?: unknown }) {
  const packId = asId(input.packId);
  const rowId = asId(input.rowId);
  if (!packId) return { error: "Pick an estimate." };
  if (!rowId) return { error: "Pick an SCR." };
  return { packId, rowId };
}

export function scrAttachmentWriteUserError(error: unknown, ownerFacing: boolean) {
  if (error instanceof Error && error.message === SCR_ATTACHMENT_WRITE_ERROR) return SCR_ATTACHMENT_WRITE_ERROR;
  if (!ownerFacing) return SCR_ATTACHMENT_WRITE_ERROR;
  const kind = driveFailureKind(error);
  if (kind === "quota") return "Drive quota was exceeded. The backup did not save. Try again in a minute.";
  if (kind === "oauth") return "Drive sign-in expired. Sign in again and attach the backup.";
  if (kind === "folder") return "Could not create the SCR attachments folder in the estimate pack.";
  if (kind === "share") return "The estimate pack folder is not writable by the desk.";
  if (kind === "missing") return "The estimate pack folder was not found.";
  return SCR_ATTACHMENT_WRITE_ERROR;
}

async function resolveVisiblePack(user: ScopeUser, packId: string, deps?: ScrAttachmentDeps) {
  if (deps?.pack && (deps.pack.packId || packId) === packId) return deps.pack;
  if (deps?.pack && !deps.pack.packId) return { ...deps.pack, packId };
  return getVisiblePack(user, packId, deps?.drive);
}

function canOpenPack(user: ScopeUser, pack: ScopedPack) {
  return isTester(user) ? packVisibleTo(user, pack) : packListedOnOwnerDesk(user, pack);
}

export async function saveScrAttachments(user: ScrAttachmentUser, input: ScrAttachmentSaveInput, deps?: ScrAttachmentDeps) {
  const place = placeOf(input);
  if ("error" in place) return { ok: false as const, status: 400, error: place.error, rejected: [] as Array<{ name: string; error: string }> };
  const pack = await resolveVisiblePack(user, place.packId, deps);
  if (!pack || !canOpenPack(user, pack)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk.", rejected: [] };
  }
  if (!canEditChangeOrders(user)) {
    return { ok: false as const, status: 403, error: SCR_ATTACHMENT_VIEW_ERROR, rejected: [] };
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
  const drive = estimateVaultAdapter(deps?.drive);
  try {
    const persisted = await persistScrAttachmentFiles(drive, place, check.accepted as LeadFile[], user.email);
    const stamp = new Date().toISOString();
    const attachments: ScrAttachment[] = persisted.files.map((file, index) => ({
      id: `scr-att-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      type: file.type,
      size: file.size,
      addedBy: user.name.trim() || user.email.trim(),
      addedAt: stamp,
      driveId: file.driveId,
    }));
    return {
      ok: true as const,
      attachments,
      rejected: check.rejected,
      stored: true as const,
      store: "drive" as const,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status || 503 : 503;
    return {
      ok: false as const,
      status: status === 403 || status === 404 ? status : 503,
      error: scrAttachmentWriteUserError(error, hasBuildDesk(user)),
      rejected: check.rejected,
    };
  }
}

export async function removeScrAttachmentFile(
  user: ScrAttachmentUser,
  input: ScrAttachmentRemoveInput,
  deps?: ScrAttachmentDeps,
) {
  const place = placeOf(input);
  if ("error" in place) return { ok: false as const, status: 400, error: place.error };
  const pack = await resolveVisiblePack(user, place.packId, deps);
  if (!pack || !canOpenPack(user, pack)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  if (!canEditChangeOrders(user)) {
    return { ok: false as const, status: 403, error: SCR_ATTACHMENT_VIEW_ERROR };
  }
  const driveId = asId(input.driveId);
  const fileName = asId(input.fileName);
  if (!driveId && !fileName) return { ok: false as const, status: 400, error: "Pick a backup file." };
  const drive = estimateVaultAdapter(deps?.drive);
  try {
    const result = await trashScrAttachmentFile(drive, place, { driveId, fileName });
    return { ok: true as const, missing: result.missing, trashed: result.trashed, store: result.store, stored: result.stored };
  } catch (error) {
    return {
      ok: false as const,
      status: 503,
      error: scrAttachmentWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function readScrAttachmentBytes(
  user: ScrAttachmentUser,
  input: ScrAttachmentReadInput,
  deps?: ScrAttachmentDeps,
) {
  const place = placeOf(input);
  if ("error" in place) return { ok: false as const, status: 400, error: place.error };
  const pack = await resolveVisiblePack(user, place.packId, deps);
  if (!pack || !canOpenPack(user, pack)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  const driveId = asId(input.driveId);
  if (!driveId) return { ok: false as const, status: 400, error: "Pick a backup file." };
  const drive = estimateVaultAdapter(deps?.drive);
  const listed = await readScrAttachmentFile(drive, place, driveId);
  if (!listed.file) {
    return { ok: false as const, status: 404, error: SCR_ATTACHMENT_MISSING_ERROR };
  }
  return {
    ok: true as const,
    file: listed.file,
    store: listed.store,
    stored: listed.stored,
  };
}
