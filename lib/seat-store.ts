import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SeatSecret = {
  passwordHash: string;
  setAt: string;
  signInAt?: string;
};

export type SeatSecretMap = Record<string, SeatSecret>;

type GlobalSeats = typeof globalThis & { __hsSeatSecrets?: SeatSecretMap };

const FILE_NAME = "seat-secrets.json";
const BLOB_PATH = "desk/seat-secrets.json";

function memory(): SeatSecretMap {
  const g = globalThis as GlobalSeats;
  if (!g.__hsSeatSecrets) g.__hsSeatSecrets = {};
  return g.__hsSeatSecrets;
}

function localPaths(): string[] {
  return [path.join(process.cwd(), "data", FILE_NAME), path.join("/tmp", `hs-${FILE_NAME}`)];
}

async function readJsonFile(filePath: string): Promise<SeatSecretMap | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as SeatSecretMap;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadFromDisk(): Promise<SeatSecretMap> {
  for (const filePath of localPaths()) {
    const parsed = await readJsonFile(filePath);
    if (parsed) return parsed;
  }
  return {};
}

async function loadFromBlob(): Promise<SeatSecretMap | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const listed = await fetch(`https://blob.vercel-storage.com?prefix=${encodeURIComponent(BLOB_PATH)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!listed.ok) return null;
    const data = (await listed.json()) as { blobs?: { url: string; pathname: string }[] };
    const match = data.blobs?.find((blob) => blob.pathname === BLOB_PATH) ?? data.blobs?.[0];
    if (!match?.url) return null;
    const file = await fetch(match.url, { cache: "no-store" });
    if (!file.ok) return null;
    return (await file.json()) as SeatSecretMap;
  } catch {
    return null;
  }
}

async function saveToDisk(map: SeatSecretMap): Promise<void> {
  const payload = `${JSON.stringify(map, null, 2)}\n`;
  for (const filePath of localPaths()) {
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, payload, "utf8");
    } catch {
      // read-only on some hosts
    }
  }
}

async function saveToBlob(map: SeatSecretMap): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://blob.vercel-storage.com/${BLOB_PATH}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": "7",
        "x-vercel-blob-access": "private",
        "x-vercel-blob-allow-overwrite": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(map),
    });
  } catch {
    // Blob is optional. File / memory still hold the claim on this instance.
  }
}

export async function loadSeatSecrets(): Promise<SeatSecretMap> {
  const current = memory();
  if (Object.keys(current).length > 0) return current;
  const fromBlob = await loadFromBlob();
  const fromDisk = await loadFromDisk();
  const merged = { ...fromDisk, ...fromBlob, ...current };
  (globalThis as GlobalSeats).__hsSeatSecrets = merged;
  return merged;
}

export async function saveSeatSecrets(map: SeatSecretMap): Promise<void> {
  (globalThis as GlobalSeats).__hsSeatSecrets = map;
  await Promise.all([saveToDisk(map), saveToBlob(map)]);
}

export async function getSeatSecret(email: string): Promise<SeatSecret | undefined> {
  const map = await loadSeatSecrets();
  return map[email.trim().toLowerCase()];
}

export async function setSeatPassword(email: string, passwordHash: string): Promise<SeatSecret> {
  const key = email.trim().toLowerCase();
  const map = await loadSeatSecrets();
  const next: SeatSecret = {
    passwordHash,
    setAt: new Date().toISOString(),
    signInAt: map[key]?.signInAt,
  };
  map[key] = next;
  await saveSeatSecrets(map);
  return next;
}

export async function markSeatSignIn(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const map = await loadSeatSecrets();
  if (!map[key]) return;
  map[key] = { ...map[key], signInAt: new Date().toISOString() };
  await saveSeatSecrets(map);
}

export async function clearSeatPassword(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const map = await loadSeatSecrets();
  delete map[key];
  await saveSeatSecrets(map);
}

export async function clearAllSeatPasswords(): Promise<void> {
  await saveSeatSecrets({});
}
