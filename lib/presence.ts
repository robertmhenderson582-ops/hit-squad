export type PresencePing = {
  email: string;
  name: string;
  path: string;
  at: number;
};

const alreadyOn = new Set<string>();
const waiting: PresencePing[] = [];

export function pingPresence(input: { email: string; name: string; path: string }): PresencePing | null {
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

export function alreadySignedIn(email: string) {
  return alreadyOn.has(email);
}
