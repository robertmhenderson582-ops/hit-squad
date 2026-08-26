import { SignJWT, importPKCS8 } from "jose";
import { driveConfigured, parseServiceAccount } from "./drive-estimates.ts";
import { isLeadKind, type LeadFile, type LeadKind } from "./lead-briefs.ts";

/**
 * Owner vault Data room (Hit Squad Estimators / Data).
 * Quality and HSE sit under this folder. Never expose ids to testers.
 */
export const DATA_ROOM_ID = "141Js9RQZKXqOMBb2EsIh3Olzr-pGLXgQ";
/** Quality room under Data. Existing folder — do not delete. */
export const QUALITY_ROOM_ID = "1A7anV1UKx8m7IgUW2uVpwWHxB5fHerOg";
/** HSE room under Data. Existing folder — do not delete. */
export const HSE_ROOM_ID = "10f8lfsKSVgvQ_0YE5ankEmcWUT8TGuu0";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const BRIEF_JSON = "brief.json";

export type BriefDriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  properties?: Record<string, string>;
};

export type BriefDrive = {
  configured: boolean;
  getFile(fileId: string): Promise<BriefDriveFile | null>;
  listChildren(folderId: string): Promise<BriefDriveFile[]>;
  createFolder(parentId: string, name: string): Promise<BriefDriveFile>;
  uploadBytes(
    folderId: string,
    name: string,
    bytes: Uint8Array,
    mimeType: string,
    properties?: Record<string, string>,
  ): Promise<BriefDriveFile>;
  readBytes(fileId: string): Promise<Uint8Array>;
  readText(fileId: string): Promise<string>;
};

export type LandedBriefFile = { name: string; type: string; id: string };
export type LandedBrief = {
  id: string;
  kind: LeadKind;
  who: string;
  whoName: string;
  savedAt: string;
  describe: string;
  files: LandedBriefFile[];
};

export type BriefManifest = {
  kind: LeadKind;
  who: string;
  whoName: string;
  savedAt: string;
  describe: string;
  files: LandedBriefFile[];
};

let cachedToken: { value: string; exp: number } | null = null;

export function briefRoomId(kind: LeadKind) {
  return kind === "quality" ? QUALITY_ROOM_ID : HSE_ROOM_ID;
}

export function briefRoomName(kind: LeadKind) {
  return kind === "quality" ? "Quality" : "HSE";
}

export function userFolderName(email: string) {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "user";
}

export function saveFolderName(at = new Date()) {
  return at.toISOString().replace(/[:.]/g, "-");
}

export function safeFileName(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 180) || "file";
}

