import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TICKETS_VAULT_KIND, TICKETS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { isTicketKind, type DeskTicket } from "./tickets.ts";

export const OWNER_TICKET_EMAIL = "robertmhenderson582@gmail.com";

type TicketFile = { tickets?: DeskTicket[] };

let cache: DeskTicket[] | null = null;
let loadedFrom: string | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function ticketStoreKind() {
  return resolveAdapter() ? "drive" : "server-json-file";
}

export function ticketStorePath() {
  if (process.env.TICKET_STORE_PATH) return process.env.TICKET_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-tickets.json";
  return join(process.cwd(), "data", "tickets.json");
}

export function parseTicketFile(raw: unknown): DeskTicket[] {
  const parsed = raw && typeof raw === "object" ? (raw as TicketFile) : { tickets: [] };
  const tickets: DeskTicket[] = [];
  for (const row of parsed.tickets ?? []) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (!isTicketKind(row.kind)) continue;
    if (typeof row.who !== "string" || !row.who.trim()) continue;
    tickets.push({
      id: row.id,
      kind: row.kind,
      note: typeof row.note === "string" ? row.note : "",
      capture: typeof row.capture === "string" ? row.capture : null,
      later: Boolean(row.later),
      done: Boolean(row.done),
      notifyFix: row.notifyFix === true || row.notifyFix === false ? row.notifyFix : null,
      at: typeof row.at === "string" ? row.at : "",
      who: row.who.trim().toLowerCase(),
    });
  }
  return tickets;
}

function readCache(): DeskTicket[] {
  const file = ticketStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    cache = parseTicketFile(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    cache = [];
  }
  loadedFrom = file;
  return cache;
}

function writeCache(tickets: DeskTicket[]) {
  cache = tickets;
  const file = ticketStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ tickets }, null, 2) + "\n", "utf8");
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.TICKET_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(tickets: DeskTicket[]) {
  writeCache(tickets);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets });
}

export async function hydrateTicketStore(): Promise<DeskTicket[]> {
  if (hydrated) return readCache();
  const cached = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = parseTicketFile(await readVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND));
      if (vault.length) writeCache(vault);
      else if (cached.length) await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: cached });
    } catch {
      // Keep the local cache.
    }
  }
  hydrated = true;
  return readCache();
}

export async function listStoredTickets(who?: string): Promise<DeskTicket[]> {
  const tickets = await hydrateTicketStore();
  if (!who) return [...tickets];
  const key = who.trim().toLowerCase();
  return tickets.filter((row) => row.who === key);
}

export async function addStoredTicket(entry: DeskTicket): Promise<DeskTicket> {
  const tickets = await hydrateTicketStore();
  const index = tickets.findIndex((row) => row.id === entry.id);
  const next: DeskTicket = {
    ...entry,
    who: entry.who.trim().toLowerCase(),
  };
  if (index >= 0) {
    tickets[index] = {
      ...tickets[index],
      ...next,
      capture: next.capture || tickets[index].capture,
      note: next.note || tickets[index].note,
    };
  } else {
    tickets.unshift(next);
  }
  await persist(tickets);
  return index >= 0 ? tickets[index] : next;
}

export async function patchStoredTicket(
  id: string,
  patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>,
): Promise<DeskTicket | null> {
  const tickets = await hydrateTicketStore();
  const row = tickets.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  await persist(tickets);
  return row;
}

export async function removeStoredTicket(id: string) {
  const tickets = await hydrateTicketStore();
  const index = tickets.findIndex((item) => item.id === id);
  if (index < 0) return;
  tickets.splice(index, 1);
  await persist(tickets);
}

export async function removeStoredDoneTickets() {
  await persist((await hydrateTicketStore()).filter((row) => !row.done));
}

export function resetTicketStoreForTests(path?: string) {
  cache = null;
  loadedFrom = null;
  hydrated = false;
  injectedAdapter = undefined;
  if (path) process.env.TICKET_STORE_PATH = path;
  else delete process.env.TICKET_STORE_PATH;
}

export function forgetTicketCacheForTests() {
  cache = null;
  loadedFrom = null;
  hydrated = false;
  const file = ticketStorePath();
  if (existsSync(file)) unlinkSync(file);
}

export function useTicketVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  cache = null;
  loadedFrom = null;
}
