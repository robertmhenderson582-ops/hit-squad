import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ACTIVITY_VAULT_KIND, ACTIVITY_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";

export type ActivityKind = "sign-in" | "failed" | "session" | "feature" | "error";

export type ActivityRow = {
  id: string;
  at: number;
  kind: ActivityKind;
  who: string;
  detail: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_KEEP_MS = 30 * DAY_MS;

type ActivityFile = { rows?: ActivityRow[]; removedIds?: string[] };

let memoryOverride: ActivityRow[] | null = null;
let memoryRemoved: string[] | null = null;
let injectedAdapter: DriveAdapter | null | undefined;

export function activityStorePath(): string {
  if (process.env.ACTIVITY_STORE_PATH) return process.env.ACTIVITY_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-activity.json";
  return join(process.cwd(), "data", "activity.json");
}

function parseRemovedIds(raw: unknown): string[] {
  const parsed = raw && typeof raw === "object" ? (raw as ActivityFile) : {};
  if (!Array.isArray(parsed.removedIds)) return [];
  return [...new Set(parsed.removedIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

export function parseActivityRows(raw: unknown): ActivityRow[] {
  const parsed = raw && typeof raw === "object" ? (raw as ActivityFile) : { rows: [] };
  const rows: ActivityRow[] = [];
  for (const row of parsed.rows ?? []) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (typeof row.kind !== "string" || typeof row.who !== "string" || typeof row.detail !== "string") continue;
    const at = Number(row.at);
    if (!Number.isFinite(at)) continue;
    rows.push({ id: row.id, at, kind: row.kind as ActivityKind, who: row.who, detail: row.detail });
  }
  return pruneRows(rows);
}

function pruneRows(rows: ActivityRow[], now = Date.now()) {
  const cutoff = now - ACTIVITY_KEEP_MS;
  return rows.filter((row) => row.at >= cutoff);
}

function stampRow(kind: ActivityKind, who: string, detail: string, at = Date.now()): ActivityRow {
  return { id: `act-${at}-${Math.random().toString(36).slice(2, 7)}`, at, kind, who, detail };
}

export function mergeActivityRows(vault: ActivityRow[], incoming: ActivityRow[]): ActivityRow[] {
  const map = new Map<string, ActivityRow>();
  for (const row of vault) map.set(row.id, row);
  for (const row of incoming) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return pruneRows([...map.values()]);
}

function readFileRaw(): unknown {
  try {
    return JSON.parse(readFileSync(activityStorePath(), "utf8"));
  } catch {
    return null;
  }
}

function readCache(): { rows: ActivityRow[]; removedIds: string[] } {
  if (memoryOverride) {
    return { rows: [...memoryOverride], removedIds: [...(memoryRemoved ?? [])] };
  }
  const raw = readFileRaw();
  return { rows: parseActivityRows(raw), removedIds: parseRemovedIds(raw) };
}

function writeCache(rows: ActivityRow[], removedIds: string[]) {
  const next = pruneRows(rows);
  const tombstones = [...new Set(removedIds)].filter((id) => !next.some((row) => row.id === id));
  if (memoryOverride) {
    memoryOverride = [...next];
    memoryRemoved = tombstones;
    return;
  }
  const path = activityStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ rows: next, removedIds: tombstones }, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.ACTIVITY_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function readVaultFile(): Promise<{ rows: ActivityRow[]; removedIds: string[] } | null> {
  const drive = resolveAdapter();
  if (!drive) return null;
  const raw = await readVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND);
  if (raw == null) return null;
  return { rows: parseActivityRows(raw), removedIds: parseRemovedIds(raw) };
}

async function persist(rows: ActivityRow[], opts?: { removedIds?: string[]; replace?: boolean }) {
  const extraRemoved = opts?.removedIds ?? [];
  const drive = resolveAdapter();
  const cache = readCache();
  const vault = drive ? await readVaultFile() : null;
  const baseRows = opts?.replace ? pruneRows(rows) : mergeActivityRows(vault?.rows ?? cache.rows, rows);
  const removed = new Set([...(vault?.removedIds ?? []), ...cache.removedIds, ...extraRemoved]);
  if (opts?.replace) {
    for (const row of vault?.rows ?? cache.rows) removed.add(row.id);
    for (const row of rows) removed.delete(row.id);
  }
  const next = baseRows.filter((row) => !removed.has(row.id));
  const tombstones = [...removed].filter((id) => !next.some((row) => row.id === id));
  if (drive) {
    await writeVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND, { rows: next, removedIds: tombstones });
  }
  writeCache(next, tombstones);
}

export async function hydrateActivityStore(): Promise<ActivityRow[]> {
  if (memoryOverride) return readCache().rows;
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultFile();
      if (vault) {
        const removed = new Set([...vault.removedIds, ...cache.removedIds]);
        const seedFromCache = vault.rows.length > 0 || removed.size > 0;
        const merged = mergeActivityRows(vault.rows, seedFromCache ? cache.rows : []).filter((row) => !removed.has(row.id));
        writeCache(merged, [...removed]);
        if (merged.length !== vault.rows.length || vault.removedIds.length !== removed.size) {
          await writeVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND, {
            rows: merged,
            removedIds: [...removed].filter((id) => !merged.some((row) => row.id === id)),
          });
        }
      } else if (cache.rows.length || cache.removedIds.length) {
        await writeVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND, {
          rows: cache.rows,
          removedIds: cache.removedIds,
        });
      }
    } catch {
      // Keep the local cache. A failed vault read must not wipe the ledger.
    }
  }
  return readCache().rows;
}

export async function listActivity(): Promise<ActivityRow[]> {
  const rows = await hydrateActivityStore();
  return [...rows].sort((a, b) => b.at - a.at);
}

export async function addActivity(row: Omit<ActivityRow, "id" | "at"> & { at?: number }): Promise<ActivityRow> {
  const rows = await hydrateActivityStore();
  const entry = stampRow(row.kind, row.who, row.detail, row.at);
  rows.unshift(entry);
  await persist(rows);
  return entry;
}

export async function removeActivity(id: string) {
  const rows = (await hydrateActivityStore()).filter((row) => row.id !== id);
  await persist(rows, { removedIds: [id] });
}

export async function removeActivityOlderThan(days: number) {
  const cutoff = Date.now() - days * DAY_MS;
  const current = await hydrateActivityStore();
  const removedIds = current.filter((row) => row.at < cutoff).map((row) => row.id);
  await persist(
    current.filter((row) => row.at >= cutoff),
    { removedIds },
  );
}

export async function clearActivity() {
  await persist([], { replace: true });
}

export function resetActivityStoreForTests() {
  memoryOverride = null;
  memoryRemoved = null;
  injectedAdapter = undefined;
  const path = activityStorePath();
  if (process.env.ACTIVITY_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ rows: [], removedIds: [] }, null, 2) + "\n", "utf8");
  }
}

export function forgetActivityCacheForTests() {
  memoryOverride = null;
  memoryRemoved = null;
  const path = activityStorePath();
  if (existsSync(path)) unlinkSync(path);
}

export function useActivityVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  memoryOverride = null;
  memoryRemoved = null;
}
