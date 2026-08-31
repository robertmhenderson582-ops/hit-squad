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

type ActivityFile = { rows?: ActivityRow[] };

let memoryOverride: ActivityRow[] | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function activityStorePath(): string {
  if (process.env.ACTIVITY_STORE_PATH) return process.env.ACTIVITY_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-activity.json";
  return join(process.cwd(), "data", "activity.json");
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

function readCache(): ActivityRow[] {
  if (memoryOverride) return [...memoryOverride];
  try {
    return parseActivityRows(JSON.parse(readFileSync(activityStorePath(), "utf8")));
  } catch {
    return [];
  }
}

function writeCache(rows: ActivityRow[]) {
  const next = pruneRows(rows);
  if (memoryOverride) {
    memoryOverride = [...next];
    return;
  }
  const path = activityStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ rows: next }, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.ACTIVITY_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(rows: ActivityRow[]) {
  const next = pruneRows(rows);
  writeCache(next);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND, { rows: next });
}

export async function hydrateActivityStore(): Promise<ActivityRow[]> {
  if (memoryOverride) return readCache();
  if (hydrated) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = parseActivityRows(await readVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND));
      if (vault.length) writeCache(vault);
      else if (cache.length) await writeVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND, { rows: cache });
    } catch {
      // Keep the local cache.
    }
  }
  hydrated = true;
  return readCache();
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
  await persist(rows);
}

export async function removeActivityOlderThan(days: number) {
  const cutoff = Date.now() - days * DAY_MS;
  const rows = (await hydrateActivityStore()).filter((row) => row.at >= cutoff);
  await persist(rows);
}

export async function clearActivity() {
  await persist([]);
}

export function resetActivityStoreForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = activityStorePath();
  if (process.env.ACTIVITY_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ rows: [] }, null, 2) + "\n", "utf8");
  }
}

export function forgetActivityCacheForTests() {
  memoryOverride = null;
  hydrated = false;
  const path = activityStorePath();
  if (existsSync(path)) unlinkSync(path);
}

export function useActivityVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  memoryOverride = null;
}
