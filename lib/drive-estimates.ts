import { SignJWT, importPKCS8 } from "jose";
import {
  estimateFileName,
  parseIncomingPack,
  publicPack,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";

export type DriveFile = {
  id: string;
  name: string;
  properties?: Record<string, string>;
};

export type DriveAdapter = {
  configured: boolean;
  listJson(folderId: string): Promise<DriveFile[]>;
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

let cachedToken: { value: string; exp: number } | null = null;

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

export function driveConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(parseServiceAccount(env));
}

export function driveStoreKind(env: Record<string, string | undefined> = process.env) {
  return driveConfigured(env) ? "drive" : "unconfigured";
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

async function googleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
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
  cachedToken = { value: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  return cachedToken.value;
}

function googleDriveAdapter(account: ServiceAccount): DriveAdapter {
  async function authHeaders(extra?: Record<string, string>) {
    const token = await googleAccessToken(account);
    return { authorization: `Bearer ${token}`, ...extra };
  }

  return {
    configured: true,
    async listJson(folderId) {
      const q = `'${folderId}' in parents and trashed=false and mimeType='application/json'`;
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", q);
      url.searchParams.set("fields", "files(id,name,properties,modifiedTime)");
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("spaces", "drive");
      const response = await fetch(url, { headers: await authHeaders() });
      const data = (await response.json()) as { files?: DriveFile[] };
      return Array.isArray(data.files) ? data.files : [];
    },
    async readJson(fileId) {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error("read");
      return response.text();
    },
    async createJson(folderId, name, content, properties) {
      const boundary = `hs_pack_${Date.now()}`;
      const meta = { name, parents: [folderId], mimeType: "application/json", properties };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: await authHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
        body,
      });
      const file = (await response.json()) as DriveFile;
      if (!file.id) throw new Error("create");
      return { id: file.id, name: file.name || name, properties };
    },
    async updateJson(fileId, content, name, properties) {
      const upload = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: content,
      });
      if (!upload.ok) throw new Error("update");
      if (name || properties) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: "PATCH",
          headers: await authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name, properties }),
        });
      }
      return { id: fileId, name: name || fileId, properties };
    },
    async deleteJson(fileId) {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ trashed: true }),
      });
      if (!response.ok) throw new Error("delete");
    },
  };
}

export function driveAdapter(env: Record<string, string | undefined> = process.env): DriveAdapter {
  const account = parseServiceAccount(env);
  if (!account) {
    return {
      configured: false,
      async listJson() {
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
  return googleDriveAdapter(account);
}

function fileMatchesPack(file: DriveFile, packId: string, ownerEmail: string) {
  return file.properties?.packId === packId && file.properties?.ownerEmail === ownerEmail;
}

export async function findDrivePackFile(
  adapter: DriveAdapter,
  folderId: string,
  packId: string,
  ownerEmail: string,
) {
  const files = await adapter.listJson(folderId);
  const tagged = files.find((file) => fileMatchesPack(file, packId, ownerEmail));
  if (tagged) return tagged;
  for (const file of files) {
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (!parsed.ok) continue;
      if (parsed.pack.packId === packId && parsed.pack.ownerEmail === ownerEmail) return file;
    } catch {
      // skip unreadable rows
    }
  }
  return null;
}

export async function findDrivePackByPackId(adapter: DriveAdapter, folderId: string, packId: string) {
  const files = await adapter.listJson(folderId);
  const tagged = files.find((file) => file.properties?.packId === packId);
  if (tagged) return tagged;
  for (const file of files) {
    try {
      const parsed = parseIncomingPack(JSON.parse(await adapter.readJson(file.id)));
      if (parsed.ok && parsed.pack.packId === packId) return file;
    } catch {
      // skip unreadable rows
    }
  }
  return null;
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
  let taken: string[] = [];
  try {
    taken = (await adapter.listJson(folderId)).map((file) => file.name);
  } catch {
    taken = [];
  }
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
  let existing: DriveFile | null = null;
  try {
    existing = await findDrivePackFile(adapter, target, pack.packId, ownerEmail);
  } catch {
    existing = null;
  }
  return writePackFile(adapter, pack, target, existing);
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
  return packs;
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
