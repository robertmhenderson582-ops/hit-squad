import { isTester } from "./desk-role.ts";
import {
  canTransferPack,
  canWritePack,
  ownerVaultEmail,
  packOwnerEmailForWrite,
  packVisibleTo,
  visiblePacks,
  type ScopeUser,
} from "./estimate-scope.ts";
import { findHandoffSeat, isHandoffEmail, TRANSFER_WRITE_ERROR, UPSERT_WRITE_ERROR } from "./handoff.ts";
import { parseIncomingPack, publicPack, type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  deleteEstimateInDrive,
  driveAdapter,
  driveStoreKind,
  listDrivePacks,
  overwriteEstimateInDrive,
  readDrivePack,
  readDrivePackById,
  upsertEstimateInDrive,
  type DriveAdapter,
} from "./drive-estimates.ts";

export { TRANSFER_WRITE_ERROR, UPSERT_WRITE_ERROR } from "./handoff.ts";

export function estimateVaultAdapter(adapter?: DriveAdapter) {
  return adapter ?? driveAdapter();
}

export async function listVisiblePacks(user: ScopeUser, adapter?: DriveAdapter) {
  const drive = estimateVaultAdapter(adapter);
  const store = drive.configured ? "drive" : driveStoreKind();
  if (!drive.configured) return { packs: [] as EstimatePackSnapshot[], store };
  const packs = visiblePacks(user, await listDrivePacks(drive)).map(publicPack);
  return { packs, store };
}

export async function getVisiblePack(user: ScopeUser, packId: string, adapter?: DriveAdapter) {
  const { packs } = await listVisiblePacks(user, adapter);
  return packs.find((pack) => pack.packId === packId) ?? null;
}

async function claimedPack(drive: DriveAdapter, packId: string, ownerEmail: string) {
  if (!drive.configured) return null;
  try {
    const byOwner = await readDrivePack(drive, packId, ownerEmail);
    if (byOwner) return byOwner;
    return await readDrivePackById(drive, packId);
  } catch {
    return null;
  }
}

async function drivePackById(drive: DriveAdapter, packId: string) {
  if (!drive.configured) return null;
  try {
    return await readDrivePackById(drive, packId);
  } catch {
    return null;
  }
}

function localPackForTransfer(user: ScopeUser, packId: string, incoming: unknown): EstimatePackSnapshot | null {
  if (incoming == null) return null;
  const parsed = parseIncomingPack(incoming);
  if (!parsed.ok || parsed.pack.packId !== packId) return null;
  const ownerEmail =
    parsed.pack.ownerEmail.trim().toLowerCase() ||
    (isTester(user) ? user.email.trim().toLowerCase() : ownerVaultEmail());
  return publicPack({ ...parsed.pack, ownerEmail });
}

export async function upsertVisiblePack(user: ScopeUser, incoming: unknown, adapter?: DriveAdapter) {
  const parsed = parseIncomingPack(incoming);
  if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.error };
  const drive = estimateVaultAdapter(adapter);
  const existingOwner = parsed.pack.ownerEmail;
  const ownerEmail = packOwnerEmailForWrite(user, existingOwner);
  const claimed = await claimedPack(drive, parsed.pack.packId, ownerEmail);
  if (claimed && !packVisibleTo(user, claimed)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  if (claimed && !canWritePack(user, claimed)) {
    return { ok: false as const, status: 403, error: "That package is not on this desk." };
  }
  const pack = publicPack({
    ...parsed.pack,
    ownerEmail: claimed?.ownerEmail || ownerEmail,
    archived: parsed.pack.archived,
    updatedAt: parsed.pack.updatedAt || Date.now(),
  });
  if (!drive.configured) {
    return { ok: true as const, stored: false, store: "unconfigured" as const, pack };
  }
  try {
    await upsertEstimateInDrive(drive, pack);
  } catch {
    return { ok: false as const, status: 502, error: UPSERT_WRITE_ERROR };
  }
  return { ok: true as const, stored: true, store: "drive" as const, pack };
}

export async function transferVisiblePack(
  user: ScopeUser,
  packId: string,
  toEmail: string,
  adapter?: DriveAdapter,
  incoming?: unknown,
) {
  const target = findHandoffSeat(toEmail);
  if (!target || !isHandoffEmail(target.email)) {
    return { ok: false as const, status: 400, error: "Pick someone on this desk." };
  }
  if (target.email === user.email.trim().toLowerCase()) {
    return { ok: false as const, status: 400, error: "Pick someone else on this desk." };
  }
  const drive = estimateVaultAdapter(adapter);
  const fromDrive = await drivePackById(drive, packId);
  const fromLocal = localPackForTransfer(user, packId, incoming);
  const current = fromDrive || fromLocal;
  if (!current || !packVisibleTo(user, current) || !canTransferPack(user, current)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  const pack = publicPack({
    ...current,
    ownerEmail: target.email,
    transferredFrom: user.email.trim().toLowerCase(),
    transferredTo: target.email,
    transferredToName: target.name,
    archived: false,
    updatedAt: Date.now(),
  });
  if (!drive.configured) {
    return { ok: true as const, stored: false, store: "unconfigured" as const, pack, to: target };
  }
  try {
    await overwriteEstimateInDrive(drive, pack);
  } catch {
    return { ok: false as const, status: 502, error: TRANSFER_WRITE_ERROR };
  }
  return { ok: true as const, stored: true, store: "drive" as const, pack, to: target };
}

export async function archiveVisiblePack(
  user: ScopeUser,
  packId: string,
  archived: boolean,
  adapter?: DriveAdapter,
) {
  const drive = estimateVaultAdapter(adapter);
  const current = drive.configured ? await readDrivePackById(drive, packId) : null;
  if (current && !packVisibleTo(user, current)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  if (current && !canWritePack(user, current)) {
    return { ok: false as const, status: 403, error: "That package is not on this desk." };
  }
  if (!current) {
    return { ok: true as const, stored: false, store: drive.configured ? "drive" : driveStoreKind(), pack: null };
  }
  const pack = publicPack({ ...current, archived, updatedAt: Date.now() });
  await upsertEstimateInDrive(drive, pack);
  return { ok: true as const, stored: true, store: "drive" as const, pack };
}

export async function deleteVisiblePack(user: ScopeUser, packId: string, adapter?: DriveAdapter) {
  const drive = estimateVaultAdapter(adapter);
  const current = drive.configured ? await readDrivePackById(drive, packId) : null;
  if (current && !packVisibleTo(user, current)) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  if (current && !canWritePack(user, current)) {
    return { ok: false as const, status: 403, error: "That package is not on this desk." };
  }
  if (!current || !drive.configured) {
    return { ok: true as const, deleted: false, store: drive.configured ? "drive" : driveStoreKind() };
  }
  const removed = await deleteEstimateInDrive(drive, packId, current.ownerEmail);
  return { ok: true as const, deleted: removed, store: "drive" as const };
}

export function packsResponse(user: ScopeUser, packs: EstimatePackSnapshot[], store: string) {
  const body: { packs: EstimatePackSnapshot[]; persisted: boolean; store?: string } = {
    packs: packs.map(publicPack),
    persisted: store === "drive",
  };
  if (user.role === "owner" || user.role === "operator") body.store = store;
  return body;
}
