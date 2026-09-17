import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { SITE_ACCESS_VAULT_KIND, SITE_ACCESS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { parseSiteAccessGrant, type SiteAccessGrant } from "./site-access.ts";
import { parseToolRoomDuty, type ToolRoomDuty } from "./tool-room-duty.ts";

export type SiteAccessFile = {
  grants: SiteAccessGrant[];
  toolRoom: ToolRoomDuty[];
};

let memoryOverride: SiteAccessFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function siteAccessStorePath(): string {
  if (process.env.SITE_ACCESS_STORE_PATH) return process.env.SITE_ACCESS_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-site-access.json";
  return join(process.cwd(), "data", "site-access.json");
}

export function parseSiteAccessFile(raw: unknown): SiteAccessFile {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<SiteAccessFile>) : {};
  const grants: SiteAccessGrant[] = [];
  const seenGrants = new Set<string>();
  for (const item of Array.isArray(parsed.grants) ? parsed.grants : []) {
    const grant = parseSiteAccessGrant(item);
    if (!grant || seenGrants.has(grant.id)) continue;
    seenGrants.add(grant.id);
    grants.push(grant);
  }
  const toolRoom: ToolRoomDuty[] = [];
  const seenDuty = new Set<string>();
  for (const item of Array.isArray(parsed.toolRoom) ? parsed.toolRoom : []) {
    const duty = parseToolRoomDuty(item);
    if (!duty || seenDuty.has(duty.id)) continue;
    seenDuty.add(duty.id);
    toolRoom.push(duty);
  }
  return { grants, toolRoom };
}

function emptyFile(): SiteAccessFile {
  return { grants: [], toolRoom: [] };
}

function readCache(): SiteAccessFile {
  if (memoryOverride) {
    return { grants: [...memoryOverride.grants], toolRoom: [...memoryOverride.toolRoom] };
  }
  try {
    return parseSiteAccessFile(JSON.parse(readFileSync(siteAccessStorePath(), "utf8")));
  } catch {
    return emptyFile();
  }
}

function writeCache(data: SiteAccessFile) {
  if (memoryOverride) {
    memoryOverride = { grants: [...data.grants], toolRoom: [...data.toolRoom] };
    return;
  }
  const path = siteAccessStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.SITE_ACCESS_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(data: SiteAccessFile) {
  writeCache(data);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, SITE_ACCESS_VAULT_NAME, SITE_ACCESS_VAULT_KIND, data);
}

export async function hydrateSiteAccessStore(): Promise<SiteAccessFile> {
  if (memoryOverride) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, SITE_ACCESS_VAULT_NAME, SITE_ACCESS_VAULT_KIND);
      const vault = parseSiteAccessFile(raw);
      if (vault.grants.length || vault.toolRoom.length) writeCache(vault);
      else if ((cache.grants.length || cache.toolRoom.length) && raw == null) {
        await writeVaultJson(drive, SITE_ACCESS_VAULT_NAME, SITE_ACCESS_VAULT_KIND, cache);
      } else if (raw != null) {
        writeCache(vault);
      }
    } catch {
      // Keep the local cache.
    }
  }
  hydrated = true;
  return readCache();
}

export async function listSiteAccessGrants(siteId?: string): Promise<SiteAccessGrant[]> {
  const data = await hydrateSiteAccessStore();
  const key = siteId ? siteId.trim().toLowerCase() : "";
  return key ? data.grants.filter((row) => row.siteId === key) : [...data.grants];
}

export async function listPendingSiteAccessGrants(): Promise<SiteAccessGrant[]> {
  const data = await hydrateSiteAccessStore();
  return data.grants.filter((row) => row.state === "pending");
}

export async function getSiteAccessGrant(id: string): Promise<SiteAccessGrant | null> {
  const data = await hydrateSiteAccessStore();
  return data.grants.find((row) => row.id === id) ?? null;
}

export async function listToolRoomDuties(siteId?: string): Promise<ToolRoomDuty[]> {
  const data = await hydrateSiteAccessStore();
  const key = siteId ? siteId.trim().toLowerCase() : "";
  return key ? data.toolRoom.filter((row) => row.siteId === key) : [...data.toolRoom];
}

export async function upsertSiteAccessGrant(grant: SiteAccessGrant): Promise<SiteAccessGrant> {
  const data = await hydrateSiteAccessStore();
  data.grants = data.grants.filter((row) => row.id !== grant.id);
  data.grants.push(grant);
  await persist(data);
  return grant;
}

export async function removeSiteAccessGrant(id: string): Promise<boolean> {
  const data = await hydrateSiteAccessStore();
  const next = data.grants.filter((row) => row.id !== id);
  if (next.length === data.grants.length) return false;
  data.grants = next;
  await persist(data);
  return true;
}

export async function upsertToolRoomDuty(duty: ToolRoomDuty): Promise<ToolRoomDuty> {
  const data = await hydrateSiteAccessStore();
  data.toolRoom = data.toolRoom.filter((row) => row.id !== duty.id);
  data.toolRoom.push(duty);
  await persist(data);
  return duty;
}

export async function removeToolRoomDuty(id: string): Promise<boolean> {
  const data = await hydrateSiteAccessStore();
  const next = data.toolRoom.filter((row) => row.id !== id);
  if (next.length === data.toolRoom.length) return false;
  data.toolRoom = next;
  await persist(data);
  return true;
}

export function resetSiteAccessForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = siteAccessStorePath();
  if (process.env.SITE_ACCESS_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(emptyFile(), null, 2) + "\n", "utf8");
  }
}

export function useMemorySiteAccess() {
  memoryOverride = emptyFile();
  hydrated = true;
  injectedAdapter = null;
}
