import { SignJWT, importPKCS8 } from "jose";
import {
  collapsePacksById,
  estimateFileName,
  parseIncomingPack,
  preferCanonicalPack,
  publicPack,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";

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
      if (!row) throw new Error("missing");
      const file: DriveFile = {
        ...row.file,
        name: name || row.file.name,
        properties: properties || row.file.properties,
      };
      files.set(fileId, { file, content });
      return file;
    },
    async deleteJson(fileId) {
      files.delete(fileId);
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
  };
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

export function driveAdapter(env: Record<string, string | undefined> = process.env): DriveAdapter {
  const oauth = parseOAuthClient(env);
  if (oauth) return googleDriveAdapter(() => oauthAccessToken(oauth));
  const account = parseServiceAccount(env);
  if (account) return googleDriveAdapter(() => googleAccessToken(account));
  return unconfiguredDrive();
}

function fileMatchesPack(file: DriveFile, packId: string, ownerEmail: string) {
  return file.properties?.packId === packId && file.properties?.ownerEmail === ownerEmail;
}

function packOwnerEmail(file: DriveFile, pack: EstimatePackSnapshot) {
  return (pack.ownerEmail || file.properties?.ownerEmail || "").trim().toLowerCase();
}

function pickCanonicalMatch(matches: { file: DriveFile; pack: EstimatePackSnapshot }[]) {
  return matches.reduce((best, row) => (preferCanonicalPack(best.pack, row.pack) === row.pack ? row : best));
}

async function packFilesForId(adapter: DriveAdapter, folderId: string, packId: string) {
  const files = await adapter.listJson(folderId);
  const tagged = files.filter((file) => file.properties?.packId === packId);
  const scan = tagged.length ? tagged : files;
  const matches: { file: DriveFile; pack: EstimatePackSnapshot }[] = [];
  for (const file of scan) {
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok && parsed.pack.packId === packId) matches.push({ file, pack: parsed.pack });
    } catch {
      // skip unreadable rows
    }
  }
  return { files, tagged, matches };
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

async function writePackFile(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  folderId: string,
  existing: DriveFile | null,
) {
  const ownerEmail = pack.ownerEmail.trim().toLowerCase();
  const payload = JSON.stringify(publicPack({ ...pack, ownerEmail }), null, 2);
  const properties = { packId: pack.packId, ownerEmail };
  if (existing) {
    const name = estimateFileName(pack);
    return adapter.updateJson(existing.id, payload, name === existing.name ? existing.name : name, properties);
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
    if (byId) return byId;
    if (ownerEmail) return await findDrivePackFile(adapter, folderId, packId, ownerEmail);
    return null;
  } catch {
    return null;
  }
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
    if (currentOwner && currentOwner !== ownerEmail) {
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
  const files = await adapter.listJson(resolveEstimatesFolder(folderId));
  const packs: EstimatePackSnapshot[] = [];
  for (const file of files) {
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok) packs.push(publicPack(parsed.pack));
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
