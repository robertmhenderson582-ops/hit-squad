import { createHash } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import {
  collapsePacksById,
  estimateFileName,
  packClockIsSeedSmashed,
  parseIncomingPack,
  preferCanonicalPack,
  publicPack,
  restorePackClock,
  scheduleHasWork,
  crewHasCustomClock,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { packBaselineMoneyWriteError, packBaselineWriteException } from "./family-a-vault-write.ts";
import { decidePackWrite, integrityErrorMessage } from "./pack-integrity.ts";
import { isSandboxEstimateOwner } from "./estimate-isolation.ts";
import {
  applyHisIdentity,
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_FREEZE_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_AROMATICS_STUB_ID,
  HIS_TM_FILE_ID,
  hisFileByDriveId,
  hisFileForPackId,
  hisKnownEstimateFiles,
  hisMatchForPack,
  NATHAN_DESK_EMAIL,
} from "./his-wood-river.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

export type DriveFile = {
  id: string;
  name: string;
  properties?: Record<string, string>;
  modifiedTime?: string;
  mimeType?: string;
  parents?: string[];
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

/** Drive folder names. Em-dash / smart-quote labels from the job tree must not 400 files.create. */
export function driveFolderName(name: string) {
  const cleaned = name
    .replace(/[\\/]+/g, " - ")
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "folder";
}

export function sameDriveFolderName(left: string, right: string) {
  return driveFolderName(left) === driveFolderName(right);
}

/** Real folder id. Follows a shortcut-to-folder. Never treats missing mimeType as a folder. */
export function writableDriveFolderId(row?: Pick<DriveFile, "id" | "mimeType" | "shortcutDetails"> | null) {
  if (!row?.id) return null;
  if (row.mimeType === DRIVE_FOLDER_MIME) return row.id;
  if (row.mimeType === DRIVE_SHORTCUT_MIME) {
    const target = (row.shortcutDetails?.targetId || "").trim();
    const targetMime = row.shortcutDetails?.targetMimeType;
    if (target && (!targetMime || targetMime === DRIVE_FOLDER_MIME)) return target;
  }
  return null;
}

export function isDriveFolderRow(row?: Pick<DriveFile, "id" | "name" | "mimeType" | "shortcutDetails"> | null) {
  return Boolean(row?.id && row.name && writableDriveFolderId(row));
}

export type DriveAdapter = {
  configured: boolean;
  listJson(folderId: string): Promise<DriveFile[]>;
  /** JSON the account can already open, without listing a parent folder. */
  listAccessibleJson?(name?: string): Promise<DriveFile[]>;
  /** Metadata GET. Used to probe seats.json before PATCH. Never logs content. */
  statFile?(fileId: string): Promise<DriveFile>;
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
  listChildren?(folderId: string): Promise<DriveFile[]>;
  createFolder?(parentId: string, name: string): Promise<DriveFile>;
  uploadBytes?(
    folderId: string,
    name: string,
    bytes: Uint8Array,
    mimeType: string,
    properties?: Record<string, string>,
  ): Promise<DriveFile>;
  updateBytes?(fileId: string, bytes: Uint8Array, mimeType?: string): Promise<DriveFile>;
  readBytes?(fileId: string): Promise<Uint8Array>;
  /** Share a Drive file/folder with a person. Never sends a Drive notification. */
  shareWithEmail?(
    fileId: string,
    email: string,
    role?: "writer" | "reader",
  ): Promise<{ ok: boolean; already?: boolean }>;
};

export const SEATS_SA_OPEN_ERROR = "service account cannot open seats.json";

export class DriveApiError extends Error {
  readonly status: number;
  principal?: "service-account" | "oauth";
  constructor(status: number, message: string, principal?: "service-account" | "oauth") {
    super(sanitizeDriveMessage(message));
    this.name = "DriveApiError";
    this.status = status;
    this.principal = principal;
  }
}

function sanitizeDriveMessage(message: string) {
  return message
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[token]")
    .replace(/-----BEGIN[\s\S]+?-----END[^-]+-----/g, "[key]")
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export type DriveFailureKind = "quota" | "oauth" | "folder" | "share" | "missing" | "generic";

function driveErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isOauthInvalidGrant(error: unknown) {
  return /invalid_grant|expired or revoked/i.test(driveErrorText(error));
}

export function isDriveQuotaError(error: unknown) {
  const text = driveErrorText(error);
  const status = error instanceof DriveApiError ? error.status : 0;
  return (status === 403 || /\b403\b/.test(text)) && /quota|units per minute|query cost/i.test(text);
}

export function isDriveFolderParentError(error: unknown) {
  const text = driveErrorText(error);
  const status = error instanceof DriveApiError ? error.status : 0;
  return (status === 400 || /\b400\b/.test(text)) && /not a folder|specified parent/i.test(text);
}

/** Ops-facing class. Never include SA email, tokens, or Drive ids in the return value. */
export function driveFailureKind(error: unknown): DriveFailureKind {
  if (isOauthInvalidGrant(error)) return "oauth";
  if (isDriveQuotaError(error)) return "quota";
  if (isDriveFolderParentError(error)) return "folder";
  const status = error instanceof DriveApiError ? error.status : 0;
  const text = driveErrorText(error);
  if (status === 403 || /\b403\b/.test(text)) return "share";
  if (status === 404 || /\b404\b/.test(text)) return "missing";
  return "generic";
}

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
/** Refresh token is dead. Do not retry OAuth — each attempt multiplies SA quota burn. */
let oauthInvalidGrant = false;

type DriveListMode = "drive" | "user" | "allDrives";
const LIST_CHILDREN_TTL_MS = 20_000;
const EMPTY_LIST_CHILDREN_TTL_MS = 4_000;
const LIST_QUERY_TTL_MS = 15_000;
const RESOLVED_FOLDER_TTL_MS = 60_000;
/** Last corpora that actually returned children. Happy-path reads reuse this only. */
let listChildrenModeHint: DriveListMode | null = null;
const listChildrenCache = new Map<string, { at: number; files: DriveFile[] }>();
const listChildrenInflight = new Map<string, Promise<DriveFile[]>>();
const listQueryCache = new Map<string, { at: number; files: DriveFile[] }>();
const resolvedFolderParents = new Map<string, { at: number; id: string }>();

function driveListModeOpts(mode: DriveListMode) {
  if (mode === "allDrives") return { allDrives: true as const };
  if (mode === "user") return { accessible: true as const };
  return undefined;
}

function rememberWritableFolder(folderId: string) {
  const id = folderId.trim();
  if (id) resolvedFolderParents.set(id, { at: Date.now(), id });
}

function invalidateDriveListCache(folderId?: string) {
  if (!folderId) {
    listChildrenCache.clear();
    listQueryCache.clear();
    return;
  }
  listChildrenCache.delete(folderId);
  listQueryCache.clear();
}

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
  oauthInvalidGrant = false;
  listChildrenModeHint = null;
  listChildrenCache.clear();
  listChildrenInflight.clear();
  listQueryCache.clear();
  resolvedFolderParents.clear();
}

export function memoryDrive(): DriveAdapter & {
  files: Map<string, { file: DriveFile; content: string }>;
  tree: Map<string, { file: DriveFile; bytes: Uint8Array }>;
  shares: Map<string, Array<{ email: string; role: string }>>;
} {
  const files = new Map<string, { file: DriveFile; content: string }>();
  const tree = new Map<string, { file: DriveFile; bytes: Uint8Array }>();
  const shares = new Map<string, Array<{ email: string; role: string }>>();
  let n = 0;

  function putTree(file: DriveFile, bytes = new Uint8Array()) {
    tree.set(file.id, { file, bytes });
    return file;
  }

  return {
    configured: true,
    files,
    tree,
    shares,
    async listJson() {
      return [...files.values()].map((row) => row.file);
    },
    async listAccessibleJson(name) {
      return [...files.values()].map((row) => row.file).filter((file) => !name || file.name === name);
    },
    async statFile(fileId) {
      const row = files.get(fileId) || tree.get(fileId);
      if (!row) throw new DriveApiError(404, "not found");
      return row.file;
    },
    async readJson(fileId) {
      const row = files.get(fileId);
      if (!row) throw new Error("missing");
      return row.content;
    },
    async createJson(folderId, name, content, properties) {
      n += 1;
      const file: DriveFile = {
        id: `file-${n}`,
        name,
        properties,
        mimeType: "application/json",
        parents: folderId ? [folderId] : undefined,
      };
      files.set(file.id, { file, content });
      putTree(file, new TextEncoder().encode(content));
      return file;
    },
    async updateJson(fileId, content, name, properties) {
      const row = files.get(fileId);
      const file: DriveFile = {
        id: fileId,
        name: name || row?.file.name || fileId,
        properties: properties || row?.file.properties,
        modifiedTime: new Date().toISOString(),
        mimeType: row?.file.mimeType || "application/json",
        parents: row?.file.parents,
      };
      files.set(file.id, { file, content });
      putTree(file, new TextEncoder().encode(content));
      return file;
    },
    async deleteJson(fileId) {
      files.delete(fileId);
      tree.delete(fileId);
    },
    async confirmWrite(fileId, content) {
      return files.get(fileId)?.content === content;
    },
    async listChildren(folderId) {
      const resolved = writableDriveFolderId(tree.get(folderId)?.file) || folderId;
      return [...tree.values()]
        .map((row) => row.file)
        .filter((file) => file.parents?.includes(resolved) || file.parents?.includes(folderId))
        .map((file) => {
          const target = writableDriveFolderId(file);
          return target && target !== file.id ? { ...file, id: target, mimeType: DRIVE_FOLDER_MIME } : file;
        });
    },
    async createFolder(parentId, name) {
      const parent = tree.get(parentId)?.file;
      const resolved = writableDriveFolderId(parent) || parentId;
      if (parent && parent.mimeType && !writableDriveFolderId(parent)) {
        throw new DriveApiError(400, "400 The specified parent is not a folder.");
      }
      const existing = [...tree.values()].find(
        (row) =>
          (row.file.parents?.includes(resolved) || row.file.parents?.includes(parentId)) &&
          sameDriveFolderName(row.file.name, name) &&
          writableDriveFolderId(row.file),
      );
      if (existing) {
        const id = writableDriveFolderId(existing.file) || existing.file.id;
        return { ...existing.file, id, mimeType: DRIVE_FOLDER_MIME, parents: [resolved] };
      }
      n += 1;
      return putTree({
        id: `folder-${n}`,
        name: driveFolderName(name),
        mimeType: DRIVE_FOLDER_MIME,
        parents: [resolved],
      });
    },
    async uploadBytes(folderId, name, bytes, mimeType, properties) {
      n += 1;
      const copy = new Uint8Array(bytes);
      return putTree(
        {
          id: `bin-${n}`,
          name,
          mimeType,
          parents: [folderId],
          properties,
        },
        copy,
      );
    },
    async updateBytes(fileId, bytes, mimeType) {
      const row = tree.get(fileId);
      if (!row) throw new Error("missing");
      const file: DriveFile = {
        ...row.file,
        mimeType: mimeType || row.file.mimeType,
        modifiedTime: new Date().toISOString(),
      };
      return putTree(file, new Uint8Array(bytes));
    },
    async readBytes(fileId) {
      const row = tree.get(fileId);
      if (!row) throw new Error("missing");
      return row.bytes;
    },
    async shareWithEmail(fileId, email, role = "writer") {
      const key = email.trim().toLowerCase();
      const current = shares.get(fileId) ?? [];
      if (current.some((row) => row.email === key)) return { ok: true, already: true };
      current.push({ email: key, role });
      shares.set(fileId, current);
      return { ok: true };
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
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: unknown };
  if (!response.ok || !data.access_token) {
    throw new DriveApiError(response.status || 401, driveApiError(data, "token"), "service-account");
  }
  cachedSaToken = { value: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  return cachedSaToken.value;
}

async function oauthAccessToken(client: OAuthClient) {
  if (oauthInvalidGrant) {
    throw new DriveApiError(400, "invalid_grant", "oauth");
  }
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
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: unknown };
  if (!response.ok || !data.access_token) {
    const message = driveApiError(data, "token");
    if (isOauthInvalidGrant(message) || /invalid_grant/i.test(message)) {
      oauthInvalidGrant = true;
      oauthDriveFailedOver = true;
      cachedOAuthTokens.delete(client.refreshToken);
    }
    throw new DriveApiError(response.status || 401, message, "oauth");
  }
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

function driveHttpError(status: number, payload: unknown, fallback: string, principal?: "service-account" | "oauth") {
  return new DriveApiError(status, `${status} ${driveApiError(payload, fallback)}`, principal);
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

  async function listByQuery(q: string, opts?: { accessible?: boolean; allDrives?: boolean; fresh?: boolean }) {
    const mode: DriveListMode = opts?.allDrives ? "allDrives" : opts?.accessible ? "user" : "drive";
    const cacheKey = `${mode}|${q}`;
    if (!opts?.fresh) {
      const cached = listQueryCache.get(cacheKey);
      if (cached && Date.now() - cached.at <= LIST_QUERY_TTL_MS) return cached.files;
    }
    const files: DriveFile[] = [];
    let pageToken = "";
    do {
      const params: Record<string, string> = {
        q,
        fields: "nextPageToken,files(id,name,mimeType,parents,properties,modifiedTime,shortcutDetails)",
        pageSize: "100",
        includeItemsFromAllDrives: "true",
      };
      if (opts?.allDrives) {
        // Shared Quality / HSE rooms: spaces=drive misses Team Drive children (empty or 400).
        params.corpora = "allDrives";
      } else if (opts?.accessible) {
        // Shared-with-me files live outside the SA My Drive. Do not set spaces=drive.
        params.corpora = "user";
      } else {
        params.spaces = "drive";
      }
      if (pageToken) params.pageToken = pageToken;
      const url = driveApiUrl("/drive/v3/files", params);
      const response = await fetch(url, { headers: await authHeaders() });
      const data = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string; error?: unknown };
      if (!response.ok) throw driveHttpError(response.status, data, "list");
      if (Array.isArray(data.files)) files.push(...data.files);
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    } while (pageToken);
    listQueryCache.set(cacheKey, { at: Date.now(), files });
    return files;
  }

  async function getFileMetadata(fileId: string, fields: string) {
    const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { fields }), {
      headers: await authHeaders(),
    });
    const data = (await response.json().catch(() => null)) as (DriveFile & { error?: unknown }) | null;
    if (!response.ok) throw driveHttpError(response.status, data, "stat");
    if (!data?.id) throw new DriveApiError(response.status || 404, "stat");
    return data;
  }

  async function resolveWritableFolderParent(folderId: string) {
    const cached = resolvedFolderParents.get(folderId);
    if (cached && Date.now() - cached.at <= RESOLVED_FOLDER_TTL_MS) return cached.id;
    try {
      const row = await getFileMetadata(folderId, "id,name,mimeType,shortcutDetails");
      const resolved = writableDriveFolderId(row);
      if (resolved) {
        rememberWritableFolder(folderId);
        rememberWritableFolder(resolved);
        if (resolved !== folderId) resolvedFolderParents.set(folderId, { at: Date.now(), id: resolved });
        return resolved;
      }
      if (row.mimeType && row.mimeType !== DRIVE_FOLDER_MIME) {
        throw new DriveApiError(400, "400 The specified parent is not a folder.");
      }
    } catch (error) {
      if (isDriveQuotaError(error) || isOauthInvalidGrant(error)) throw error;
      if (error instanceof DriveApiError && error.status === 400) throw error;
    }
    rememberWritableFolder(folderId);
    return folderId;
  }

  function listedFolderRow(row: DriveFile, parentId: string): DriveFile {
    const target = writableDriveFolderId(row);
    if (target && (row.mimeType === DRIVE_SHORTCUT_MIME || target !== row.id)) {
      return { ...row, id: target, mimeType: DRIVE_FOLDER_MIME, parents: row.parents || [parentId] };
    }
    return row;
  }

  async function listChildrenUncached(folderId: string, fresh: boolean) {
    const parent = await resolveWritableFolderParent(folderId);
    const q = `'${escapeDriveQueryValue(parent)}' in parents and trashed=false`;
    // Remembered corpora only on the happy path. Cold start: user, then My Drive, allDrives last.
    const modes: DriveListMode[] = listChildrenModeHint ? [listChildrenModeHint] : ["user", "drive", "allDrives"];
    const seen = new Map<string, DriveFile>();
    for (const mode of modes) {
      try {
        for (const row of await listByQuery(q, { ...driveListModeOpts(mode), fresh })) {
          const next = listedFolderRow(row, parent);
          if (next.id && !seen.has(next.id)) seen.set(next.id, next);
        }
        if (seen.size) {
          listChildrenModeHint = mode;
          rememberWritableFolder(parent);
          for (const row of seen.values()) {
            const id = writableDriveFolderId(row);
            if (id) rememberWritableFolder(id);
          }
          return [...seen.values()];
        }
      } catch (error) {
        if (isDriveQuotaError(error) || isOauthInvalidGrant(error)) throw error;
        // Wrong corpus / 404 — try the next mode only on a cold start.
      }
    }
    rememberWritableFolder(parent);
    return [...seen.values()];
  }

  async function listChildrenOf(folderId: string, opts?: { bypassCache?: boolean }) {
    if (!opts?.bypassCache) {
      const cached = listChildrenCache.get(folderId);
      if (cached) {
        const ttl = cached.files.length ? LIST_CHILDREN_TTL_MS : EMPTY_LIST_CHILDREN_TTL_MS;
        if (Date.now() - cached.at <= ttl) return cached.files;
      }
      const inflight = listChildrenInflight.get(folderId);
      if (inflight) return inflight;
    }
    const work = listChildrenUncached(folderId, Boolean(opts?.bypassCache));
    if (!opts?.bypassCache) listChildrenInflight.set(folderId, work);
    try {
      const files = await work;
      listChildrenCache.set(folderId, { at: Date.now(), files });
      return files;
    } finally {
      listChildrenInflight.delete(folderId);
    }
  }

  async function findNamedChildFolder(parentId: string, name: string, bypassCache = false) {
    const wanted = driveFolderName(name);
    const kids = await listChildrenOf(parentId, { bypassCache });
    const existing = kids.find((row) => sameDriveFolderName(row.name, wanted) && writableDriveFolderId(row));
    if (!existing) return null;
    const id = writableDriveFolderId(existing);
    if (!id) return null;
    return { id, name: existing.name || wanted, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] };
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
    async statFile(fileId) {
      const data = await getFileMetadata(fileId, "id,name,mimeType,modifiedTime,md5Checksum,shortcutDetails");
      return {
        id: data.id,
        name: data.name,
        mimeType: data.mimeType,
        modifiedTime: data.modifiedTime,
        shortcutDetails: data.shortcutDetails,
      };
    },
    async readJson(fileId) {
      const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { alt: "media" }), {
        headers: await authHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw driveHttpError(response.status, payload, "read");
      }
      return response.text();
    },
    async createJson(folderId, name, content, properties) {
      const parent = await resolveWritableFolderParent(folderId);
      const boundary = `hs_pack_${Date.now()}`;
      const meta = { name, parents: [parent], mimeType: "application/json", properties };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const response = await fetch(driveApiUrl("/upload/drive/v3/files", { uploadType: "multipart" }), {
        method: "POST",
        headers: await authHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
        body,
      });
      const file = (await response.json()) as DriveFile & { error?: { message?: string } | string };
      if (!file.id) throw driveHttpError(response.status || 400, file, "create");
      invalidateDriveListCache(parent);
      return { id: file.id, name: file.name || name, properties };
    },
    async updateJson(fileId, content, name, properties) {
      const upload = await fetch(
        driveApiUrl(`/upload/drive/v3/files/${fileId}`, {
          uploadType: "media",
          fields: "id,name,md5Checksum,modifiedTime",
        }),
        {
          method: "PATCH",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: content,
        },
      );
      if (!upload.ok) {
        const payload = await upload.json().catch(() => null);
        throw driveHttpError(upload.status, payload, "update");
      }
      const uploaded = (await upload.json().catch(() => null)) as DriveFile & { md5Checksum?: string } | null;
      if (name || properties) {
        await fetch(driveApiUrl(`/drive/v3/files/${fileId}`), {
          method: "PATCH",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name, properties }),
        });
      }
      return {
        id: fileId,
        name: name || uploaded?.name || fileId,
        properties,
        modifiedTime: uploaded?.modifiedTime,
      };
    },
    async deleteJson(fileId) {
      const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`), {
        method: "PATCH",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ trashed: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw driveHttpError(response.status, payload, "delete");
      }
      invalidateDriveListCache();
    },
    async confirmWrite(fileId, content) {
      return confirmDriveWrite(getAccessToken, fileId, content);
    },
    async listChildren(folderId) {
      return listChildrenOf(folderId);
    },
    async createFolder(parentId, name) {
      const parent = await resolveWritableFolderParent(parentId);
      const folderName = driveFolderName(name);
      const existing = await findNamedChildFolder(parent, folderName);
      if (existing) return existing;
      const response = await fetch(
        driveApiUrl("/drive/v3/files", { fields: "id,name,mimeType,parents" }),
        {
          method: "POST",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name: folderName, mimeType: DRIVE_FOLDER_MIME, parents: [parent] }),
        },
      );
      const file = (await response.json()) as DriveFile & { error?: unknown };
      if (file.id) {
        invalidateDriveListCache(parent);
        rememberWritableFolder(file.id);
        return { id: file.id, name: file.name || folderName, mimeType: DRIVE_FOLDER_MIME, parents: [parent] };
      }
      const created = driveHttpError(response.status || 400, file, "folder");
      if (isDriveQuotaError(created) || isOauthInvalidGrant(created)) throw created;
      if (response.status === 400 || response.status === 403) {
        invalidateDriveListCache(parent);
        const recovered = await findNamedChildFolder(parent, folderName, true);
        if (recovered) return recovered;
      }
      throw created;
    },
    async uploadBytes(folderId, name, bytes, mimeType, properties) {
      const parent = await resolveWritableFolderParent(folderId);
      const boundary = `hs_bytes_${Date.now()}`;
      const meta = { name, parents: [parent], mimeType, properties };
      const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      );
      const tail = Buffer.from(`\r\n--${boundary}--`);
      const body = Buffer.concat([head, Buffer.from(bytes), tail]);
      const response = await fetch(driveApiUrl("/upload/drive/v3/files", { uploadType: "multipart" }), {
        method: "POST",
        headers: await authHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
        body,
      });
      const file = (await response.json()) as DriveFile & { error?: unknown };
      if (!file.id) throw driveHttpError(response.status || 400, file, "upload");
      invalidateDriveListCache(parent);
      return { id: file.id, name: file.name || name, mimeType, parents: [parent], properties };
    },
    async updateBytes(fileId, bytes, mimeType) {
      const response = await fetch(
        driveApiUrl(`/upload/drive/v3/files/${fileId}`, { uploadType: "media", fields: "id,name,mimeType,modifiedTime" }),
        {
          method: "PATCH",
          headers: await authHeaders({ "content-type": mimeType || "application/octet-stream" }),
          body: Buffer.from(bytes),
        },
      );
      const file = (await response.json()) as DriveFile & { error?: unknown };
      if (!response.ok || !file.id) throw driveHttpError(response.status || 400, file, "upload");
      return { id: file.id, name: file.name || fileId, mimeType: file.mimeType || mimeType };
    },
    async readBytes(fileId) {
      const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { alt: "media" }), {
        headers: await authHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw driveHttpError(response.status, payload, "read");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async shareWithEmail(fileId, email, role = "writer") {
      const response = await fetch(
        driveApiUrl(`/drive/v3/files/${fileId}/permissions`, {
          sendNotificationEmail: "false",
          supportsAllDrives: "true",
        }),
        {
          method: "POST",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            type: "user",
            role,
            emailAddress: email.trim().toLowerCase(),
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as { id?: string; error?: unknown } | null;
      if (response.ok || response.status === 409) return { ok: true, already: response.status === 409 };
      const message = JSON.stringify(data ?? "");
      if (/already/i.test(message)) return { ok: true, already: true };
      throw driveHttpError(response.status || 400, data, "share");
    },
  };
}

async function confirmDriveWriteOnce(getAccessToken: () => Promise<string>, fileId: string, content: string) {
  const token = await getAccessToken();
  const response = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { fields: "id,md5Checksum,modifiedTime" }), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { id?: string; md5Checksum?: string; modifiedTime?: string };
  if (!data.id) return false;
  const wanted = createHash("md5").update(content).digest("hex");
  if (data.md5Checksum) {
    if (data.md5Checksum.toLowerCase() === wanted) return true;
    return false;
  }
  const media = await fetch(driveApiUrl(`/drive/v3/files/${fileId}`, { alt: "media" }), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (media.ok && (await media.text()) === content) return true;
  return Boolean(data.modifiedTime);
}

async function confirmDriveWrite(getAccessToken: () => Promise<string>, fileId: string, content: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (await confirmDriveWriteOnce(getAccessToken, fileId, content)) return true;
    } catch {
      // Eventual-consistency or a transient metadata read — retry before failing closed.
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
  }
  return false;
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
    async listChildren() {
      return [];
    },
    async createFolder() {
      throw new Error("unconfigured");
    },
    async uploadBytes() {
      throw new Error("unconfigured");
    },
    async updateBytes() {
      throw new Error("unconfigured");
    },
    async readBytes() {
      throw new Error("unconfigured");
    },
  };
}

/** Thin Drive leftover. Never let this file overlay a richer Aromatics / CAT copy. */
export const THIN_DRIVE_STUB_IDS = new Set([HIS_AROMATICS_STUB_ID, HIS_TM_FILE_ID]);

export function isThinDriveStub(fileId?: string | null) {
  return Boolean(fileId && THIN_DRIVE_STUB_IDS.has(fileId));
}

function logOauthDriveFallback() {
  // Static text only — never tokens, client secrets, refresh tokens, or SA JSON.
  console.warn("drive: OAuth failed; falling back to service account");
}

function logVaultWriteFailure(principal: "service-account" | "oauth", error: unknown) {
  const status = error instanceof DriveApiError ? error.status : 0;
  const message = error instanceof Error ? sanitizeDriveMessage(error.message) : "write failed";
  console.warn(`drive: ${principal} vault write failed; ${status || "err"} ${message}`);
}

function logVaultSaFallback() {
  console.warn("drive: service account vault write failed; trying OAuth");
}

function logVaultOauthSkipped() {
  console.warn("drive: oauth vault write skipped; invalid_grant");
}

function shouldSkipOauthFallback(error?: unknown) {
  return oauthInvalidGrant || isOauthInvalidGrant(error);
}

export function isSeatsOpenDenied(error: unknown) {
  const status = error instanceof DriveApiError ? error.status : 0;
  return status === 401 || status === 403 || status === 404;
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
    listChildren: (folderId) =>
      run((drive) => (drive.listChildren ? drive.listChildren(folderId) : Promise.resolve([]))),
    createFolder: (parentId, name) =>
      run((drive) => {
        if (!drive.createFolder) throw new Error("unconfigured");
        return drive.createFolder(parentId, name);
      }),
    uploadBytes: (folderId, name, bytes, mimeType, properties) =>
      run((drive) => {
        if (!drive.uploadBytes) throw new Error("unconfigured");
        return drive.uploadBytes(folderId, name, bytes, mimeType, properties);
      }),
    updateBytes: (fileId, bytes, mimeType) =>
      run((drive) => {
        if (!drive.updateBytes) throw new Error("unconfigured");
        return drive.updateBytes(fileId, bytes, mimeType);
      }),
    readBytes: (fileId) =>
      run((drive) => {
        if (!drive.readBytes) throw new Error("unconfigured");
        return drive.readBytes(fileId);
      }),
  };
}

/** SA first for vault JSON. List 403 on the folder does not abandon SA for PATCH-by-id. */
function withVaultWritePreference(sa: DriveAdapter, oauth: DriveAdapter): DriveAdapter {
  async function preferSa<T>(op: (drive: DriveAdapter) => Promise<T>): Promise<T> {
    try {
      return await op(sa);
    } catch (error) {
      if (shouldSkipOauthFallback(error)) throw error;
      try {
        return await op(oauth);
      } catch (oauthError) {
        if (isOauthInvalidGrant(oauthError)) throw error;
        throw oauthError;
      }
    }
  }
  async function writeLanded(drive: DriveAdapter, fileId: string, content: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await writeConfirmed(drive, fileId, content)) return true;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
    try {
      return (await drive.readJson(fileId)) === content;
    } catch {
      return false;
    }
  }
  async function writePreferSa(
    fileId: string,
    content: string,
    op: (drive: DriveAdapter) => Promise<DriveFile>,
  ): Promise<DriveFile> {
    let saWrote: DriveFile | null = null;
    let saError: unknown;
    let oauthError: unknown;
    try {
      saWrote = await op(sa);
      if (await writeLanded(sa, fileId || saWrote.id, content)) return saWrote;
      saError = new DriveApiError(409, "zombie", "service-account");
    } catch (error) {
      saWrote = null;
      saError = error;
    }
    if (saError) logVaultWriteFailure("service-account", saError);
    if (shouldSkipOauthFallback(saError)) {
      logVaultOauthSkipped();
    } else {
      logVaultSaFallback();
      try {
        const written = await op(oauth);
        if (await writeLanded(oauth, fileId || written.id, content)) return written;
        oauthError = new DriveApiError(409, "zombie", "oauth");
      } catch (error) {
        oauthError = error;
      }
      if (oauthError) logVaultWriteFailure("oauth", oauthError);
    }
    if (saWrote && (await writeLanded(sa, fileId || saWrote.id, content))) return saWrote;
    if (saError instanceof DriveApiError && isSeatsOpenDenied(saError) && !isDriveQuotaError(saError)) {
      throw new DriveApiError(saError.status, SEATS_SA_OPEN_ERROR, "service-account");
    }
    throw saError instanceof Error
      ? saError
      : oauthError instanceof Error
        ? oauthError
        : new Error("vault write not confirmed");
  }
  return {
    configured: true,
    listJson: (folderId) => preferSa((drive) => drive.listJson(folderId)),
    listAccessibleJson: (name) =>
      preferSa((drive) => (drive.listAccessibleJson ? drive.listAccessibleJson(name) : drive.listJson(""))),
    readJson: (fileId) => preferSa((drive) => drive.readJson(fileId)),
    createJson: async (folderId, name, content, properties) => {
      let saError: unknown;
      try {
        const written = await sa.createJson(folderId, name, content, properties);
        if (await writeConfirmed(sa, written.id, content)) return written;
        saError = new DriveApiError(409, "zombie", "service-account");
      } catch (error) {
        saError = error;
      }
      if (saError) logVaultWriteFailure("service-account", saError);
      if (shouldSkipOauthFallback(saError)) {
        logVaultOauthSkipped();
        throw saError instanceof Error ? saError : new Error("vault write not confirmed");
      }
      logVaultSaFallback();
      try {
        const written = await oauth.createJson(folderId, name, content, properties);
        if (await writeConfirmed(oauth, written.id, content)) return written;
      } catch (error) {
        logVaultWriteFailure("oauth", error);
        throw error instanceof Error ? error : new Error("vault write not confirmed");
      }
      throw new Error("vault write not confirmed");
    },
    updateJson: (fileId, content, name, properties) =>
      writePreferSa(fileId, content, (drive) => drive.updateJson(fileId, content, name, properties)),
    deleteJson: (fileId) => preferSa((drive) => drive.deleteJson(fileId)),
    confirmWrite: async (fileId, content) =>
      (await writeConfirmed(sa, fileId, content)) || writeConfirmed(oauth, fileId, content),
    // SA only — do not let an OAuth GET hide a 403 on seats.json.
    statFile: (fileId) => (sa.statFile ? sa.statFile(fileId) : Promise.reject(new DriveApiError(404, "stat"))),
    listChildren: (folderId) => preferSa((drive) => (drive.listChildren ? drive.listChildren(folderId) : Promise.resolve([]))),
    createFolder: (parentId, name) =>
      preferSa((drive) => {
        if (!drive.createFolder) throw new Error("unconfigured");
        return drive.createFolder(parentId, name);
      }),
    uploadBytes: (folderId, name, bytes, mimeType, properties) =>
      preferSa((drive) => {
        if (!drive.uploadBytes) throw new Error("unconfigured");
        return drive.uploadBytes(folderId, name, bytes, mimeType, properties);
      }),
    updateBytes: (fileId, bytes, mimeType) =>
      preferSa((drive) => {
        if (!drive.updateBytes) throw new Error("unconfigured");
        return drive.updateBytes(fileId, bytes, mimeType);
      }),
    readBytes: (fileId) =>
      preferSa((drive) => {
        if (!drive.readBytes) throw new Error("unconfigured");
        return drive.readBytes(fileId);
      }),
  };
}

function withConfirmedWrites(drive: DriveAdapter): DriveAdapter {
  return {
    ...drive,
    async createJson(folderId, name, content, properties) {
      const written = await drive.createJson(folderId, name, content, properties);
      if (!(await writeConfirmed(drive, written.id, content))) {
        throw new Error("vault write not confirmed");
      }
      return written;
    },
    async updateJson(fileId, content, name, properties) {
      const written = await drive.updateJson(fileId, content, name, properties);
      if (!(await writeConfirmed(drive, fileId, content))) {
        throw new Error("vault write not confirmed");
      }
      return written;
    },
    confirmWrite: (fileId, content) => writeConfirmed(drive, fileId, content),
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
  if (account) return withConfirmedWrites(googleDriveAdapter(() => googleAccessToken(account)));
  if (oauth) return withConfirmedWrites(googleDriveAdapter(() => oauthAccessToken(oauth)));
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

async function readAromaticsFreezePack(adapter: DriveAdapter): Promise<EstimatePackSnapshot | null> {
  try {
    const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(HIS_AROMATICS_FREEZE_FILE_ID)));
    if (!parsed.ok || !scheduleHasWork(parsed.pack.schedule) || !crewHasCustomClock(parsed.pack.crew)) {
      return null;
    }
    return parsed.pack;
  } catch {
    return null;
  }
}

function isAromaticsLiveTarget(fileId: string | undefined, pack: EstimatePackSnapshot) {
  return fileId === HIS_AROMATICS_FILE_ID || pack.packId === HIS_AROMATICS_PACK_ID;
}

async function restoreAromaticsFromFreeze(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
): Promise<EstimatePackSnapshot> {
  const freeze = await readAromaticsFreezePack(adapter);
  if (!freeze) return pack;
  return restorePackClock(pack, freeze);
}

async function writeAromaticsLiveRestore(adapter: DriveAdapter, restored: EstimatePackSnapshot) {
  const ownerEmail = restored.ownerEmail.trim().toLowerCase();
  const payload = JSON.stringify(publicPack({ ...restored, ownerEmail }), null, 2);
  const name = estimateFileName(restored);
  const properties = { packId: restored.packId, ownerEmail };
  const write = () => adapter.updateJson(HIS_AROMATICS_FILE_ID, payload, name, properties);
  try {
    await write();
  } catch {
    await write();
  }
}

async function restoreAromaticsClockIfSmashed(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  fileId: string,
): Promise<EstimatePackSnapshot> {
  if (fileId === HIS_AROMATICS_FREEZE_FILE_ID) return pack;
  if (!isAromaticsLiveTarget(fileId, pack)) return pack;
  if (!packClockIsSeedSmashed(pack)) return pack;
  const restored = await restoreAromaticsFromFreeze(adapter, pack);
  if (packClockIsSeedSmashed(restored)) return pack;
  try {
    await writeAromaticsLiveRestore(adapter, restored);
  } catch {
    // Jobs list/open still returns the freeze restore. Smash flush stays blocked.
  }
  return restored;
}

/** Auto-restore smashed Aromatics, or refuse the write so seed smash cannot persist. Never target the freeze file. */
async function packForAromaticsWrite(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  fileId: string | undefined,
): Promise<EstimatePackSnapshot | null> {
  if (fileId === HIS_AROMATICS_FREEZE_FILE_ID) return null;
  if (!isAromaticsLiveTarget(fileId, pack)) return pack;
  if (!packClockIsSeedSmashed(pack)) return pack;
  const restored = await restoreAromaticsFromFreeze(adapter, pack);
  if (packClockIsSeedSmashed(restored)) return null;
  return restored;
}

export async function readDrivePackById(
  adapter: DriveAdapter,
  packId: string,
  folderId = estimatesFolderId(),
) {
  const file = await findDrivePackByPackId(adapter, resolveEstimatesFolder(folderId), packId);
  if (!file) return null;
  const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
  if (!parsed.ok) return null;
  return publicPack(await restoreAromaticsClockIfSmashed(adapter, parsed.pack, file.id));
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

async function readExistingSnapshot(adapter: DriveAdapter, fileId: string): Promise<EstimatePackSnapshot | null> {
  try {
    const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(fileId)));
    return parsed.ok ? parsed.pack : null;
  } catch {
    return null;
  }
}

async function writePackFile(
  adapter: DriveAdapter,
  pack: EstimatePackSnapshot,
  folderId: string,
  existing: DriveFile | null,
) {
  let target =
    existing && !isThinDriveStub(existing.id) && existing.id !== HIS_AROMATICS_FREEZE_FILE_ID
      ? existing
      : knownHisFile(pack.packId);
  if (target?.id === HIS_AROMATICS_FREEZE_FILE_ID) target = knownHisFile(pack.packId);
  const pinnedHis = target ? hisFileByDriveId(target.id) : null;
  if (pinnedHis && isSandboxEstimateOwner(pack.ownerEmail)) {
    throw new Error("PACK_OWNED_ELSEWHERE");
  }
  if (
    pinnedHis &&
    pack.packId &&
    pinnedHis.packId &&
    pack.packId.trim().toLowerCase() !== pinnedHis.packId.trim().toLowerCase()
  ) {
    target = null;
  }
  const current = target ? await readExistingSnapshot(adapter, target.id) : null;
  const decision = decidePackWrite(pack, current);
  if (decision.action === "keep-last-good" && current && target) {
    return target;
  }
  if (decision.action === "refuse") {
    throw new Error(integrityErrorMessage(decision));
  }
  const outgoing = await packForAromaticsWrite(adapter, pack, target?.id);
  if (!outgoing) {
    throw new Error("AROMATICS_SEED_SMASH");
  }
  const baselineFault = packBaselineWriteException(outgoing);
  if (baselineFault) {
    const moneyFault = packBaselineMoneyWriteError(outgoing);
    if (moneyFault || !current || !target) throw baselineFault;
    return target;
  }
  const ownerEmail = outgoing.ownerEmail.trim().toLowerCase() || pack.ownerEmail.trim().toLowerCase();
  const payload = JSON.stringify(publicPack({ ...outgoing, ownerEmail }), null, 2);
  const properties = { packId: outgoing.packId, ownerEmail };
  if (target) {
    const name = estimateFileName(outgoing);
    return adapter.updateJson(target.id, payload, name === target.name ? target.name : name, properties);
  }
  const taken = (await adapter.listJson(folderId)).map((file) => file.name);
  const name = estimateFileName(outgoing, taken);
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
    if (isThinDriveStub(file.id) || file.id === HIS_AROMATICS_FREEZE_FILE_ID) continue;
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok) {
        const pack = await restoreAromaticsClockIfSmashed(adapter, reclaimListedPack(parsed.pack), file.id);
        packs.push(pack);
      }
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
  if (!parsed.ok) return null;
  return publicPack(await restoreAromaticsClockIfSmashed(adapter, parsed.pack, file.id));
}
