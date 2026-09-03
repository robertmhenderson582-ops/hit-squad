import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { RATES_VAULT_KIND, RATES_VAULT_NAME, ratesFolderId, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import {
  WOOD_RIVER_THIRD_PARTY_RENTAL,
  blankThirdPartyRow,
  parseThirdPartyCatalog,
  type ThirdPartyRentalRow,
} from "./third-party-rental.ts";

type RatesFile = { catalog?: unknown };

let memoryOverride: ThirdPartyRentalRow[] | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function ratesStorePath(): string {
  if (process.env.RATES_STORE_PATH) return process.env.RATES_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-rates.json";
  return join(process.cwd(), "data", "rates.json");
}

export function ratesStoreKind() {
  return resolveAdapter() ? "drive" : "server-json-file";
}

export function seedThirdPartyCatalog(): ThirdPartyRentalRow[] {
  return WOOD_RIVER_THIRD_PARTY_RENTAL.map((row) => ({ ...row }));
}

function readCache(): ThirdPartyRentalRow[] {
  if (memoryOverride) return memoryOverride.map((row) => ({ ...row }));
  try {
    return parseThirdPartyCatalog(JSON.parse(readFileSync(ratesStorePath(), "utf8")) as RatesFile);
  } catch {
    return [];
  }
}

function writeCache(rows: ThirdPartyRentalRow[]) {
  const next = rows.map((row) => ({ ...row }));
  if (memoryOverride) {
    memoryOverride = next;
    return;
  }
  const path = ratesStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ catalog: next }, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.RATES_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(rows: ThirdPartyRentalRow[]) {
  writeCache(rows);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, RATES_VAULT_NAME, RATES_VAULT_KIND, { catalog: rows }, ratesFolderId());
}

export async function hydrateThirdPartyStore(): Promise<ThirdPartyRentalRow[]> {
  if (memoryOverride) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, RATES_VAULT_NAME, RATES_VAULT_KIND, ratesFolderId());
      if (raw != null) writeCache(parseThirdPartyCatalog(raw as RatesFile));
      else if (cache.length) await writeVaultJson(drive, RATES_VAULT_NAME, RATES_VAULT_KIND, { catalog: cache }, ratesFolderId());
    } catch {
      // Keep the local cache.
    }
  }
  hydrated = true;
  return listFromCache();
}

function listFromCache(): ThirdPartyRentalRow[] {
  const rows = readCache();
  return rows.length ? rows : seedThirdPartyCatalog();
}

export async function listThirdPartyCatalog(): Promise<ThirdPartyRentalRow[]> {
  return hydrateThirdPartyStore();
}

export async function saveThirdPartyCatalog(rows: ThirdPartyRentalRow[]): Promise<ThirdPartyRentalRow[]> {
  const catalog = parseThirdPartyCatalog(rows);
  await persist(catalog);
  return catalog;
}

export async function addThirdPartyRow(row?: Partial<ThirdPartyRentalRow>): Promise<ThirdPartyRentalRow[]> {
  const catalog = await listThirdPartyCatalog();
  const next = blankThirdPartyRow();
  if (typeof row?.description === "string" && row.description.trim()) next.description = row.description.trim();
  if (row && "daily" in row) next.daily = row.daily ?? null;
  if (row && "weekly" in row) next.weekly = row.weekly ?? null;
  if (row && "monthly" in row) next.monthly = row.monthly ?? null;
  if (typeof row?.freight === "number") next.freight = row.freight;
  catalog.push(next);
  return saveThirdPartyCatalog(catalog);
}

export async function deleteThirdPartyRow(index: number): Promise<ThirdPartyRentalRow[]> {
  const catalog = await listThirdPartyCatalog();
  if (index < 0 || index >= catalog.length) return catalog;
  catalog.splice(index, 1);
  return saveThirdPartyCatalog(catalog);
}

export function resetThirdPartyStoreForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = ratesStorePath();
  if (process.env.RATES_STORE_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ catalog: [] }, null, 2) + "\n", "utf8");
  }
}

export function forgetThirdPartyCacheForTests() {
  memoryOverride = null;
  hydrated = false;
  const path = ratesStorePath();
  if (existsSync(path)) unlinkSync(path);
}

export function useThirdPartyVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  memoryOverride = null;
}
