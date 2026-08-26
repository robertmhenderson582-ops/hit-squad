import { isTester } from "./desk-role.ts";
import {
  canWritePack,
  packOwnerEmailForWrite,
  packVisibleTo,
  visiblePacks,
  type ScopeUser,
} from "./estimate-scope.ts";
import { parseIncomingPack, publicPack, type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  driveAdapter,
  driveStoreKind,
  listDrivePacks,
  readDrivePack,
  upsertEstimateInDrive,
  type DriveAdapter,
} from "./drive-estimates.ts";

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

export async function upsertVisiblePack(user: ScopeUser, incoming: unknown, adapter?: DriveAdapter) {
  const parsed = parseIncomingPack(incoming);
  if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.error };
  if (isTester(user)) {
    return {
      ok: true as const,
      stored: false,
      store: "local" as const,
      pack: publicPack({ ...parsed.pack, ownerEmail: user.email.trim().toLowerCase() }),
    };
  }
  const drive = estimateVaultAdapter(adapter);
  const existingOwner = parsed.pack.ownerEmail;
  const ownerEmail = packOwnerEmailForWrite(user, existingOwner);
  const existing = drive.configured ? await readDrivePack(drive, parsed.pack.packId, ownerEmail) : null;
  const claimed = existing || (existingOwner ? parsed.pack : null);
  if (claimed && !packVisibleTo(user, { ownerEmail: claimed.ownerEmail || ownerEmail })) {
    return { ok: false as const, status: 404, error: "That package is not on this desk." };
  }
  if (claimed && !canWritePack(user, { ownerEmail: claimed.ownerEmail || ownerEmail })) {
    return { ok: false as const, status: 403, error: "That package is not on this desk." };
  }
  const pack = publicPack({ ...parsed.pack, ownerEmail, updatedAt: parsed.pack.updatedAt || Date.now() });
  if (!drive.configured) {
    return { ok: true as const, stored: false, store: "unconfigured" as const, pack };
  }
  await upsertEstimateInDrive(drive, pack);
  return { ok: true as const, stored: true, store: "drive" as const, pack };
}

export function packsResponse(user: ScopeUser, packs: EstimatePackSnapshot[], store: string) {
  const body: { packs: EstimatePackSnapshot[]; store?: string } = { packs: packs.map(publicPack) };
  if (user.role === "owner" || user.role === "operator") body.store = store;
  return body;
}
