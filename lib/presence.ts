import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NOVUS_EMAIL } from "./desk-role.ts";

export type PresencePing = {
  email: string;
  name: string;
  path: string;
  at: number;
};

export type PresenceSeat = {
  email: string;
  name: string;
  path: string;
  startedAt: number;
  lastAt: number;
};

type PresenceFile = {
  seats?: PresenceSeat[];
  alreadyOn?: string[];
  waiting?: PresencePing[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_MS = 90 * 1000;

let cache: PresenceFile | null = null;
let loadedFrom: string | null = null;

export const PRESENCE_IDLE_MS = IDLE_MS;

export function presenceStoreKind() {
  return "server-json-file";
}

export function presenceStorePath() {
  if (process.env.PRESENCE_STORE_PATH) return process.env.PRESENCE_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-presence.json";
  return join(process.cwd(), "data", "presence.json");
}

export function resetPresenceStoreForTests(path?: string) {
  cache = null;
  loadedFrom = null;
  if (path) process.env.PRESENCE_STORE_PATH = path;
  else delete process.env.PRESENCE_STORE_PATH;
}

function emptyFile(): PresenceFile {
  return { seats: [], alreadyOn: [], waiting: [] };
}

function load(): PresenceFile {
  const file = presenceStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PresenceFile;
    cache = {
      seats: Array.isArray(parsed.seats) ? parsed.seats : [],
      alreadyOn: Array.isArray(parsed.alreadyOn) ? parsed.alreadyOn : [],
      waiting: Array.isArray(parsed.waiting) ? parsed.waiting : [],
    };
  } catch {
    cache = emptyFile();
  }
  loadedFrom = file;
  return cache;
}

function save(next: PresenceFile) {
  cache = next;
  const file = presenceStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function prune(state: PresenceFile, now: number) {
  const cutoff = now - DAY_MS;
  state.seats = (state.seats ?? []).filter((row) => row.lastAt >= cutoff);
  const emails = new Set(state.seats.map((row) => row.email.toLowerCase()));
  state.alreadyOn = (state.alreadyOn ?? []).filter((email) => emails.has(email.toLowerCase()));
}

function hiddenFromList(email: string, viewerEmail?: string) {
  const key = email.trim().toLowerCase();
  if (!key) return true;
  if (key === NOVUS_EMAIL) return true;
  if (viewerEmail && key === viewerEmail.trim().toLowerCase()) return true;
  return false;
}

export function isPresenceLive(lastAt: number, now = Date.now()) {
  return now - lastAt < IDLE_MS;
}

export function beatPresence(input: { email: string; name: string; path: string }, now = Date.now()): PresenceSeat {
  const state = load();
  prune(state, now);
  const email = input.email.trim().toLowerCase();
  const existing = (state.seats ?? []).find((row) => row.email.toLowerCase() === email);
  const row: PresenceSeat = {
    email,
    name: input.name,
    path: input.path,
    startedAt: existing?.startedAt ?? now,
    lastAt: now,
  };
  state.seats = [...(state.seats ?? []).filter((item) => item.email.toLowerCase() !== email), row];
  save(state);
  return row;
}

export function pingPresence(input: { email: string; name: string; path: string }, now = Date.now()): PresencePing | null {
  beatPresence(input, now);
  const state = load();
  const email = input.email.trim().toLowerCase();
  if ((state.alreadyOn ?? []).some((item) => item.toLowerCase() === email)) return null;
  state.alreadyOn = [...(state.alreadyOn ?? []), email];
  const row: PresencePing = { email, name: input.name, path: input.path, at: now };
  state.waiting = [...(state.waiting ?? []), row];
  save(state);
  return row;
}

export function takeArrivals(viewerEmail: string): PresencePing[] {
  const state = load();
  const next = (state.waiting ?? []).filter((row) => row.email.toLowerCase() !== viewerEmail.trim().toLowerCase());
  state.waiting = [];
  save(state);
  return next;
}

export function listSeats(viewerEmail?: string, now = Date.now()): Array<PresenceSeat & { live: boolean }> {
  const state = load();
  prune(state, now);
  save(state);
  return (state.seats ?? [])
    .filter((row) => !hiddenFromList(row.email, viewerEmail))
    .map((row) => ({ ...row, live: isPresenceLive(row.lastAt, now) }))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.lastAt - a.lastAt);
}

export function alreadySignedIn(email: string) {
  const state = load();
  return (state.alreadyOn ?? []).some((item) => item.toLowerCase() === email.trim().toLowerCase());
}

export function markSignedOut(email: string) {
  const state = load();
  const key = email.trim().toLowerCase();
  state.alreadyOn = (state.alreadyOn ?? []).filter((item) => item.toLowerCase() !== key);
  state.seats = (state.seats ?? []).filter((row) => row.email.toLowerCase() !== key);
  state.waiting = (state.waiting ?? []).filter((row) => row.email.toLowerCase() !== key);
  save(state);
}

export function seatFor(email: string): PresenceSeat | undefined {
  const state = load();
  const key = email.trim().toLowerCase();
  return (state.seats ?? []).find((row) => row.email.toLowerCase() === key);
}
