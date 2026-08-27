import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Live heartbeat only. Leave ephemeral — do not vault presence across deploys. */

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

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_MS = 90 * 1000;

const alreadyOn = new Set<string>();
const waiting: PresencePing[] = [];
const seats = new Map<string, PresenceSeat>();
let loadedFrom: string | null = null;

export function presenceStorePath() {
  if (process.env.PRESENCE_STORE_PATH) return process.env.PRESENCE_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-presence.json";
  return join(process.cwd(), "data", "presence.json");
}

export function resetPresenceForTests(path?: string) {
  alreadyOn.clear();
  waiting.length = 0;
  seats.clear();
  loadedFrom = null;
  if (path) process.env.PRESENCE_STORE_PATH = path;
  else delete process.env.PRESENCE_STORE_PATH;
}

function hydrate() {
  const file = presenceStorePath();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { seats?: PresenceSeat[] };
    for (const row of parsed.seats ?? []) {
      if (!row?.email) continue;
      const existing = seats.get(row.email);
      if (!existing || row.lastAt >= existing.lastAt) seats.set(row.email, row);
    }
  } catch {
    if (loadedFrom !== file) seats.clear();
  }
  loadedFrom = file;
}

function persist() {
  const file = presenceStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ seats: [...seats.values()] }), "utf8");
    renameSync(tmp, file);
  } catch {
    // keep the in-memory copy
  }
}

function prune() {
  hydrate();
  const cutoff = Date.now() - DAY_MS;
  let dirty = false;
  for (const [email, seat] of seats) {
    if (seat.lastAt < cutoff) {
      seats.delete(email);
      dirty = true;
    }
  }
  if (dirty) persist();
}

export function beatPresence(input: { email: string; name: string; path: string }): PresenceSeat {
  prune();
  const now = Date.now();
  const existing = seats.get(input.email);
  const row: PresenceSeat = {
    email: input.email,
    name: input.name,
    path: input.path,
    startedAt: existing?.startedAt ?? now,
    lastAt: now,
  };
  seats.set(input.email, row);
  persist();
  return row;
}

export function pingPresence(input: { email: string; name: string; path: string }): PresencePing | null {
  beatPresence(input);
  if (alreadyOn.has(input.email)) return null;
  alreadyOn.add(input.email);
  const row: PresencePing = { ...input, at: Date.now() };
  waiting.push(row);
  return row;
}

export function takeArrivals(viewerEmail: string): PresencePing[] {
  const next = waiting.filter((row) => row.email !== viewerEmail);
  waiting.length = 0;
  return next;
}

export function listSeats(viewerEmail?: string): Array<PresenceSeat & { live: boolean }> {
  prune();
  const now = Date.now();
  return [...seats.values()]
    .filter((row) => row.email !== viewerEmail)
    .map((row) => ({ ...row, live: now - row.lastAt < IDLE_MS }))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.lastAt - a.lastAt);
}

export function alreadySignedIn(email: string) {
  return alreadyOn.has(email);
}

export function markSignedOut(email: string) {
  alreadyOn.delete(email);
  hydrate();
  seats.delete(email);
  persist();
}

export function seatFor(email: string): PresenceSeat | undefined {
  hydrate();
  return seats.get(email);
}

export const PRESENCE_IDLE_MS = IDLE_MS;
