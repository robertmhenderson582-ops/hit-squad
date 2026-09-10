import type { DeskTicket } from "./tickets";

export const TICKET_CACHE_PREFIX = "hs_tickets_v1:";

/** Client-safe tickets vault copy. No Drive / Node imports. */
export const TICKETS_VAULT_WRITE_ERROR =
  "Could not save to the tickets vault. That ticket is only on this desk. Try again.";
export const TICKET_UNVAULTED_MARK = "on this desk only — not saved yet";

export type ListedTicket = DeskTicket & { vaulted: boolean };

export function ticketsVaultStored(store?: string | null, stored?: boolean) {
  return (store === "drive" || store === "server-json-file") && stored !== false;
}

export function ticketsVaultLeaks(payload: unknown) {
  return /tickets\.json|1s4D47FvkOm1G8qYVP3|DRIVE_TICKETS|owner vault/i.test(JSON.stringify(payload ?? ""));
}

export function mergeVaultedTickets(vault: DeskTicket[], local: DeskTicket[]): ListedTicket[] {
  const listed: ListedTicket[] = [];
  const seen = new Set<string>();
  for (const row of vault) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    listed.push({ ...row, vaulted: true });
  }
  for (const row of local) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    listed.push({ ...row, vaulted: false });
  }
  return listed.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

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
  opts?: { persist?: boolean; store?: string | null; stored?: boolean },
): ListedTicket[] {
  const persist = opts?.persist !== false;
  const confirmed = ticketsVaultStored(opts?.store, opts?.stored);
  const local = who && persist ? readTicketCache(who) : [];
  const listed = mergeVaultedTickets(confirmed ? server : [], persist ? local : server);
  // Only persist vault-confirmed rows. Owner View as must not write a filtered list.
  if (who && persist && confirmed) {
    writeTicketCache(
      who,
      listed.filter((row) => row.vaulted),
    );
  }
  return ticketsForViewer(listed, who, seeAll);
}

export function ticketsForViewer<T extends DeskTicket>(
  tickets: T[],
  who: string | undefined,
  seeAll: boolean,
): T[] {
  if (seeAll) return [...tickets];
  if (!who) return [];
  return tickets.filter((row) => row.who === who);
}
