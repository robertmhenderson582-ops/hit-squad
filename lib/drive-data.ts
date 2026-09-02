import { ESTIMATES_ROOM_ID, type DriveAdapter, type DriveFile } from "./drive-estimates.ts";

export const COMPANIES_VAULT_NAME = "companies.json";
export const ACTIVITY_VAULT_NAME = "activity.json";
export const TICKETS_VAULT_NAME = "tickets.json";
export const SEATS_VAULT_NAME = "seats.json";
export const SETTINGS_VAULT_NAME = "settings.json";
export const INBOX_VAULT_NAME = "inbox.json";
export const RATES_VAULT_NAME = "rates.json";
export const QUALITY_BRIEFS_VAULT_NAME = "quality-briefs.json";
export const HSE_BRIEFS_VAULT_NAME = "hse-briefs.json";
export const COMPANIES_VAULT_KIND = "companies";
export const ACTIVITY_VAULT_KIND = "activity";
export const TICKETS_VAULT_KIND = "tickets";
export const SEATS_VAULT_KIND = "seats";
export const SETTINGS_VAULT_KIND = "settings";
export const INBOX_VAULT_KIND = "inbox";
export const RATES_VAULT_KIND = "rates";
export const QUALITY_BRIEFS_VAULT_KIND = "quality-briefs";
export const HSE_BRIEFS_VAULT_KIND = "hse-briefs";

export const DRIVE_WRITE_ERROR = "Could not save. Try again.";

export function briefsVault(kind: "quality" | "hse") {
  return kind === "hse"
    ? { name: HSE_BRIEFS_VAULT_NAME, kind: HSE_BRIEFS_VAULT_KIND }
    : { name: QUALITY_BRIEFS_VAULT_NAME, kind: QUALITY_BRIEFS_VAULT_KIND };
}

/** Owner Data room when set. Estimates room is the writable fallback already shared with the desk. */
export function dataFolderId(env: Record<string, string | undefined> = process.env) {
  return env.DRIVE_DATA_FOLDER_ID || env.DRIVE_ESTIMATES_FOLDER_ID || ESTIMATES_ROOM_ID;
}

/** Rates room when set. Otherwise the same Data / Estimates room as companies and tickets. */
export function ratesFolderId(env: Record<string, string | undefined> = process.env) {
  return env.DRIVE_RATES_FOLDER_ID || dataFolderId(env);
}

function matchesVaultFile(file: DriveFile, name: string, kind: string) {
  return file.properties?.kind === kind || file.name === name;
}

export async function findVaultJsonFile(adapter: DriveAdapter, name: string, kind: string, folderId = dataFolderId()) {
  if (!adapter.configured) return null;
  const files = await adapter.listJson(folderId);
  const matches = files.filter((file) => matchesVaultFile(file, name, kind));
  if (!matches.length) return null;
  return (
    [...matches].sort((left, right) => (right.modifiedTime || "").localeCompare(left.modifiedTime || ""))[0] ??
    matches[0]
  );
}

export async function readVaultJson<T>(
  adapter: DriveAdapter,
  name: string,
  kind: string,
  folderId = dataFolderId(),
): Promise<T | null> {
  const file = await findVaultJsonFile(adapter, name, kind, folderId);
  if (!file) return null;
  return JSON.parse(await adapter.readJson(file.id)) as T;
}

export async function writeVaultJson(
  adapter: DriveAdapter,
  name: string,
  kind: string,
  data: unknown,
  folderId = dataFolderId(),
) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const properties = { kind };
  const existing = await findVaultJsonFile(adapter, name, kind, folderId);
  if (existing) return adapter.updateJson(existing.id, payload, name, properties);
  return adapter.createJson(folderId, name, payload, properties);
}