export function uniqueFileName(name: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const safe = safeFileName(name);
  if (safe === BRIEF_JSON) return uniqueFileName("form.json", used);
  if (!used.has(safe)) return safe;
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}-${n}${ext}`;
  }
  return next;
}

export function decodeLeadBytes(file: LeadFile) {
  return Uint8Array.from(Buffer.from(file.data, "base64"));
}

export function responseLeaksBriefVault(payload: unknown) {
  const text = JSON.stringify(payload);
  return /141Js9RQZKXq|1A7anV1UKx8m7|10f8lfsKSVgvQ|1zYl2dEvW21|drive\.google\.com/i.test(text);
}

function copyBytes(bytes: Uint8Array) {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export function memoryBriefDrive(): BriefDrive & {
  files: Map<string, { file: BriefDriveFile; content: Uint8Array }>;
} {
  const files = new Map<string, { file: BriefDriveFile; content: Uint8Array }>();
  let n = 0;

  function put(file: BriefDriveFile, content = new Uint8Array()) {
    files.set(file.id, { file, content: copyBytes(content) });
    return file;
  }

  put({ id: DATA_ROOM_ID, name: "Data", mimeType: FOLDER_MIME, parents: [] });
  put({ id: QUALITY_ROOM_ID, name: "Quality", mimeType: FOLDER_MIME, parents: [DATA_ROOM_ID] });
  put({ id: HSE_ROOM_ID, name: "HSE", mimeType: FOLDER_MIME, parents: [DATA_ROOM_ID] });

  return {
    configured: true,
    files,
    async getFile(fileId) {
      return files.get(fileId)?.file ?? null;
    },
    async listChildren(folderId) {
      return [...files.values()]
        .map((row) => row.file)
        .filter((file) => file.parents?.includes(folderId));
    },
    async createFolder(parentId, name) {
      n += 1;
      return put({ id: `folder-${n}`, name, mimeType: FOLDER_MIME, parents: [parentId] });
    },
    async uploadBytes(folderId, name, bytes, mimeType, properties) {
      n += 1;
      return put(
        { id: `file-${n}`, name, mimeType, parents: [folderId], properties },
        copyBytes(bytes),
      );
    },
    async readBytes(fileId) {
      const row = files.get(fileId);
      if (!row) throw new Error("missing");
      return row.content;
    },
    async readText(fileId) {
      return new TextDecoder().decode(await this.readBytes(fileId));
    },
  };
}

async function googleAccessToken(env: Record<string, string | undefined>) {
  const account = parseServiceAccount(env);
  if (!account) return null;
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

function googleBriefDrive(env: Record<string, string | undefined>): BriefDrive {
  async function authHeaders(extra?: Record<string, string>) {
    const token = await googleAccessToken(env);
    if (!token) throw new Error("unconfigured");
    return { authorization: `Bearer ${token}`, ...extra };
  }

  return {
    configured: true,
    async getFile(fileId) {
      const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
      url.searchParams.set("fields", "id,name,mimeType,parents,properties,trashed");
      url.searchParams.set("supportsAllDrives", "true");
      const response = await fetch(url, { headers: await authHeaders() });
      if (!response.ok) return null;
      const file = (await response.json()) as BriefDriveFile & { trashed?: boolean };
      if (file.trashed) return null;
      return file.id ? file : null;
    },
    async listChildren(folderId) {
      const out: BriefDriveFile[] = [];
      let pageToken = "";
      do {
        const url = new URL("https://www.googleapis.com/drive/v3/files");
        url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
        url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,parents,properties)");
        url.searchParams.set("pageSize", "100");
        url.searchParams.set("spaces", "drive");
        url.searchParams.set("supportsAllDrives", "true");
        url.searchParams.set("includeItemsFromAllDrives", "true");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await fetch(url, { headers: await authHeaders() });
        const data = (await response.json()) as { files?: BriefDriveFile[]; nextPageToken?: string };
        if (Array.isArray(data.files)) out.push(...data.files);
        pageToken = data.nextPageToken || "";
      } while (pageToken);
      return out;
    },
    async createFolder(parentId, name) {
      const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: await authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      });
      const file = (await response.json()) as BriefDriveFile;
      if (!file.id) throw new Error("folder");
      return { id: file.id, name: file.name || name, mimeType: FOLDER_MIME, parents: [parentId] };
    },
    async uploadBytes(folderId, name, bytes, mimeType, properties) {
      const boundary = `hs_brief_${Date.now()}`;
      const meta = { name, parents: [folderId], mimeType, properties };
      const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      );
      const tail = Buffer.from(`\r\n--${boundary}--`);
      const body = Buffer.concat([head, Buffer.from(bytes), tail]);
      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        {
          method: "POST",
          headers: await authHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
          body,
        },
      );
      const file = (await response.json()) as BriefDriveFile;
      if (!file.id) throw new Error("upload");
      return { id: file.id, name: file.name || name, mimeType, parents: [folderId], properties };
    },
    async readBytes(fileId) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: await authHeaders() },
      );
      if (!response.ok) throw new Error("read");
      return new Uint8Array(await response.arrayBuffer());
    },
    async readText(fileId) {
      return new TextDecoder().decode(await this.readBytes(fileId));
    },
  };
}

export function briefDriveAdapter(env: Record<string, string | undefined> = process.env): BriefDrive {
  if (!driveConfigured(env)) {
    return {
      configured: false,
      async getFile() {
        return null;
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
      async readBytes() {
        throw new Error("unconfigured");
      },
      async readText() {
        return "";
      },
    };
  }
  return googleBriefDrive(env);
}

export async function findNamedChild(drive: BriefDrive, parentId: string, name: string) {
  const children = await drive.listChildren(parentId);
  return children.find((file) => file.name === name) ?? null;
}

export async function ensureBriefRoom(drive: BriefDrive, kind: LeadKind) {
  const known = briefRoomId(kind);
  const existing = await drive.getFile(known);
  if (existing && existing.mimeType === FOLDER_MIME) return existing.id;
  const named = await findNamedChild(drive, DATA_ROOM_ID, briefRoomName(kind));
  if (named) return named.id;
  const created = await drive.createFolder(DATA_ROOM_ID, briefRoomName(kind));
  return created.id;
}

export async function ensureUserFolder(drive: BriefDrive, roomId: string, email: string) {
  const name = userFolderName(email);
  const existing = await findNamedChild(drive, roomId, name);
  if (existing) return existing.id;
  return (await drive.createFolder(roomId, name)).id;
}

function isBriefRoom(file: BriefDriveFile) {
  return (
    file.id === QUALITY_ROOM_ID ||
    file.id === HSE_ROOM_ID ||
    file.name === "Quality" ||
    file.name === "HSE"
  );
}

export async function fileInBriefRooms(drive: BriefDrive, fileId: string) {
  let current = await drive.getFile(fileId);
  if (!current) return null;
  const start = current;
  for (let depth = 0; depth < 8; depth += 1) {
    if (isBriefRoom(current)) return start;
    const parents = current.parents ?? [];
    if (parents.some((parent) => parent === QUALITY_ROOM_ID || parent === HSE_ROOM_ID)) return start;
    const parentId = parents[0];
    if (!parentId || parentId === DATA_ROOM_ID) return null;
    current = await drive.getFile(parentId);
    if (!current) return null;
  }
  return null;
}

function parseManifest(raw: string, folderId: string): LandedBrief | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BriefManifest>;
    if (!isLeadKind(parsed.kind)) return null;
    if (typeof parsed.who !== "string" || !parsed.who) return null;
    return {
      id: folderId,
      kind: parsed.kind,
      who: parsed.who,
      whoName: typeof parsed.whoName === "string" ? parsed.whoName : parsed.who,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      describe: typeof parsed.describe === "string" ? parsed.describe : "",
      files: Array.isArray(parsed.files)
        ? parsed.files
            .filter((file): file is LandedBriefFile => Boolean(file && file.name && file.id))
            .map((file) => ({ name: file.name, type: file.type || "application/octet-stream", id: file.id }))
        : [],
    };
  } catch {
    return null;
  }
}

export async function saveBriefToDrive(
  drive: BriefDrive,
  input: {
    kind: LeadKind;
    who: string;
    whoName: string;
    describe: string;
    files: LeadFile[];
    savedAt?: string;
  },
): Promise<LandedBrief> {
  const who = input.who.trim().toLowerCase();
  const savedAt = input.savedAt || new Date().toISOString();
  const roomId = await ensureBriefRoom(drive, input.kind);
  const userId = await ensureUserFolder(drive, roomId, who);
  let folderName = saveFolderName(new Date(savedAt));
  const taken = new Set((await drive.listChildren(userId)).map((file) => file.name));
  if (taken.has(folderName)) folderName = `${folderName}-${Math.random().toString(36).slice(2, 6)}`;
  const saveFolder = await drive.createFolder(userId, folderName);
  const usedNames = new Set<string>([BRIEF_JSON]);
  const files: LandedBriefFile[] = [];
  for (const file of input.files) {
    const name = uniqueFileName(file.name, usedNames);
    usedNames.add(name);
    const uploaded = await drive.uploadBytes(
      saveFolder.id,
      name,
      decodeLeadBytes(file),
      file.type || "application/octet-stream",
      { who, kind: input.kind },
    );
    files.push({ name, type: file.type || "application/octet-stream", id: uploaded.id });
  }
  const manifest: BriefManifest = {
    kind: input.kind,
    who,
    whoName: input.whoName || who,
    savedAt,
    describe: input.describe,
    files,
  };
  await drive.uploadBytes(
    saveFolder.id,
    BRIEF_JSON,
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    "application/json",
    { who, kind: input.kind, savedAt },
  );
  return { id: saveFolder.id, ...manifest };
}

export async function listBriefsFromDrive(drive: BriefDrive, kind: LeadKind): Promise<LandedBrief[]> {
  const roomId = await ensureBriefRoom(drive, kind);
  const users = await drive.listChildren(roomId);
  const briefs: LandedBrief[] = [];
  for (const userFolder of users) {
    if (userFolder.mimeType && userFolder.mimeType !== FOLDER_MIME) continue;
    const saves = await drive.listChildren(userFolder.id);
    for (const save of saves) {
      const children = await drive.listChildren(save.id);
      const manifestFile = children.find((file) => file.name === BRIEF_JSON);
      if (!manifestFile) continue;
      const parsed = parseManifest(await drive.readText(manifestFile.id), save.id);
      if (parsed && parsed.kind === kind) briefs.push(parsed);
    }
  }
  return briefs.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

export async function readBriefFile(drive: BriefDrive, fileId: string) {
  const allowed = await fileInBriefRooms(drive, fileId);
  if (!allowed) return null;
  return {
    name: allowed.name,
    type: allowed.mimeType || "application/octet-stream",
    bytes: await drive.readBytes(fileId),
  };
}
