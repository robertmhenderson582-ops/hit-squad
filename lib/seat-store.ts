import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ADD_PERMISSIONS = ["Trusted", "Look & feel", "Staff"] as const;
export type AddPermission = (typeof ADD_PERMISSIONS)[number];

export type ExtraSeat = {
  id: string;
  email: string;
  name: string;
  username: string;
  permission: AddPermission;
  expires: string;
  rateBuilder: boolean;
  viewAs: boolean;
  aliased: boolean;
  shop: "madison" | "field";
};

export type SeatHash = { passwordHash?: string; mustChangePassword?: boolean };

export type SeatFile = {
  hashes?: Record<string, SeatHash>;
  extras?: ExtraSeat[];
};

let cached: SeatFile | null = null;
let loadedFrom: string | null = null;

export function seatPasswordPath() {
  if (process.env.SEAT_PASSWORD_PATH) return process.env.SEAT_PASSWORD_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-seats.json";
  return join(process.cwd(), "data", "seat-passwords.json");
}

export function resetSeatFileForTests() {
  cached = null;
  loadedFrom = null;
}

function isAddPermission(value: unknown): value is AddPermission {
  return value === "Trusted" || value === "Look & feel" || value === "Staff";
}

function normalizeExtra(row: ExtraSeat): ExtraSeat {
  const email = row.email.trim().toLowerCase();
  const permission = row.permission;
  return {
    id: row.id,
    email,
    name: row.name,
    username: row.username || email.split("@")[0],
    permission,
    expires: row.expires || "",
    rateBuilder: permission === "Look & feel" ? false : row.rateBuilder !== false,
    viewAs: Boolean(row.viewAs),
    aliased: Boolean(row.aliased),
    shop: row.shop === "madison" ? "madison" : "field",
  };
}

function isExtraSeat(row: unknown): row is ExtraSeat {
  if (!row || typeof row !== "object") return false;
  const extra = row as ExtraSeat;
  return (
    typeof extra.id === "string" &&
    typeof extra.email === "string" &&
    typeof extra.name === "string" &&
    isAddPermission(extra.permission)
  );
}

export function loadSeatFile(): SeatFile {
  const file = seatPasswordPath();
  if (cached && loadedFrom === file) return cached;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SeatFile;
    cached = {
      hashes: parsed.hashes && typeof parsed.hashes === "object" ? parsed.hashes : {},
      extras: Array.isArray(parsed.extras) ? parsed.extras.filter(isExtraSeat).map(normalizeExtra) : [],
    };
  } catch {
    cached = { hashes: {}, extras: [] };
  }
  loadedFrom = file;
  return cached;
}

export function saveSeatFile(next: SeatFile) {
  const hashes = next.hashes && typeof next.hashes === "object" ? next.hashes : {};
  const extras = Array.isArray(next.extras) ? next.extras.filter(isExtraSeat).map(normalizeExtra) : [];
  cached = { hashes, extras };
  const file = seatPasswordPath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hashes, extras }, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

export function listExtraSeats(): ExtraSeat[] {
  return [...(loadSeatFile().extras || [])];
}

export function extraSeatByEmail(email: string): ExtraSeat | undefined {
  const key = email.trim().toLowerCase();
  return listExtraSeats().find((row) => row.email === key);
}
