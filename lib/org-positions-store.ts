import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { POSITIONS_VAULT_KIND, POSITIONS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import type { Division } from "./divisions.ts";
import {
  alreadyHolds,
  emptyPositionFile,
  holdId,
  mergePositions,
  parsePositionFile,
  uniquePositionId,
  withPresidentSeatHolds,
  type OrgPosition,
  type OrgPositionFile,
  type OrgPositionHold,
} from "./org-positions.ts";

let memoryOverride: OrgPositionFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function positionStorePath(): string {
  if (process.env.POSITION_STORE_PATH) return process.env.POSITION_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-positions.json";
  return join(process.cwd(), "data", "positions.json");
}

function readCache(): OrgPositionFile {
  if (memoryOverride) {
    return parsePositionFile(memoryOverride);
  }
  try {
    return parsePositionFile(JSON.parse(readFileSync(positionStorePath(), "utf8")));
  } catch {
    return emptyPositionFile();
  }
}

function writeCache(data: OrgPositionFile) {
  const next = parsePositionFile(data);
  if (memoryOverride) {
    memoryOverride = next;
    return;
  }
  const path = positionStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.POSITION_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

function hasDeskData(data: OrgPositionFile) {
  return data.positions.length > 0 || data.holds.length > 0 || data.removedIds.length > 0;
}

async function persist(data: OrgPositionFile) {
  writeCache(data);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, POSITIONS_VAULT_NAME, POSITIONS_VAULT_KIND, data);
}

export async function hydratePositionStore(): Promise<OrgPositionFile> {
  if (memoryOverride) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, POSITIONS_VAULT_NAME, POSITIONS_VAULT_KIND);
      const vault = parsePositionFile(raw);
      if (hasDeskData(vault)) writeCache(vault);
      else if (hasDeskData(cache) && raw == null) {
        await writeVaultJson(drive, POSITIONS_VAULT_NAME, POSITIONS_VAULT_KIND, cache);
      } else if (raw != null) {
        writeCache(vault);
      }
    } catch {
      // Keep the local cache. A failed vault read must not wipe assignments.
    }
  }
  hydrated = true;
  return readCache();
}

export function peekPositionFile(): OrgPositionFile {
  return readCache();
}

export function peekHolds(): OrgPositionHold[] {
  return readCache().holds;
}

export async function listPositionCatalog(divisions: Division[] = []): Promise<OrgPosition[]> {
  const data = await hydratePositionStore();
  return mergePositions(data.positions, data.removedIds, divisions);
}

export async function listHolds(seats: Array<{ email?: string; role?: string }> = []): Promise<OrgPositionHold[]> {
  const data = await hydratePositionStore();
  return withPresidentSeatHolds(data.holds, seats);
}

export async function assignPosition(
  positionId: string,
  email: string,
  divisions: Division[] = [],
): Promise<{ ok: true; hold: OrgPositionHold } | { error: string }> {
  const key = email.trim().toLowerCase();
  if (!key.includes("@")) return { error: "Pick someone on this desk." };
  const data = await hydratePositionStore();
  const catalog = mergePositions(data.positions, data.removedIds, divisions);
  const position = catalog.find((row) => row.id === positionId);
  if (!position) return { error: "Pick a position." };
  if (alreadyHolds(data.holds, position.id, key)) return { error: "That seat already holds this position." };
  const hold: OrgPositionHold = { id: holdId(position.id, key), positionId: position.id, email: key };
  data.holds = [...data.holds, hold];
  await persist(data);
  return { ok: true, hold };
}

export async function revokePositionHold(
  holdKey: { holdId?: string; positionId?: string; email?: string },
): Promise<{ ok: true; hold: OrgPositionHold } | { error: string }> {
  const data = await hydratePositionStore();
  const email = typeof holdKey.email === "string" ? holdKey.email.trim().toLowerCase() : "";
  const positionId = typeof holdKey.positionId === "string" ? holdKey.positionId.trim() : "";
  const id = typeof holdKey.holdId === "string" ? holdKey.holdId.trim() : holdId(positionId, email);
  const hold = data.holds.find((row) => row.id === id || (row.positionId === positionId && row.email === email));
  if (!hold) return { error: "That seat does not hold this position." };
  data.holds = data.holds.filter((row) => row.id !== hold.id);
  await persist(data);
  return { ok: true, hold };
}

export async function renameStoredPosition(
  positionId: string,
  label: string,
  divisions: Division[] = [],
): Promise<{ ok: true; position: OrgPosition } | { error: string }> {
  const data = await hydratePositionStore();
  const catalog = mergePositions(data.positions, data.removedIds, divisions);
  const existing = catalog.find((row) => row.id === positionId);
  if (!existing) return { error: "Pick a position." };
  const next: OrgPosition = { ...existing, label };
  data.removedIds = data.removedIds.filter((id) => id !== next.id);
  data.positions = [...data.positions.filter((row) => row.id !== next.id), next];
  await persist(data);
  return { ok: true, position: next };
}

export async function createCustomPosition(
  name: string,
  opts?: { companyId?: string; desk?: OrgPosition["desk"] },
  divisions: Division[] = [],
): Promise<{ ok: true; position: OrgPosition } | { error: string }> {
  const data = await hydratePositionStore();
  const catalog = mergePositions(data.positions, data.removedIds, divisions);
  const id = uniquePositionId(name, catalog);
  const next: OrgPosition = {
    id,
    kind: "custom",
    label: name,
    desk: opts?.desk === "corporate" ? "corporate" : "field",
    ...(opts?.companyId ? { companyId: opts.companyId } : {}),
  };
  data.removedIds = data.removedIds.filter((row) => row !== id);
  data.positions = [...data.positions.filter((row) => row.id !== id), next];
  await persist(data);
  return { ok: true, position: next };
}

export async function removeStoredPosition(positionId: string): Promise<{ ok: true; positionId: string } | { error: string }> {
  const data = await hydratePositionStore();
  const id = positionId.trim();
  if (!id) return { error: "Pick a position." };
  data.positions = data.positions.filter((row) => row.id !== id);
  data.holds = data.holds.filter((row) => row.positionId !== id);
  data.removedIds = [...new Set([...data.removedIds, id])];
  await persist(data);
  return { ok: true, positionId: id };
}

export function resetPositionsForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = positionStorePath();
  if (process.env.POSITION_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(emptyPositionFile(), null, 2) + "\n", "utf8");
  }
}

export function forgetPositionCacheForTests() {
  memoryOverride = null;
  hydrated = false;
  const path = positionStorePath();
  if (existsSync(path)) unlinkSync(path);
}

export function usePositionVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  memoryOverride = null;
}

export function useMemoryPositions() {
  memoryOverride = emptyPositionFile();
  hydrated = true;
  injectedAdapter = null;
}
