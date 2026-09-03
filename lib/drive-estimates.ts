import { createHash } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import {
  collapsePacksById,
  estimateFileName,
  parseIncomingPack,
  preferCanonicalPack,
  publicPack,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { applyHisIdentity, hisFileForPackId, hisKnownEstimateFiles, hisMatchForPack, NATHAN_DESK_EMAIL } from "./his-wood-river.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";

export type DriveFile = {
  id: string;
  name: string;
  properties?: Record<string, string>;
  modifiedTime?: string;
};

export type DriveAdapter = {
  configured: boolean;
  listJson(folderId: string): Promise<DriveFile[]>;
  /** JSON the account can already open, without listing a parent folder. */
  listAccessibleJson?(name?: string): Promise<DriveFile[]>;
  readJson(fileId: string): Promise<string>;
  createJson(
    folderId: string,
    name: string,
    content: string,
    properties: Record<string, string>,
  ): Promise<DriveFile>;
  updateJson(
    fileId: string,
    content: string,
    name?: string,
    properties?: Record<string, string>,
  ): Promise<DriveFile>;
  deleteJson(fileId: string): Promise<void>;
  /** True when the file bytes match what we just wrote. Never log content. */
  confirmWrite?(fileId: string, content: string): Promise<boolean>;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type OAuthClient = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type CachedToken = { value: string; exp: number };

let cachedSaToken: CachedToken | null = null;
const cachedOAuthTokens = new Map<string, CachedToken>();
/** Once OAuth refresh or a Drive call fails, stay on the service account for this isolate. */
let oauthDriveFailedOver = false;

/** Owner Estimates room. Live packs only. Never Workbooks / Nathan. */
export const ESTIMATES_ROOM_ID = "1y6Q3TOnpXzV-Y1oeqjjrHfSXt9hcIrgW";
const WORKBOOKS_ROOM_ID = "1OvNT1G9UR69hXjIeR1DpJLFZPIhoPhuQ";
const NATHAN_WORKBOOKS_ID = "1QtYnsIw_Os3nYKAdByS9V1mzsv2A6dWy";
const FORBIDDEN_ESTIMATE_FOLDERS = new Set([WORKBOOKS_ROOM_ID, NATHAN_WORKBOOKS_ID]);

export function resolveEstimatesFolder(folderId?: string) {
  const wanted = folderId || process.env.DRIVE_ESTIMATES_FOLDER_ID || ESTIMATES_ROOM_ID;
  return FORBIDDEN_ESTIMATE_FOLDERS.has(wanted) ? ESTIMATES_ROOM_ID : wanted;
}

export function estimatesFolderId() {
  return resolveEstimatesFolder();
}

export function parseServiceAccount(env: Record<string, string | undefined> = process.env): ServiceAccount | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
      if (parsed.client_email && parsed.private_key) {
        return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      try {
        const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccount>;
        if (parsed.client_email && parsed.private_key) {
          return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
        }
      } catch {
        return null;
      }
    }
  }
  const email = env.GOOGLE_CLIENT_EMAIL;
  const key = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (email && key) return { client_email: email, private_key: key };
  return null;
}

export function parseOAuthClient(env: Record<string, string | undefined> = process.env): OAuthClient | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || "";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export function driveConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(parseOAuthClient(env) || parseServiceAccount(env));
}

export function driveAuthKind(env: Record<string, string | undefined> = process.env) {
  if (parseOAuthClient(env)) return "oauth" as const;
  if (parseServiceAccount(env)) return "service-account" as const;
  return "unconfigured" as const;
}

export function driveStoreKind(env: Record<string, string | undefined> = process.env) {
  return driveConfigured(env) ? "drive" : "unconfigured";
}

export function resetDriveTokenCache() {
  cachedSaToken = null;
  cachedOAuthTokens.clear();
  oauthDriveFailedOver = false;
}

