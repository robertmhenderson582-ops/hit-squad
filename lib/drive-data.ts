import {
  ESTIMATES_ROOM_ID,
  DriveApiError,
  SEATS_SA_OPEN_ERROR,
  isSeatsOpenDenied,
  type DriveAdapter,
  type DriveFile,
} from "./drive-estimates.ts";

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

/** Production seats.json. Shared with the vault SA; the Estimates parent folder is not. */
export const SEATS_VAULT_FILE_ID = "1d3lzLDxCPwC963fdplsnwYgrDEanohZc";

const KNOWN_VAULT_FILE_IDS: Record<string, string> = {
  [SEATS_VAULT_NAME]: SEATS_VAULT_FILE_ID,
};

const rememberedVaultFileIds = new Map<string, string>();

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

function vaultFileKey(name: string, kind: string) {
  return `${kind}:${name}`;
}

function vaultEnvFileId(name: string, env: Record<string, string | undefined> = process.env) {
  const slug = name.replace(/\.json$/i, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return env[`DRIVE_${slug}_FILE_ID`]?.trim() || "";
}

export function rememberVaultFileId(name: string, kind: string, id: string) {
  if (id) rememberedVaultFileIds.set(vaultFileKey(name, kind), id);
}

export function resetVaultFileIdsForTests() {
  rememberedVaultFileIds.clear();
}

function pickNewestMatch(files: DriveFile[], name: string, kind: string) {
  const matches = files.filter((file) => matchesVaultFile(file, name, kind));
  if (!matches.length) return null;
  return (
    [...matches].sort((left, right) => (right.modifiedTime || "").localeCompare(left.modifiedTime || ""))[0] ??
    matches[0]
  );
}

async function listFolderJson(adapter: DriveAdapter, folderId: string) {
  try {
    return await adapter.listJson(folderId);
  } catch {
    return [];
  }
}

async function listAccessibleVaultJson(adapter: DriveAdapter, name: string) {
  if (!adapter.listAccessibleJson) return [];
  try {
    return await adapter.listAccessibleJson(name);
  } catch {
    return [];
  }
}

async function fileFromStoredId(adapter: DriveAdapter, name: string, kind: string) {
  const envId = vaultEnvFileId(name);
  const knownId = KNOWN_VAULT_FILE_IDS[name] || "";
  const id = rememberedVaultFileIds.get(vaultFileKey(name, kind)) || envId || knownId;
  if (!id) return null;
  // SEATS_VAULT_FILE_ID / DRIVE_SEATS_FILE_ID: PATCH by id even if GET media throws.
  // Never fall through to createJson in the unlistable Estimates folder.
  if (!(envId || knownId)) {
    try {
      await adapter.readJson(id);
    } catch {
      return null;
    }
  }
  rememberVaultFileId(name, kind, id);
  return { id, name, properties: { kind } };
}

export async function findVaultJsonFile(adapter: DriveAdapter, name: string, kind: string, folderId = dataFolderId()) {
  if (!adapter.configured) return null;
  const pinned = await fileFromStoredId(adapter, name, kind);
  // seats.json: always PATCH the known production id. A zombie OAuth list must not redirect writes.
  if (pinned && (KNOWN_VAULT_FILE_IDS[name] || vaultEnvFileId(name))) return pinned;
  const fromFolder = pickNewestMatch(await listFolderJson(adapter, folderId), name, kind);
  if (fromFolder) {
    rememberVaultFileId(name, kind, fromFolder.id);
    return fromFolder;
  }
  const fromAccessible = pickNewestMatch(await listAccessibleVaultJson(adapter, name), name, kind);
  if (fromAccessible) {
    rememberVaultFileId(name, kind, fromAccessible.id);
    return fromAccessible;
  }
  return pinned;
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

async function confirmedVaultBytes(adapter: DriveAdapter, fileId: string, payload: string) {
  if (!adapter.confirmWrite) return true;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await adapter.confirmWrite(fileId, payload)) return true;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
  }
  try {
    return (await adapter.readJson(fileId)) === payload;
  } catch {
    return false;
  }
}

async function probeSeatsFile(adapter: DriveAdapter, fileId: string) {
  if (!adapter.statFile) return null;
  try {
    await adapter.statFile(fileId);
    return null;
  } catch (error) {
    if (!isSeatsOpenDenied(error)) throw error;
    const status = error instanceof DriveApiError ? error.status : 403;
    const detail = error instanceof Error ? error.message : "stat";
    console.warn(`drive: service account cannot open seats.json; ${status} ${detail}`);
    return new DriveApiError(status, SEATS_SA_OPEN_ERROR, "service-account");
  }
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
  const pinnedId = KNOWN_VAULT_FILE_IDS[name] || vaultEnvFileId(name);
  const existing = await findVaultJsonFile(adapter, name, kind, folderId);
  // seats.json: never createJson. A folder 403 must not mint a second file.
  if (!existing && pinnedId) {
    throw new Error("vault file id not writable");
  }
  if (!existing && name === SEATS_VAULT_NAME) {
    throw new Error("seats vault must PATCH known id");
  }
  const seatsDenied =
    name === SEATS_VAULT_NAME && (existing?.id || pinnedId)
      ? await probeSeatsFile(adapter, existing?.id || pinnedId)
      : null;
  try {
    const written = existing
      ? await adapter.updateJson(existing.id, payload, name, properties)
      : await adapter.createJson(folderId, name, payload, properties);
    if (written?.id) rememberVaultFileId(name, kind, written.id);
    if (written?.id && !(await confirmedVaultBytes(adapter, written.id, payload))) {
      throw seatsDenied || new Error("vault write not confirmed");
    }
    return written;
  } catch (error) {
    if (seatsDenied) throw seatsDenied;
    throw error;
  }
}
