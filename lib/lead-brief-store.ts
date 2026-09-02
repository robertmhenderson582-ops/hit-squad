import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { briefsVault, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import type { LeadBrief, LeadFile, PublicLeadBrief } from "./lead-briefs.ts";

export type LeadBriefKind = "quality" | "hse";

export type StoredLeadBrief = {
  id: string;
  kind: LeadBriefKind;
  who: string;
  whoName: string;
  describe: string;
  files: LeadFile[];
  savedAt: string;
};

export type { PublicLeadBrief };

type BriefFile = { briefs?: StoredLeadBrief[] };

let cache: Record<LeadBriefKind, StoredLeadBrief[] | null> = { quality: null, hse: null };
let loadedFrom: Record<LeadBriefKind, string | null> = { quality: null, hse: null };
let injectedAdapter: DriveAdapter | null | undefined;

export function leadBriefStoreKind() {
  return resolveAdapter() ? "drive" : "server-json-file";
}

export function leadBriefStorePath(kind: LeadBriefKind) {
  const envKey = kind === "hse" ? "HSE_BRIEF_STORE_PATH" : "QUALITY_BRIEF_STORE_PATH";
  if (process.env[envKey]) return process.env[envKey] as string;
  if (process.env.LEAD_BRIEF_STORE_PATH) return `${process.env.LEAD_BRIEF_STORE_PATH}.${kind}.json`;
  if (process.env.VERCEL) return `/tmp/hit-squad-${kind}-briefs.json`;
  return join(process.cwd(), "data", `${kind}-briefs.json`);
}

export function isLeadBriefKind(value: unknown): value is LeadBriefKind {
  return value === "quality" || value === "hse";
}

function sanitizeFileName(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() || "file";
  return base.slice(0, 180);
}

export function parseLeadFiles(raw: unknown): LeadFile[] {
  if (!Array.isArray(raw)) return [];
  const files: LeadFile[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = sanitizeFileName(typeof (row as LeadFile).name === "string" ? (row as LeadFile).name : "");
    const data = typeof (row as LeadFile).data === "string" ? (row as LeadFile).data : "";
    if (!name || !data) continue;
    files.push({
      name,
      type: typeof (row as LeadFile).type === "string" && (row as LeadFile).type.trim()
        ? (row as LeadFile).type
        : "application/octet-stream",
      data,
    });
  }
  return files;
}

export function parseLeadBriefFile(raw: unknown, kind: LeadBriefKind): StoredLeadBrief[] {
  const parsed = raw && typeof raw === "object" ? (raw as BriefFile) : { briefs: [] };
  const briefs: StoredLeadBrief[] = [];
  for (const row of parsed.briefs ?? []) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (typeof row.who !== "string" || !row.who.trim()) continue;
    briefs.push({
      id: row.id,
      kind,
      who: row.who.trim().toLowerCase(),
      whoName: typeof row.whoName === "string" && row.whoName.trim() ? row.whoName.trim() : row.who.trim(),
      describe: typeof row.describe === "string" ? row.describe : "",
      files: parseLeadFiles(row.files),
      savedAt: typeof row.savedAt === "string" ? row.savedAt : "",
    });
  }
  return briefs;
}

export function publicBrief(brief: StoredLeadBrief): PublicLeadBrief {
  return {
    ...brief,
    files: brief.files.map((file) => ({ name: file.name, type: file.type })),
  };
}

function richerBrief(left: StoredLeadBrief, right: StoredLeadBrief): StoredLeadBrief {
  return {
    ...left,
    ...right,
    describe: right.describe || left.describe,
    files: right.files.length ? right.files : left.files,
    savedAt: right.savedAt || left.savedAt,
    whoName: right.whoName || left.whoName,
  };
}

/** Union by id. Vault rows land first, incoming rows stay, same-id keeps the richer brief. */
export function mergeLeadBriefs(vault: StoredLeadBrief[], incoming: StoredLeadBrief[]): StoredLeadBrief[] {
  const map = new Map<string, StoredLeadBrief>();
  for (const row of vault) map.set(row.id, row);
  for (const row of incoming) {
    const existing = map.get(row.id);
    map.set(row.id, existing ? richerBrief(existing, row) : row);
  }
  return [...map.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
}

function readCache(kind: LeadBriefKind): StoredLeadBrief[] {
  const file = leadBriefStorePath(kind);
  if (cache[kind] && loadedFrom[kind] === file) return cache[kind] as StoredLeadBrief[];
  try {
    cache[kind] = parseLeadBriefFile(JSON.parse(readFileSync(file, "utf8")), kind);
  } catch {
    cache[kind] = [];
  }
  loadedFrom[kind] = file;
  return cache[kind] as StoredLeadBrief[];
}

function writeCache(kind: LeadBriefKind, briefs: StoredLeadBrief[]) {
  cache[kind] = briefs;
  const file = leadBriefStorePath(kind);
  loadedFrom[kind] = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ briefs }, null, 2) + "\n", "utf8");
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.LEAD_BRIEF_STORE_PATH || process.env.QUALITY_BRIEF_STORE_PATH || process.env.HSE_BRIEF_STORE_PATH) {
    return null;
  }
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

