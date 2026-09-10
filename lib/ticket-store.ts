import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TICKETS_VAULT_KIND, TICKETS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import { TICKETS_VAULT_WRITE_ERROR } from "./ticket-cache.ts";
import { isTicketKind, type DeskTicket } from "./tickets.ts";

export const OWNER_TICKET_EMAIL = "robertmhenderson582@gmail.com";
export { TICKETS_VAULT_WRITE_ERROR };

type TicketFile = { tickets?: DeskTicket[]; removedIds?: string[] };

let cache: DeskTicket[] | null = null;
let removedCache: string[] = [];
let loadedFrom: string | null = null;
let injectedAdapter: DriveAdapter | null | undefined;

/** Drive is required when configured, or when no explicit file vault is set. */
export function ticketsRequireDrive() {
  if (resolveAdapter()?.configured) return true;
  return !process.env.TICKET_STORE_PATH;
}

export function ticketStoreKind() {
  if (resolveAdapter()) return "drive";
  if (process.env.TICKET_STORE_PATH) return "server-json-file";
  if (process.env.VERCEL) return "tmp-cache";
  return "none";
}

export function ticketsStored(kind = ticketStoreKind()) {
  return kind === "drive" || kind === "server-json-file";
}

export function ticketAdapter() {
  return resolveAdapter();
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

function parseTicketRemovedIds(raw: unknown): string[] {
  const parsed = raw && typeof raw === "object" ? (raw as TicketFile) : {};
  if (!Array.isArray(parsed.removedIds)) return [];
  return [...new Set(parsed.removedIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

function readCache(): DeskTicket[] {
  const file = ticketStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    cache = parseTicketFile(raw);
    removedCache = parseTicketRemovedIds(raw);
  } catch {
    cache = [];
    removedCache = [];
  }
  loadedFrom = file;
  return cache;
}

function rememberCache(tickets: DeskTicket[], removedIds: string[] = removedCache) {
  cache = tickets;
  removedCache = [...new Set(removedIds)].filter((id) => !tickets.some((row) => row.id === id));
  loadedFrom = ticketStorePath();
}

function writeTicketFile(tickets: DeskTicket[], removedIds: string[] = removedCache) {
  rememberCache(tickets, removedIds);
  const file = ticketStorePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ tickets, removedIds: removedCache }, null, 2) + "\n", "utf8");
}

function writeCache(tickets: DeskTicket[], removedIds: string[] = removedCache) {
  rememberCache(tickets, removedIds);
  try {
    writeTicketFile(tickets, removedIds);
  } catch {
    // Best-effort cache only. A failed sidecar write must not undo a confirmed vault write.
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

function readDiskRaw(): unknown {
  try {
    return JSON.parse(readFileSync(ticketStorePath(), "utf8"));
  } catch {
    return null;
  }
}

function readDiskTickets(): DeskTicket[] {
  return parseTicketFile(readDiskRaw());
}

async function readVaultFile(): Promise<{ tickets: DeskTicket[]; removedIds: string[] } | null> {
  const drive = resolveAdapter();
  if (!drive) return null;
  const raw = await readVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND);
  if (raw == null) return null;
  return { tickets: parseTicketFile(raw), removedIds: parseTicketRemovedIds(raw) };
}

async function persist(tickets: DeskTicket[], opts?: { removedIds?: string[] }): Promise<DeskTicket[]> {
  const extraRemoved = opts?.removedIds ?? [];
  const drive = resolveAdapter();
  if (ticketsRequireDrive()) {
    if (!drive?.configured) throw new Error(TICKETS_VAULT_WRITE_ERROR);
    const vault = await readVaultFile();
    const removed = new Set([...(vault?.removedIds ?? []), ...removedCache, ...extraRemoved]);
    const merged = mergeStoredTickets(vault?.tickets ?? [], tickets).filter((row) => !removed.has(row.id));
    const tombstones = [...removed].filter((id) => !merged.some((row) => row.id === id));
    await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: merged, removedIds: tombstones });
    writeCache(merged, tombstones);
    return merged;
  }
  const disk = readDiskRaw();
  const removed = new Set([...parseTicketRemovedIds(disk), ...removedCache, ...extraRemoved]);
  const merged = mergeStoredTickets(readDiskTickets(), tickets).filter((row) => !removed.has(row.id));
  const tombstones = [...removed].filter((id) => !merged.some((row) => row.id === id));
  writeTicketFile(merged, tombstones);
  return merged;
}

export async function hydrateTicketStore(): Promise<DeskTicket[]> {
  if (ticketsRequireDrive()) {
    const drive = resolveAdapter();
    if (!drive?.configured) {
      rememberCache([], []);
      return [];
    }
    const vault = await readVaultFile();
    if (!vault) {
      rememberCache([], []);
      return [];
    }
    const removed = new Set(vault.removedIds);
    const tickets = vault.tickets.filter((row) => !removed.has(row.id));
    writeCache(tickets, [...removed]);
    return tickets;
  }
  return readCache();
}

export async function listStoredTickets(who?: string): Promise<DeskTicket[]> {
  const tickets = await hydrateTicketStore();
  if (!who) return [...tickets];
  const key = who.trim().toLowerCase();
  return tickets.filter((row) => row.who === key);
}

export async function addStoredTicket(entry: DeskTicket): Promise<DeskTicket> {
  const tickets = [...(await hydrateTicketStore())];
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
  const row = saved.find((item) => item.id === next.id);
  if (!row) throw new Error(TICKETS_VAULT_WRITE_ERROR);
  return row;
}

export async function patchStoredTicket(
  id: string,
  patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>,
): Promise<DeskTicket | null> {
  const tickets = [...(await hydrateTicketStore())];
  const row = tickets.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  const saved = await persist(tickets);
  return saved.find((item) => item.id === id) ?? null;
}

export async function removeStoredTicket(id: string) {
  const tickets = [...(await hydrateTicketStore())];
  const index = tickets.findIndex((item) => item.id === id);
  if (index < 0) return;
  tickets.splice(index, 1);
  await persist(tickets, { removedIds: [id] });
}

export async function removeStoredDoneTickets() {
  const tickets = [...(await hydrateTicketStore())];
  const removedIds = tickets.filter((row) => row.done).map((row) => row.id);
  await persist(
    tickets.filter((row) => !row.done),
    { removedIds },
  );
}

export function resetTicketStoreForTests(path?: string) {
  cache = null;
  removedCache = [];
  loadedFrom = null;
  injectedAdapter = undefined;
  if (path) process.env.TICKET_STORE_PATH = path;
  else delete process.env.TICKET_STORE_PATH;
}

export function forgetTicketCacheForTests() {
  cache = null;
  removedCache = [];
  loadedFrom = null;
  const file = ticketStorePath();
  if (existsSync(file)) unlinkSync(file);
}

/** Warm empty instance: process cache is stale, vault/file is not wiped. */
export function staleWarmTicketInstanceForTests() {
  cache = [];
  removedCache = [];
  loadedFrom = ticketStorePath();
}

export function useTicketVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  cache = null;
  removedCache = [];
  loadedFrom = null;
}
