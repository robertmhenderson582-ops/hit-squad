import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ONBOARD_PEOPLE_VAULT_KIND, ONBOARD_PEOPLE_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import {
  DEFAULT_ONBOARD_SETTINGS,
  ONBOARD_VAULT_WRITE_ERROR,
  mergeOnboardHalls,
  parseOnboardFile,
  parseOnboardHallList,
  parseOnboardSettings,
  seedOnboardHalls,
  setRuntimeOnboardHalls,
  type ManpowerRequest,
  type OnboardFile,
  type OnboardHall,
  type OnboardPerson,
  type OnboardSettings,
} from "./onboard-pipeline.ts";

export { ONBOARD_VAULT_WRITE_ERROR };

let memoryOverride: OnboardFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;
let lastStore: "drive" | "server-json-file" | "memory" | "none" = "none";
let lastStored = false;
let lastError: string | null = null;

/** Vault JSON may include `ssn` (RESTRICTED PII, digits-only 9-digit SSN) and derived `ssnLast4`. Access is gated in the pipeline, not here. */
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
  return {
    people: [],
    requests: [],
    settings: { ...DEFAULT_ONBOARD_SETTINGS, corporateEmails: [], pmEmails: [] },
    halls: seedOnboardHalls(),
  };
}

function cloneSettings(settings: OnboardSettings): OnboardSettings {
  return {
    step1Submitter: settings.step1Submitter === "hall" ? "hall" : "site",
    corporateEmails: [...settings.corporateEmails],
    pmEmails: [...settings.pmEmails],
  };
}

function cloneHalls(halls?: OnboardHall[] | null): OnboardHall[] {
  return mergeOnboardHalls(seedOnboardHalls(), halls).map((row) => ({ ...row }));
}

function cloneFile(data: OnboardFile): OnboardFile {
  return {
    people: data.people.map((row) => ({ ...row, events: [...row.events] })),
    requests: data.requests.map((row) => ({ ...row, events: [...row.events] })),
    settings: cloneSettings(data.settings ?? DEFAULT_ONBOARD_SETTINGS),
    halls: cloneHalls(data.halls),
  };
}

function fileFrom(data: OnboardFile, patch: Partial<OnboardFile> = {}): OnboardFile {
  return {
    people: patch.people ?? data.people,
    requests: patch.requests ?? data.requests,
    settings: patch.settings ?? data.settings ?? DEFAULT_ONBOARD_SETTINGS,
    halls: cloneHalls(patch.halls ?? data.halls),
  };
}

function attachRuntime(data: OnboardFile): OnboardFile {
  const next = cloneFile(data);
  setRuntimeOnboardHalls(next.halls);
  return next;
}

function readCache(): OnboardFile {
  if (memoryOverride) {
    return attachRuntime(memoryOverride);
  }
  try {
    return attachRuntime(parseOnboardFile(JSON.parse(readFileSync(onboardStorePath(), "utf8"))));
  } catch {
    return attachRuntime(emptyFile());
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
  const next = attachRuntime(data);
  writeCache(next);
  const drive = resolveAdapter();
  if (!drive) {
    lastError = null;
    return;
  }
  try {
    await writeVaultJson(drive, ONBOARD_PEOPLE_VAULT_NAME, ONBOARD_PEOPLE_VAULT_KIND, next);
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
      const incomingHalls = raw && typeof raw === "object" ? parseOnboardHallList((raw as { halls?: unknown }).halls) : [];
      const vault = attachRuntime(parseOnboardFile(raw));
      if (raw == null && (cache.people.length || cache.requests.length || cache.halls.length)) {
        await persist(fileFrom(cache));
        return readCache();
      }
      if (raw != null && incomingHalls.length === 0) {
        await persist(fileFrom(vault));
        return readCache();
      }
      if (vault.people.length || vault.requests.length || vault.halls.length) writeCache(vault);
      else if (raw != null) {
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
  await persist(fileFrom(data, { people: next }));
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
  await persist(fileFrom(data, { requests: next }));
  return request;
}

export async function getOnboardSettings(): Promise<OnboardSettings> {
  const data = await hydrateOnboardStore();
  return cloneSettings(data.settings ?? DEFAULT_ONBOARD_SETTINGS);
}

export async function saveOnboardSettings(settings: OnboardSettings): Promise<OnboardSettings> {
  if (!hydrated && !memoryOverride) await hydrateOnboardStore();
  const data = readCache();
  const next = parseOnboardSettings(settings);
  await persist(fileFrom(data, { settings: next }));
  return next;
}

export async function listOnboardHalls(): Promise<OnboardHall[]> {
  const data = await hydrateOnboardStore();
  return cloneHalls(data.halls);
}

export async function saveOnboardHall(hall: OnboardHall): Promise<OnboardHall> {
  if (!hydrated && !memoryOverride) await hydrateOnboardStore();
  const data = readCache();
  const halls = mergeOnboardHalls(seedOnboardHalls(), data.halls, [hall]);
  await persist(fileFrom(data, { halls }));
  return hall;
}

export function resetOnboardForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  lastStore = "none";
  lastStored = false;
  lastError = null;
  setRuntimeOnboardHalls(null);
  const path = onboardStorePath();
  if (process.env.ONBOARD_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(emptyFile(), null, 2) + "\n", "utf8");
  }
}

export function useMemoryOnboard(seed: Partial<OnboardFile> = {}) {
  memoryOverride = cloneFile({
    people: seed.people ?? [],
    requests: seed.requests ?? [],
    settings: parseOnboardSettings(seed.settings ?? DEFAULT_ONBOARD_SETTINGS),
    halls: seed.halls ?? seedOnboardHalls(),
  });
  setRuntimeOnboardHalls(memoryOverride.halls);
  hydrated = true;
  injectedAdapter = null;
  lastStore = "memory";
  lastStored = true;
  lastError = null;
}

export function useOnboardAdapter(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
}
