import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ONBOARD_PEOPLE_VAULT_KIND, ONBOARD_PEOPLE_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import {
  ONBOARD_VAULT_WRITE_ERROR,
  parseOnboardFile,
  type ManpowerRequest,
  type OnboardFile,
  type OnboardPerson,
} from "./onboard-pipeline.ts";

export { ONBOARD_VAULT_WRITE_ERROR };

let memoryOverride: OnboardFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;
let lastStore: "drive" | "server-json-file" | "memory" | "none" = "none";
let lastStored = false;
let lastError: string | null = null;

export function onboardStorePath(): string {
  if (process.env.ONBOARD_STORE_PATH) return process.env.ONBOARD_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-onboard-people.json";
  return join(process.cwd(), "data", "onboard-people.json");
}

export function onboardStoreKind() {
  if (memoryOverride) return "memory";
  if (resolveAdapter()) return "drive";
  if (process.env.ONBOARD_STORE_PATH || !process.env.VERCEL) return "server-json-file";
  return "none";
}

export function onboardStored(kind = lastStore || onboardStoreKind()) {
  return kind === "drive" || kind === "server-json-file" || kind === "memory";
}

export function onboardStoreStatus() {
  return { store: lastStore || onboardStoreKind(), stored: lastStored || onboardStored(), error: lastError };
}

function emptyFile(): OnboardFile {
  return { people: [], requests: [] };
}

function cloneFile(data: OnboardFile): OnboardFile {
  return {
    people: data.people.map((row) => ({ ...row, events: [...row.events] })),
    requests: data.requests.map((row) => ({ ...row, events: [...row.events] })),
  };
}

function readCache(): OnboardFile {
  if (memoryOverride) {
    return cloneFile(memoryOverride);
  }
  try {
    return parseOnboardFile(JSON.parse(readFileSync(onboardStorePath(), "utf8")));
  } catch {
    return emptyFile();
  }
}

function writeCache(data: OnboardFile) {
  if (memoryOverride) {
    memoryOverride = cloneFile(data);
    lastStore = "memory";
    lastStored = true;
    return;
  }
  const path = onboardStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  lastStore = "server-json-file";
  lastStored = true;
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.ONBOARD_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(data: OnboardFile) {
  writeCache(data);
  const drive = resolveAdapter();
  if (!drive) {
    lastError = null;
    return;
  }
  try {
    await writeVaultJson(drive, ONBOARD_PEOPLE_VAULT_NAME, ONBOARD_PEOPLE_VAULT_KIND, data);
    lastStore = "drive";
    lastStored = true;
    lastError = null;
  } catch {
    lastStore = "drive";
    lastStored = false;
    lastError = ONBOARD_VAULT_WRITE_ERROR;
  }
}

export async function hydrateOnboardStore(): Promise<OnboardFile> {
  if (memoryOverride) {
    lastStore = "memory";
    lastStored = true;
    lastError = null;
    return readCache();
  }
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, ONBOARD_PEOPLE_VAULT_NAME, ONBOARD_PEOPLE_VAULT_KIND);
      const vault = parseOnboardFile(raw);
      if (vault.people.length || vault.requests.length) writeCache(vault);
      else if ((cache.people.length || cache.requests.length) && raw == null) {
        await persist(cache);
        return readCache();
      } else if (raw != null) {
        writeCache(vault);
      }
      lastStore = "drive";
      lastStored = true;
      lastError = null;
    } catch {
      lastStore = "drive";
      lastStored = cache.people.length > 0 || existsSync(onboardStorePath());
      lastError = ONBOARD_VAULT_WRITE_ERROR;
      return cache;
    }
  }
  hydrated = true;
  return readCache();
}

export async function listOnboardPeople(): Promise<OnboardPerson[]> {
  const data = await hydrateOnboardStore();
  return [...data.people].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getOnboardPerson(id: string): Promise<OnboardPerson | null> {
  const data = await hydrateOnboardStore();
  return data.people.find((row) => row.id === id) ?? null;
}

export async function upsertOnboardPerson(person: OnboardPerson): Promise<OnboardPerson> {
  if (!hydrated && !memoryOverride) await hydrateOnboardStore();
  const data = readCache();
  const next = data.people.filter((row) => row.id !== person.id);
  next.push(person);
  await persist({ people: next, requests: data.requests });
  return person;
}

export async function listOnboardRequests(): Promise<ManpowerRequest[]> {
  const data = await hydrateOnboardStore();
  return [...data.requests].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getOnboardRequest(id: string): Promise<ManpowerRequest | null> {
  const data = await hydrateOnboardStore();
  return data.requests.find((row) => row.id === id) ?? null;
}

export async function upsertOnboardRequest(request: ManpowerRequest): Promise<ManpowerRequest> {
  if (!hydrated && !memoryOverride) await hydrateOnboardStore();
  const data = readCache();
  const next = data.requests.filter((row) => row.id !== request.id);
  next.push(request);
  await persist({ people: data.people, requests: next });
  return request;
}

export function resetOnboardForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  lastStore = "none";
  lastStored = false;
  lastError = null;
  const path = onboardStorePath();
  if (process.env.ONBOARD_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(emptyFile(), null, 2) + "\n", "utf8");
  }
}

export function useMemoryOnboard(seed: OnboardFile = emptyFile()) {
  memoryOverride = cloneFile({ people: seed.people, requests: seed.requests ?? [] });
  hydrated = true;
  injectedAdapter = null;
  lastStore = "memory";
  lastStored = true;
  lastError = null;
}

export function useOnboardAdapter(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
}
