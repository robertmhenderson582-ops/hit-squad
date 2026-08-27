import type { DeskTicket } from "./tickets";

export const TICKET_CACHE_PREFIX = "hs_tickets_v1:";

export function ticketCacheKey(who: string) {
  return `${TICKET_CACHE_PREFIX}${who.trim().toLowerCase()}`;
}

export function readTicketCache(who: string): DeskTicket[] {
  if (typeof window === "undefined" || !who) return [];
  try {
    const raw = window.localStorage.getItem(ticketCacheKey(who));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { tickets?: DeskTicket[] };
    return Array.isArray(parsed.tickets) ? parsed.tickets : [];
  } catch {
    return [];
  }
}

export function writeTicketCache(who: string, tickets: DeskTicket[]) {
  if (typeof window === "undefined" || !who) return;
  const key = ticketCacheKey(who);
  try {
    window.localStorage.setItem(key, JSON.stringify({ tickets }));
    return;
  } catch {
    // Quota — try again without huge captures rather than wiping the previous list.
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        tickets: tickets.map((row) =>
          row.capture && row.capture.length > 80_000 ? { ...row, capture: null } : row,
        ),
      }),
    );
  } catch {
    // Keep the previous cache rather than wiping it.
  }
}

function richer(left: DeskTicket, right: DeskTicket): DeskTicket {
  return {
    ...left,
    ...right,
    capture: right.capture || left.capture,
    note: right.note || left.note,
    notifyFix: right.notifyFix ?? left.notifyFix,
    later: Boolean(right.later || left.later),
  };
}

/** Union by id. Server rows land first, local-only rows stay, same-id keeps the richer row. */
export function mergeTickets(server: DeskTicket[], local: DeskTicket[]): DeskTicket[] {
  const map = new Map<string, DeskTicket>();
  for (const row of server) map.set(row.id, row);
  for (const row of local) {
    const existing = map.get(row.id);
    map.set(row.id, existing ? richer(existing, row) : row);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function rememberTicket(who: string, ticket: DeskTicket): DeskTicket[] {
  const next = mergeTickets([], [ticket, ...readTicketCache(who)]);
  writeTicketCache(who, next);
  return next;
}

export function patchCachedTicket(
  who: string,
  id: string,
  patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>,
): DeskTicket[] {
  const next = readTicketCache(who).map((row) => (row.id === id ? { ...row, ...patch } : row));
  writeTicketCache(who, next);
  return next;
}

export function removeCachedTicket(who: string, id: string): DeskTicket[] {
  const next = readTicketCache(who).filter((row) => row.id !== id);
  writeTicketCache(who, next);
  return next;
}

export function removeCachedDone(who: string): DeskTicket[] {
  const next = readTicketCache(who).filter((row) => !row.done);
  writeTicketCache(who, next);
  return next;
}

export function hydrateTickets(
  server: DeskTicket[],
  who: string,
  seeAll: boolean,
  opts?: { persist?: boolean },
): DeskTicket[] {
  const persist = opts?.persist !== false;
  const local = who && persist ? readTicketCache(who) : [];
  const merged = persist ? mergeTickets(server, local) : [...server];
  // Always persist the union on the signed-in desk. Owner View as must not
  // write a filtered list into that cache.
  if (who && persist) writeTicketCache(who, merged);
  return ticketsForViewer(merged, who, seeAll);
}

export function ticketsForViewer(
  tickets: DeskTicket[],
  who: string | undefined,
  seeAll: boolean,
): DeskTicket[] {
  if (seeAll) return [...tickets];
  if (!who) return [];
  return tickets.filter((row) => row.who === who);
}
