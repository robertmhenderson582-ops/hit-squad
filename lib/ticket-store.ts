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

function richerTicket(left: DeskTicket, right: DeskTicket): DeskTicket {
  return {
    ...left,
    ...right,
    capture: right.capture || left.capture,
    note: right.note || left.note,
    notifyFix: right.notifyFix ?? left.notifyFix,
    later: Boolean(right.later || left.later),
    done: Boolean(right.done || left.done),
  };
}

/** Union by id. Vault rows land first, incoming rows stay, same-id keeps the richer row. */
export function mergeStoredTickets(vault: DeskTicket[], incoming: DeskTicket[]): DeskTicket[] {
  const map = new Map<string, DeskTicket>();
  for (const row of vault) map.set(row.id, row);
  for (const row of incoming) {
    const existing = map.get(row.id);
    map.set(row.id, existing ? richerTicket(existing, row) : row);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

function ticketNeedsVaultWrite(vault: DeskTicket[], merged: DeskTicket[]) {
  if (merged.length !== vault.length) return true;
  const byId = new Map(vault.map((row) => [row.id, row]));
  return merged.some((row) => {
    const existing = byId.get(row.id);
    return !existing || Boolean(row.capture && !existing.capture) || Boolean(row.note && !existing.note);
  });
}

function readDiskTickets(): DeskTicket[] {
  try {
    return parseTicketFile(JSON.parse(readFileSync(ticketStorePath(), "utf8")));
  } catch {
    return [];
  }
}

async function readVaultTickets(): Promise<DeskTicket[]> {
  const drive = resolveAdapter();
  if (!drive) return [];
  return parseTicketFile(await readVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND));
}

async function persist(tickets: DeskTicket[], opts?: { removedIds?: string[] }): Promise<DeskTicket[]> {
  const removed = new Set(opts?.removedIds ?? []);
  const drive = resolveAdapter();
  if (drive) {
    const merged = mergeStoredTickets(await readVaultTickets(), tickets).filter((row) => !removed.has(row.id));
    writeCache(merged);
    await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: merged });
    return merged;
  }
  const merged = mergeStoredTickets(readDiskTickets(), tickets).filter((row) => !removed.has(row.id));
  writeCache(merged);
  return merged;
}

export async function hydrateTicketStore(): Promise<DeskTicket[]> {
  if (hydrated) return readCache();
  const cached = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultTickets();
      const merged = mergeStoredTickets(vault, cached);
      writeCache(merged);
      if (ticketNeedsVaultWrite(vault, merged)) {
        await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: merged });
      }
    } catch {
      // Keep the local cache. Never replace a richer set with a thinner vault read.
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
  const saved = await persist(tickets);
  return saved.find((row) => row.id === next.id) ?? (index >= 0 ? tickets[index] : next);
}

export async function patchStoredTicket(
  id: string,
  patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>,
): Promise<DeskTicket | null> {
  const tickets = await hydrateTicketStore();
  const row = tickets.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  const saved = await persist(tickets);
  return saved.find((item) => item.id === id) ?? row;
}

export async function removeStoredTicket(id: string) {
  const tickets = await hydrateTicketStore();
  const index = tickets.findIndex((item) => item.id === id);
  if (index < 0) return;
  tickets.splice(index, 1);
  await persist(tickets, { removedIds: [id] });
}

export async function removeStoredDoneTickets() {
  const tickets = await hydrateTicketStore();
  const removedIds = tickets.filter((row) => row.done).map((row) => row.id);
  await persist(
    tickets.filter((row) => !row.done),
    { removedIds },
  );
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

/** Warm empty instance: process cache is stale, vault/file is not wiped. */
export function staleWarmTicketInstanceForTests() {
  cache = [];
  loadedFrom = ticketStorePath();
  hydrated = true;
}

export function useTicketVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  cache = null;
  loadedFrom = null;
}