export function memoryDrive(): DriveAdapter & { files: Map<string, { file: DriveFile; content: string }> } {
  const files = new Map<string, { file: DriveFile; content: string }>();
  let n = 0;
  return {
    configured: true,
    files,
    async listJson() {
      return [...files.values()].map((row) => row.file);
    },
    async listAccessibleJson(name) {
      return [...files.values()].map((row) => row.file).filter((file) => !name || file.name === name);
    },
    async readJson(fileId) {
      const row = files.get(fileId);
      if (!row) throw new Error("missing");
      return row.content;
    },
    async createJson(_folderId, name, content, properties) {
      n += 1;
      const file: DriveFile = { id: `file-${n}`, name, properties };
      files.set(file.id, { file, content });
      return file;
    },
    async updateJson(fileId, content, name, properties) {
      const row = files.get(fileId);
      const file: DriveFile = {
        id: fileId,
        name: name || row?.file.name || fileId,
        properties: properties || row?.file.properties,
        modifiedTime: row?.file.modifiedTime,
      };
      files.set(fileId, { file, content });
      return file;
    },
    async deleteJson(fileId) {
      files.delete(fileId);
    },
    async confirmWrite(fileId, content) {
      return files.get(fileId)?.content === content;
    },
  };
}

function cachedTokenValue(row: CachedToken | undefined, now: number) {
  return row && row.exp - 60 > now ? row.value : null;
}