function readDiskBriefs(kind: LeadBriefKind): StoredLeadBrief[] {
  try {
    return parseLeadBriefFile(JSON.parse(readFileSync(leadBriefStorePath(kind), "utf8")), kind);
  } catch {
    return [];
  }
}

async function readVaultBriefs(kind: LeadBriefKind): Promise<StoredLeadBrief[]> {
  const drive = resolveAdapter();
  if (!drive) return [];
  const vault = briefsVault(kind);
  return parseLeadBriefFile(await readVaultJson(drive, vault.name, vault.kind), kind);
}

function briefsNeedVaultWrite(vault: StoredLeadBrief[], merged: StoredLeadBrief[]) {
  if (merged.length !== vault.length) return true;
  const byId = new Map(vault.map((row) => [row.id, row]));
  return merged.some((row) => {
    const existing = byId.get(row.id);
    return !existing || row.files.length > existing.files.length || Boolean(row.describe && !existing.describe);
  });
}

async function persist(kind: LeadBriefKind, briefs: StoredLeadBrief[]): Promise<StoredLeadBrief[]> {
  const drive = resolveAdapter();
  if (drive) {
    const merged = mergeLeadBriefs(await readVaultBriefs(kind), briefs);
    writeCache(kind, merged);
    const vault = briefsVault(kind);
    await writeVaultJson(drive, vault.name, vault.kind, { briefs: merged });
    return merged;
  }
  const merged = mergeLeadBriefs(readDiskBriefs(kind), briefs);
  writeCache(kind, merged);
  return merged;
}

export async function hydrateLeadBriefStore(kind: LeadBriefKind): Promise<StoredLeadBrief[]> {
  const cached = readCache(kind);
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultBriefs(kind);
      const merged = mergeLeadBriefs(vault, cached);
      writeCache(kind, merged);
      if (briefsNeedVaultWrite(vault, merged)) {
        const named = briefsVault(kind);
        await writeVaultJson(drive, named.name, named.kind, { briefs: merged });
      }
    } catch {
      // Keep the local cache.
    }
    return readCache(kind);
  }
  const merged = mergeLeadBriefs(readDiskBriefs(kind), cached);
  writeCache(kind, merged);
  return readCache(kind);
}

export function briefIdFor(kind: LeadBriefKind, who: string) {
  return `brief-${kind}-${who.trim().toLowerCase()}`;
}

export async function listStoredBriefs(kind: LeadBriefKind, who?: string): Promise<StoredLeadBrief[]> {
  const briefs = await hydrateLeadBriefStore(kind);
  if (!who) return [...briefs];
  const key = who.trim().toLowerCase();
  return briefs.filter((row) => row.who === key);
}

export async function saveStoredBrief(input: {
  kind: LeadBriefKind;
  who: string;
  whoName: string;
  describe?: string;
  files?: LeadBrief["files"];
}): Promise<StoredLeadBrief> {
  const who = input.who.trim().toLowerCase();
  const next: StoredLeadBrief = {
    id: briefIdFor(input.kind, who),
    kind: input.kind,
    who,
    whoName: input.whoName.trim() || who,
    describe: typeof input.describe === "string" ? input.describe : "",
    files: parseLeadFiles(input.files),
    savedAt: new Date().toLocaleString("en-GB", { hour12: false }),
  };
  const briefs = await hydrateLeadBriefStore(input.kind);
  const index = briefs.findIndex((row) => row.id === next.id);
  if (index >= 0) briefs[index] = richerBrief(briefs[index], next);
  else briefs.unshift(next);
  const saved = await persist(input.kind, briefs);
  return saved.find((row) => row.id === next.id) ?? next;
}

export function resetLeadBriefStoreForTests(path?: string) {
  cache = { quality: null, hse: null };
  loadedFrom = { quality: null, hse: null };
  injectedAdapter = undefined;
  if (path) process.env.LEAD_BRIEF_STORE_PATH = path;
  else delete process.env.LEAD_BRIEF_STORE_PATH;
  delete process.env.QUALITY_BRIEF_STORE_PATH;
  delete process.env.HSE_BRIEF_STORE_PATH;
}

export function forgetLeadBriefCacheForTests(kind?: LeadBriefKind) {
  const kinds: LeadBriefKind[] = kind ? [kind] : ["quality", "hse"];
  for (const item of kinds) {
    cache[item] = null;
    loadedFrom[item] = null;
    const file = leadBriefStorePath(item);
    if (existsSync(file)) unlinkSync(file);
  }
}

export function staleWarmLeadBriefInstanceForTests(kind: LeadBriefKind = "quality") {
  cache[kind] = [];
  loadedFrom[kind] = leadBriefStorePath(kind);
}

export function useLeadBriefVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  cache = { quality: null, hse: null };
  loadedFrom = { quality: null, hse: null };
}
