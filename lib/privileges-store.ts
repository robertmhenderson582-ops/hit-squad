import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PRIVILEGES_VAULT_KIND, PRIVILEGES_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { isPrivilegeId, normalizePrivileges, type PrivilegeId } from "./privileges.ts";
import { isRateVaultJamesEmail } from "./rate-vault.ts";
import { normalizeSeatDoors, type SeatDoorId } from "./vault-acl.ts";

export type PrivilegeFile = {
  grants: Record<string, PrivilegeId[]>;
  doors?: Record<string, SeatDoorId[]>;
};

let memoryOverride: PrivilegeFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function privilegeStorePath(): string {
  if (process.env.PRIVILEGE_STORE_PATH) return process.env.PRIVILEGE_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-privileges.json";
  return join(process.cwd(), "data", "privileges.json");
}

export function parsePrivilegeFile(raw: unknown): PrivilegeFile {
  const parsed = raw && typeof raw === "object" ? (raw as PrivilegeFile) : { grants: {} };
  const grants: Record<string, PrivilegeId[]> = {};
  for (const [email, list] of Object.entries(parsed.grants ?? {})) {
    const key = email.trim().toLowerCase();
    if (!key.includes("@")) continue;
    const next = normalizePrivileges(list);
    if (next.length) grants[key] = next;
  }
  const doors: Record<string, SeatDoorId[]> = {};
  for (const [email, list] of Object.entries(parsed.doors ?? {})) {
    const key = email.trim().toLowerCase();
    if (!key.includes("@")) continue;
    const next = normalizeSeatDoors(list);
    if (next.length) doors[key] = next;
  }
  return { grants, doors };
}

function emptyFile(): PrivilegeFile {
  return { grants: {}, doors: {} };
}

function hasDeskData(data: PrivilegeFile) {
  return Object.keys(data.grants).length > 0 || Object.keys(data.doors ?? {}).length > 0;
}

function readCache(): PrivilegeFile {
  if (memoryOverride) {
    return { grants: { ...memoryOverride.grants }, doors: { ...(memoryOverride.doors ?? {}) } };
  }
  try {
    return parsePrivilegeFile(JSON.parse(readFileSync(privilegeStorePath(), "utf8")));
  } catch {
    return emptyFile();
  }
}

function writeCache(data: PrivilegeFile) {
  if (memoryOverride) {
    memoryOverride = { grants: { ...data.grants }, doors: { ...(data.doors ?? {}) } };
    return;
  }
  const path = privilegeStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.PRIVILEGE_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(data: PrivilegeFile) {
  writeCache(data);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, PRIVILEGES_VAULT_NAME, PRIVILEGES_VAULT_KIND, data);
}

export async function hydratePrivilegeStore(): Promise<PrivilegeFile> {
  if (memoryOverride) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, PRIVILEGES_VAULT_NAME, PRIVILEGES_VAULT_KIND);
      const vault = parsePrivilegeFile(raw);
      if (hasDeskData(vault)) writeCache(vault);
      else if (hasDeskData(cache) && raw == null) {
        await writeVaultJson(drive, PRIVILEGES_VAULT_NAME, PRIVILEGES_VAULT_KIND, cache);
      } else if (raw != null) {
        writeCache(vault);
      }
    } catch {
      // Keep the local cache. A failed vault read must not wipe grants.
    }
  }
  hydrated = true;
  return readCache();
}

/** Local cache only. Session GET must not wait on Drive. */
export function peekPrivileges(email: string): PrivilegeId[] {
  const key = email.trim().toLowerCase();
  if (!key) return [];
  const grants = [...(readCache().grants[key] ?? [])];
  if (isRateVaultJamesEmail(key) && !grants.includes("rate-vault")) grants.push("rate-vault");
  return grants;
}

export async function privilegesFor(email: string): Promise<PrivilegeId[]> {
  const key = email.trim().toLowerCase();
  if (!key) return [];
  const data = await hydratePrivilegeStore();
  const grants = [...(data.grants[key] ?? [])];
  if (isRateVaultJamesEmail(key) && !grants.includes("rate-vault")) grants.push("rate-vault");
  return grants;
}

export async function listPrivilegeGrants(): Promise<Record<string, PrivilegeId[]>> {
  const data = await hydratePrivilegeStore();
  return { ...data.grants };
}

export async function setPrivileges(email: string, privileges: PrivilegeId[]): Promise<PrivilegeId[]> {
  const key = email.trim().toLowerCase();
  if (!key.includes("@")) return [];
  const data = await hydratePrivilegeStore();
  const next = [...new Set(privileges.filter(isPrivilegeId))];
  if (next.length) data.grants[key] = next;
  else delete data.grants[key];
  await persist(data);
  return next;
}

export async function grantPrivilege(email: string, privilege: PrivilegeId): Promise<PrivilegeId[]> {
  const current = await privilegesFor(email);
  if (current.includes(privilege)) return current;
  return setPrivileges(email, [...current, privilege]);
}

export async function revokePrivilege(email: string, privilege: PrivilegeId): Promise<PrivilegeId[]> {
  const current = await privilegesFor(email);
  return setPrivileges(
    email,
    current.filter((item) => item !== privilege),
  );
}

export function peekDoors(email: string): SeatDoorId[] {
  const key = email.trim().toLowerCase();
  if (!key) return [];
  return [...(readCache().doors?.[key] ?? [])];
}

export async function doorsFor(email: string): Promise<SeatDoorId[]> {
  const key = email.trim().toLowerCase();
  if (!key) return [];
  const data = await hydratePrivilegeStore();
  return [...(data.doors?.[key] ?? [])];
}

export async function setDoors(email: string, doors: SeatDoorId[]): Promise<SeatDoorId[]> {
  const key = email.trim().toLowerCase();
  if (!key.includes("@")) return [];
  const data = await hydratePrivilegeStore();
  const next = normalizeSeatDoors(doors);
  data.doors = { ...(data.doors ?? {}) };
  if (next.length) data.doors[key] = next;
  else delete data.doors[key];
  await persist(data);
  return next;
}

export async function listDoorGrants(): Promise<Record<string, SeatDoorId[]>> {
  const data = await hydratePrivilegeStore();
  return { ...(data.doors ?? {}) };
}

export function resetPrivilegesForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = privilegeStorePath();
  if (process.env.PRIVILEGE_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ grants: {} }, null, 2) + "\n", "utf8");
  }
}

export function forgetPrivilegeCacheForTests() {
  memoryOverride = null;
  hydrated = false;
  const path = privilegeStorePath();
  if (existsSync(path)) unlinkSync(path);
}

export function usePrivilegeVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  memoryOverride = null;
}

export function useMemoryPrivileges() {
  memoryOverride = { grants: {}, doors: {} };
  hydrated = true;
  injectedAdapter = null;
}
