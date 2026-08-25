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
  window.localStorage.setItem(ticketCacheKey(who), JSON.stringify({ tickets }));
}

export function mergeTickets(server: DeskTicket[], local: DeskTicket[]): DeskTicket[] {
  const map = new Map<string, DeskTicket>();
  for (const row of local) map.set(row.id, row);
  for (const row of server) map.set(row.id, row);
  return [...map.values()].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
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
