import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DeskTicket } from "./tickets";

export const OWNER_TICKET_EMAIL = "robertmhenderson582@gmail.com";

type TicketFile = { tickets?: DeskTicket[] };

let cache: DeskTicket[] | null = null;
let loadedFrom: string | null = null;

export function ticketStoreKind() {
  return "server-json-file";
}

export function ticketStorePath() {
  if (process.env.TICKET_STORE_PATH) return process.env.TICKET_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-tickets.json";
  return join(process.cwd(), "data", "tickets.json");
}

export function resetTicketStoreForTests(path?: string) {
  cache = null;
  loadedFrom = null;
  if (path) process.env.TICKET_STORE_PATH = path;
  else delete process.env.TICKET_STORE_PATH;
}

function load(): DeskTicket[] {
  const file = ticketStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as TicketFile;
    cache = Array.isArray(parsed.tickets) ? parsed.tickets : [];
  } catch {
    cache = [];
  }
  loadedFrom = file;
  return cache;
}

function save(tickets: DeskTicket[]) {
  cache = tickets;
  const file = ticketStorePath();
  loadedFrom = file;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ tickets }, null, 2), "utf8");
}

export function listStoredTickets(who?: string): DeskTicket[] {
  const tickets = load();
  if (!who) return [...tickets];
  return tickets.filter((row) => row.who === who);
}

export function addStoredTicket(entry: DeskTicket): DeskTicket {
  const tickets = load();
  tickets.unshift(entry);
  save(tickets);
  return entry;
}

export function patchStoredTicket(
  id: string,
  patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>,
): DeskTicket | null {
  const tickets = load();
  const row = tickets.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  save(tickets);
  return row;
}

export function removeStoredTicket(id: string) {
  const tickets = load();
  const index = tickets.findIndex((item) => item.id === id);
  if (index < 0) return;
  tickets.splice(index, 1);
  save(tickets);
}

export function removeStoredDoneTickets() {
  const tickets = load().filter((row) => !row.done);
  save(tickets);
}
