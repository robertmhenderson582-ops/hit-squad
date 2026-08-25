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

function prune() {
  const cutoff = Date.now() - DAY_MS;
  for (const [email, seat] of seats) {
    if (seat.lastAt < cutoff) seats.delete(email);
  }
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
  seats.delete(email);
}

export function seatFor(email: string): PresenceSeat | undefined {
  return seats.get(email);
}

export const PRESENCE_IDLE_MS = IDLE_MS;