async function googleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const cached = cachedTokenValue(cachedSaToken ?? undefined, now);
  if (cached) return cached;
  const key = await importPKCS8(account.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth-2.0:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("token");
  cachedSaToken = { value: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  return cachedSaToken.value;
}

async function oauthAccessToken(client: OAuthClient) {
  const now = Math.floor(Date.now() / 1000);
  const cached = cachedTokenValue(cachedOAuthTokens.get(client.refreshToken), now);
  if (cached) return cached;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: client.refreshToken,
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("token");
  const next = { value: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  cachedOAuthTokens.set(client.refreshToken, next);
  return next.value;
}

function driveApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function driveApiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, "https://www.googleapis.com/");
  url.searchParams.set("supportsAllDrives", "true");
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function googleDriveAdapter(getAccessToken: () => Promise<string>): DriveAdapter {
  async function authHeaders(extra?: Record<string, string>) {
    const token = await getAccessToken();
    return { authorization: `Bearer ${token}`, ...extra };
  }

  async function listByQuery(q: string, opts?: { accessible?: boolean }) {
    const files: DriveFile[] = [];
    let pageToken = "";
    do {
      const params: Record<string, string> = {
        q,
        fields: "nextPageToken,files(id,name,properties,modifiedTime)",
        pageSize: "100",
        includeItemsFromAllDrives: "true",
      };
      if (opts?.accessible) {
        // Shared-with-me files live outside the SA My Drive. Do not set spaces=drive.
        params.corpora = "user";
      } else {
        params.spaces = "drive";
      }
      if (pageToken) params.pageToken = pageToken;
      const url = driveApiUrl("/drive/v3/files", params);
      const response = await fetch(url, { headers: await authHeaders() });
      const data = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string; error?: unknown };
      if (!response.ok) throw new Error(driveApiError(data, "list"));
      if (Array.isArray(data.files)) files.push(...data.files);
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    } while (pageToken);
    return files;
  }

  return {
    configured: true,
    async listJson(folderId) {
      return listByQuery(`'${escapeDriveQueryValue(folderId)}' in parents and trashed=false and mimeType='application/json'`);
    },
    async listAccessibleJson(name) {
      const named = name ? `name='${escapeDriveQueryValue(name)}' and ` : "";
      return listByQuery(`${named}trashed=false and mimeType='application/json'`, { accessible: true });
    },
    async readJson(fileId) {
      const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { alt: "media" }), {
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error("read");
      return response.text();
    },
    async createJson(folderId, name, content, properties) {
      const boundary = `hs_pack_${Date.now()}`;
      const meta = { name, parents: [folderId], mimeType: "application/json", properties };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const response = await fetch(driveApiUrl("/upload/drive/v3/files", { uploadType: "multipart" }), {
        method: "POST",
        headers: await authHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
        body,
      });
      const file = (await response.json()) as DriveFile & { error?: { message?: string } | string };
      if (!file.id) throw new Error(driveApiError(file, "create"));
      return { id: file.id, name: file.name || name, properties };
    },
    async updateJson(fileId, content, name, properties) {
      const upload = await fetch(driveApiUrl(`/upload/drive/v3/files/${fileId}`, { uploadType: "media" }), {
        method: "PATCH",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: content,
      });
      if (!upload.ok) {
        const payload = await upload.json().catch(() => null);
        throw new Error(driveApiError(payload, "update"));
      }
      if (name || properties) {
        await fetch(driveApiUrl(`/drive/v3/files/${fileId}`), {
          method: "PATCH",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name, properties }),
        });
      }
      return { id: fileId, name: name || fileId, properties };
    },
    async deleteJson(fileId) {
      const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`), {
        method: "PATCH",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ trashed: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(driveApiError(payload, "delete"));
      }
    },
    async confirmWrite(fileId, content) {
      return confirmDriveWrite(getAccessToken, fileId, content);
    },
  };
}

async function confirmDriveWrite(getAccessToken: () => Promise<string>, fileId: string, content: string) {
  try {
    const token = await getAccessToken();
    const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { fields: "id,md5Checksum" }), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { id?: string; md5Checksum?: string };
    if (!data.id) return false;
    if (!data.md5Checksum) return true;
    return data.md5Checksum.toLowerCase() === createHash("md5").update(content).digest("hex");
  } catch {
    return false;
  }
}

async function writeConfirmed(drive: DriveAdapter, fileId: string, content: string) {
  if (!drive.confirmWrite) return true;
  return drive.confirmWrite(fileId, content);
}

function unconfiguredDrive(): DriveAdapter {
  return {
    configured: false,
    async listJson() {
      return [];
    },
    async listAccessibleJson() {
      return [];
    },
    async readJson() {
      return "";
    },
    async createJson() {
      throw new Error("unconfigured");
    },
    async updateJson() {
      throw new Error("unconfigured");
    },
    async deleteJson() {
      throw new Error("unconfigured");
    },
  };
}

/** Thin Drive leftover. Never let this file overlay a richer Aromatics / CAT copy. */
export const THIN_DRIVE_STUB_IDS = new Set(["1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9"]);

export function isThinDriveStub(fileId?: string | null) {
  return Boolean(fileId && THIN_DRIVE_STUB_IDS.has(fileId));
}

function logOauthDriveFallback() {
  // Static text only — never tokens, client secrets, refresh tokens, or SA JSON.
  console.warn("drive: OAuth failed; falling back to service account");
}

function logVaultSaFallback() {
  console.warn("drive: service account vault write failed; trying OAuth");
}

function withServiceAccountFallback(primary: DriveAdapter, secondary: DriveAdapter): DriveAdapter {
  async function run<T>(op: (drive: DriveAdapter) => Promise<T>): Promise<T> {
    if (oauthDriveFailedOver) return op(secondary);
    try {
      return await op(primary);
    } catch {
      oauthDriveFailedOver = true;
      logOauthDriveFallback();
      return op(secondary);
    }
  }
  async function runWrite(
    fileId: string,
    content: string,
    op: (drive: DriveAdapter) => Promise<DriveFile>,
  ): Promise<DriveFile> {
    if (oauthDriveFailedOver) return op(secondary);
    try {
      const written = await op(primary);
      if (await writeConfirmed(primary, fileId, content)) return written;
      throw new Error("zombie");
    } catch {
      oauthDriveFailedOver = true;
      logOauthDriveFallback();
      return op(secondary);
    }
  }
  return {
    configured: true,
    listJson: (folderId) => run((drive) => drive.listJson(folderId)),
    listAccessibleJson: (name) =>
      run((drive) => (drive.listAccessibleJson ? drive.listAccessibleJson(name) : drive.listJson(""))),
    readJson: (fileId) => run((drive) => drive.readJson(fileId)),
    createJson: (folderId, name, content, properties) =>
      run((drive) => drive.createJson(folderId, name, content, properties)),
    updateJson: (fileId, content, name, properties) =>
      runWrite(fileId, content, (drive) => drive.updateJson(fileId, content, name, properties)),
    deleteJson: (fileId) => run((drive) => drive.deleteJson(fileId)),
  };
}

/** SA first for vault JSON. List 403 on the folder does not abandon SA for PATCH-by-id. */
function withVaultWritePreference(sa: DriveAdapter, oauth: DriveAdapter): DriveAdapter {
  async function preferSa<T>(op: (drive: DriveAdapter) => Promise<T>): Promise<T> {
    try {
      return await op(sa);
    } catch {
      return op(oauth);
    }
  }
  async function writePreferSa(
    fileId: string,
    content: string,
    op: (drive: DriveAdapter) => Promise<DriveFile>,
  ): Promise<DriveFile> {
    try {
      const written = await op(sa);
      if (await writeConfirmed(sa, fileId, content)) return written;
    } catch {
      // SA threw — try OAuth without abandoning later SA writes.
    }
    logVaultSaFallback();
    return op(oauth);
  }
  return {
    configured: true,
    listJson: (folderId) => preferSa((drive) => drive.listJson(folderId)),
    listAccessibleJson: (name) =>
      preferSa((drive) => (drive.listAccessibleJson ? drive.listAccessibleJson(name) : drive.listJson(""))),
    readJson: (fileId) => preferSa((drive) => drive.readJson(fileId)),
    createJson: async (folderId, name, content, properties) => {
      try {
        const written = await sa.createJson(folderId, name, content, properties);
        if (await writeConfirmed(sa, written.id, content)) return written;
      } catch {
        // SA cannot create in an owner-only folder — try OAuth.
      }
      logVaultSaFallback();
      return oauth.createJson(folderId, name, content, properties);
    },
    updateJson: (fileId, content, name, properties) =>
      writePreferSa(fileId, content, (drive) => drive.updateJson(fileId, content, name, properties)),
    deleteJson: (fileId) => preferSa((drive) => drive.deleteJson(fileId)),
  };
}

export function driveAdapter(env: Record<string, string | undefined> = process.env): DriveAdapter {
  const oauth = parseOAuthClient(env);
  const account = parseServiceAccount(env);
  if (oauth && account) {
    return withServiceAccountFallback(
      googleDriveAdapter(() => oauthAccessToken(oauth)),
      googleDriveAdapter(() => googleAccessToken(account)),
    );
  }
  if (oauth) return googleDriveAdapter(() => oauthAccessToken(oauth));
  if (account) return googleDriveAdapter(() => googleAccessToken(account));
  return unconfiguredDrive();
}

/** Vault JSON (seats.json) prefers the service account. Estimates keep OAuth-first. */
export function vaultDriveAdapter(env: Record<string, string | undefined> = process.env): DriveAdapter {
  const oauth = parseOAuthClient(env);
  const account = parseServiceAccount(env);
  if (account && oauth) {
    return withVaultWritePreference(
      googleDriveAdapter(() => googleAccessToken(account)),
      googleDriveAdapter(() => oauthAccessToken(oauth)),
    );
  }
  if (account) return googleDriveAdapter(() => googleAccessToken(account));
  if (oauth) return googleDriveAdapter(() => oauthAccessToken(oauth));
  return unconfiguredDrive();
}

function fileMatchesPack(file: DriveFile, packId: string, ownerEmail: string) {
  return file.properties?.packId === packId && file.properties?.ownerEmail === ownerEmail;
}

function packOwnerEmail(file: DriveFile, pack: EstimatePackSnapshot) {
  const raw = pack.ownerEmail || file.properties?.ownerEmail || "";
  return canonicalEmail(raw) || raw.trim().toLowerCase();
}

function reclaimListedPack(pack: EstimatePackSnapshot): EstimatePackSnapshot {
  const ownerEmail = canonicalEmail(pack.ownerEmail) || pack.ownerEmail;
  const sharedWith = Array.isArray(pack.sharedWith)
    ? pack.sharedWith.map((email) => canonicalEmail(email) || email)
    : pack.sharedWith;
  const next = publicPack({ ...pack, ownerEmail, sharedWith });
  return hisMatchForPack(next) ? publicPack(applyHisIdentity(next)) : next;
}

async function listedOrKnownFiles(adapter: DriveAdapter, folderId: string): Promise<DriveFile[]> {
  let files: DriveFile[] = [];
  try {
    files = await adapter.listJson(folderId);
  } catch {
    files = [];
  }
  const seen = new Set(files.map((file) => file.id));
  for (const known of hisKnownEstimateFiles()) {
    if (isThinDriveStub(known.fileId) || seen.has(known.fileId)) continue;
    files.push({ id: known.fileId, name: known.fileName, properties: known.packId ? { packId: known.packId } : undefined });
    seen.add(known.fileId);
  }
  return files;
}

function pickCanonicalMatch(matches: { file: DriveFile; pack: EstimatePackSnapshot }[]) {
  return matches.reduce((best, row) => (preferCanonicalPack(best.pack, row.pack) === row.pack ? row : best));
}

async function packFilesForId(adapter: DriveAdapter, folderId: string, packId: string) {
  const files = await listedOrKnownFiles(adapter, folderId);
  const known = hisFileForPackId(packId);
  if (known && !files.some((file) => file.id === known.fileId) && !isThinDriveStub(known.fileId)) {
    files.push({ id: known.fileId, name: known.fileName, properties: { packId } });
  }
  const tagged = files.filter((file) => file.properties?.packId === packId && !isThinDriveStub(file.id));
  const scan = tagged.length ? tagged : files.filter((file) => !isThinDriveStub(file.id));
  const matches: { file: DriveFile; pack: EstimatePackSnapshot }[] = [];
  for (const file of scan) {
    if (isThinDriveStub(file.id)) continue;
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok && parsed.pack.packId === packId) matches.push({ file, pack: parsed.pack });
    } catch {
      // skip unreadable rows
    }
  }
  return { files: files.filter((file) => !isThinDriveStub(file.id)), tagged, matches };
}

export async function findDrivePackFile(
  adapter: DriveAdapter,
  folderId: string,
  packId: string,
  ownerEmail: string,
) {
  const wanted = ownerEmail.trim().toLowerCase();
  const { files, matches } = await packFilesForId(adapter, folderId, packId);
  if (!matches.length) {
    return files.find((file) => fileMatchesPack(file, packId, ownerEmail)) ?? null;
  }
  const winner = pickCanonicalMatch(matches);
  const ownerMatches = matches.filter((row) => packOwnerEmail(row.file, row.pack) === wanted);
  if (!ownerMatches.length) return null;
  const ownerBest = pickCanonicalMatch(ownerMatches);
  if (preferCanonicalPack(ownerBest.pack, winner.pack) === winner.pack) return winner.file;
  return ownerBest.file;
}

export async function findDrivePackByPackId(adapter: DriveAdapter, folderId: string, packId: string) {
  const { tagged, matches } = await packFilesForId(adapter, folderId, packId);
  if (!matches.length) return tagged[0] ?? null;
  return pickCanonicalMatch(matches).file;
}

export async function readDrivePackById(
  adapter: DriveAdapter,
  packId: string,
  folderId = estimatesFolderId(),
) {
  const file = await findDrivePackByPackId(adapter, resolveEstimatesFolder(folderId), packId);
  if (!file) return null;
  const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
  return parsed.ok ? publicPack(parsed.pack) : null;
}

export async function deleteEstimateInDrive(
  adapter: DriveAdapter,
  packId: string,
  ownerEmail: string,
  folderId = estimatesFolderId(),
) {
  const target = resolveEstimatesFolder(folderId);
  const file = await findDrivePackFile(adapter, target, packId, ownerEmail);
  if (!file) return false;
  await adapter.deleteJson(file.id);
  return true;
}

function knownHisFile(packId: string): DriveFile | null {
  const known = hisFileForPackId(packId);
  if (!known || isThinDriveStub(known.fileId)) return null;
  return {
    id: known.fileId,
    name: known.fileName,
    properties: known.packId ? { packId: known.packId } : undefined,
  };
}

async function writePackFile(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  folderId: string,
  existing: DriveFile | null,
) {
  const ownerEmail = pack.ownerEmail.trim().toLowerCase();
  const payload = JSON.stringify(publicPack({ ...pack, ownerEmail }), null, 2);
  const properties = { packId: pack.packId, ownerEmail };
  const target =
    existing && !isThinDriveStub(existing.id) ? existing : knownHisFile(pack.packId);
  if (target) {
    const name = estimateFileName(pack);
    return adapter.updateJson(target.id, payload, name === target.name ? target.name : name, properties);
  }
  const taken = (await adapter.listJson(folderId)).map((file) => file.name);
  const name = estimateFileName(pack, taken);
  return adapter.createJson(folderId, name, payload, properties);
}

async function existingPackFile(
  adapter: DriveAdapter,
  folderId: string,
  packId: string,
  ownerEmail?: string,
) {
  try {
    const byId = await findDrivePackByPackId(adapter, folderId, packId);
    if (byId && !isThinDriveStub(byId.id)) return byId;
    if (ownerEmail) {
      const owned = await findDrivePackFile(adapter, folderId, packId, ownerEmail);
      if (owned && !isThinDriveStub(owned.id)) return owned;
    }
  } catch {
    // list/read failed — still pin known HIS files so share cannot mint a stub
  }
  return knownHisFile(packId);
}

export async function upsertEstimateInDrive(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  folderId = estimatesFolderId(),
) {
  const target = resolveEstimatesFolder(folderId);
  const ownerEmail = pack.ownerEmail.trim().toLowerCase();
  const byId = await existingPackFile(adapter, target, pack.packId, ownerEmail);
  if (byId) {
    let currentOwner = (byId.properties?.ownerEmail || "").trim().toLowerCase();
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(byId.id)));
      if (parsed.ok) currentOwner = parsed.pack.ownerEmail.trim().toLowerCase() || currentOwner;
    } catch {
      // keep tagged owner
    }
    const hisRestore =
      hisMatchForPack(pack) &&
      ownerEmail === NATHAN_DESK_EMAIL &&
      Boolean(currentOwner) &&
      currentOwner !== NATHAN_DESK_EMAIL &&
      !isOwnerIdentity(currentOwner);
    if (currentOwner && currentOwner !== ownerEmail && !hisRestore) {
      throw new Error("PACK_OWNED_ELSEWHERE");
    }
    return writePackFile(adapter, pack, target, byId);
  }
  return writePackFile(adapter, pack, target, null);
}

/** Same pack id, new owner — update the existing file so testers do not get a second copy. */
export async function overwriteEstimateInDrive(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  folderId = estimatesFolderId(),
) {
  const target = resolveEstimatesFolder(folderId);
  const existing = await existingPackFile(adapter, target, pack.packId, pack.ownerEmail.trim().toLowerCase());
  return writePackFile(adapter, pack, target, existing);
}

export async function listDrivePacks(adapter: DriveAdapter, folderId = estimatesFolderId()) {
  const files = await listedOrKnownFiles(adapter, resolveEstimatesFolder(folderId));
  const packs: EstimatePackSnapshot[] = [];
  for (const file of files) {
    if (isThinDriveStub(file.id)) continue;
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok) packs.push(reclaimListedPack(parsed.pack));
    } catch {
      // skip
    }
  }
  return collapsePacksById(packs);
}

export async function readDrivePack(
  adapter: DriveAdapter,
  packId: string,
  ownerEmail: string,
  folderId = estimatesFolderId(),
) {
  const file = await findDrivePackFile(adapter, resolveEstimatesFolder(folderId), packId, ownerEmail);
  if (!file) return null;
  const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
  return parsed.ok ? publicPack(parsed.pack) : null;
}
