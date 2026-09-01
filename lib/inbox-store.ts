import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { INBOX_VAULT_KIND, INBOX_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import {
  inboxCirclePerson,
  inboxContactsFor,
  inboxThreadKey,
  isInboxCircleEmail,
  normalizeInboxEmail,
} from "./inbox-circle.ts";
import { makeMessage, type InboxMessage, type InboxPerson, type InboxThread } from "./inbox.ts";

export type StoredInboxMessage = {
  id: string;
  threadKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  text: string;
  photo: string | null;
  sentAt: string;
  readBy: string[];
  hiddenBy: string[];
};

type InboxFile = { messages?: StoredInboxMessage[] };

let cache: StoredInboxMessage[] | null = null;
let loadedFrom: string | null = null;
let injectedAdapter: DriveAdapter | null | undefined;

export function inboxStoreKind() {
  return resolveAdapter() ? "drive" : "server-json-file";
}

export function inboxStorePath() {
  if (process.env.INBOX_STORE_PATH) return process.env.INBOX_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-inbox.json";
  return join(process.cwd(), "data", "inbox.json");
}

function circleEmails(list: string[]): string[] {
  return [...new Set(list.map((item) => normalizeInboxEmail(String(item))).filter((item) => isInboxCircleEmail(item)))];
}

export function parseInboxFile(raw: unknown): StoredInboxMessage[] {
  const parsed = raw && typeof raw === "object" ? (raw as InboxFile) : { messages: [] };
  const messages: StoredInboxMessage[] = [];
  for (const row of parsed.messages ?? []) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const fromEmail = normalizeInboxEmail(row.fromEmail);
    const toEmail = normalizeInboxEmail(row.toEmail);
    if (!isInboxCircleEmail(fromEmail) || !isInboxCircleEmail(toEmail)) continue;
    if (fromEmail === toEmail) continue;
    messages.push({
      id: row.id,
      threadKey: typeof row.threadKey === "string" && row.threadKey ? row.threadKey : inboxThreadKey(fromEmail, toEmail),
      fromEmail,
      fromName: typeof row.fromName === "string" && row.fromName.trim() ? row.fromName.trim() : fromEmail,
      toEmail,
      text: typeof row.text === "string" ? row.text : "",
      photo: typeof row.photo === "string" && row.photo.startsWith("data:") ? row.photo : null,
      sentAt: typeof row.sentAt === "string" ? row.sentAt : "",
      readBy: Array.isArray(row.readBy) ? circleEmails(row.readBy.map(String)) : [],
      hiddenBy: Array.isArray(row.hiddenBy) ? circleEmails(row.hiddenBy.map(String)) : [],
    });
  }
  return messages;
}

function richerInboxMessage(left: StoredInboxMessage, right: StoredInboxMessage): StoredInboxMessage {
  return {
    ...left,
    ...right,
    photo: right.photo || left.photo,
    text: right.text || left.text,
    fromName: right.fromName || left.fromName,
    readBy: circleEmails([...left.readBy, ...right.readBy]),
    hiddenBy: circleEmails([...left.hiddenBy, ...right.hiddenBy]),
  };
}

/** Union by id. Vault rows land first, incoming rows stay, same-id keeps the richer hide/read marks. */
export function mergeInboxMessages(vault: StoredInboxMessage[], incoming: StoredInboxMessage[]): StoredInboxMessage[] {
  const map = new Map<string, StoredInboxMessage>();
  for (const row of vault) map.set(row.id, row);
  for (const row of incoming) {
    const existing = map.get(row.id);
    map.set(row.id, existing ? richerInboxMessage(existing, row) : row);
  }
  return [...map.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
}

function readCache(): StoredInboxMessage[] {
  const file = inboxStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    cache = parseInboxFile(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    cache = [];
  }
  loadedFrom = file;
  return cache;
}

function writeCache(messages: StoredInboxMessage[]) {
  cache = messages;
  const file = inboxStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ messages }, null, 2) + "\n", "utf8");
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.INBOX_STORE_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

function readDiskMessages(): StoredInboxMessage[] {
  try {
    return parseInboxFile(JSON.parse(readFileSync(inboxStorePath(), "utf8")));
  } catch {
    return [];
  }
}

async function readVaultMessages(): Promise<StoredInboxMessage[]> {
  const drive = resolveAdapter();
  if (!drive) return [];
  try {
    return parseInboxFile(await readVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND));
  } catch {
    return [];
  }
}

async function persist(messages: StoredInboxMessage[]): Promise<StoredInboxMessage[]> {
  const drive = resolveAdapter();
  if (drive) {
    const merged = mergeInboxMessages(await readVaultMessages(), messages);
    writeCache(merged);
    await writeVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND, { messages: merged });
    return merged;
  }
  const merged = mergeInboxMessages(readDiskMessages(), messages);
  writeCache(merged);
  return merged;
}

export async function hydrateInboxStore(): Promise<StoredInboxMessage[]> {
  const cached = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultMessages();
      const merged = mergeInboxMessages(vault, cached);
      writeCache(merged);
      if (!vault.length && cached.length) {
        await writeVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND, { messages: merged });
      }
    } catch {
      // Keep the local cache.
    }
    return readCache();
  }
  const merged = mergeInboxMessages(readDiskMessages(), cached);
  writeCache(merged);
  return readCache();
}

function otherEmail(message: StoredInboxMessage, me: string) {
  return message.fromEmail === me ? message.toEmail : message.fromEmail;
}

export function threadsForInboxEmail(email: string, messages: StoredInboxMessage[]): InboxThread[] {
  const me = normalizeInboxEmail(email);
  if (!isInboxCircleEmail(me)) return [];
  const grouped = new Map<string, StoredInboxMessage[]>();
  for (const message of messages) {
    if (message.hiddenBy.includes(me)) continue;
    if (message.fromEmail !== me && message.toEmail !== me) continue;
    const list = grouped.get(message.threadKey) ?? [];
    list.push(message);
    grouped.set(message.threadKey, list);
  }
  const threads: InboxThread[] = [];
  for (const [threadKey, rows] of grouped) {
    const peerEmail = otherEmail(rows[0], me);
    const peer = inboxCirclePerson(peerEmail);
    if (!peer) continue;
    const sorted = [...rows].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
    const mapped: InboxMessage[] = sorted.map((row) => ({
      id: row.id,
      from: row.fromEmail === me ? "self" : "them",
      author: row.fromName,
      text: row.text,
      photo: row.photo,
      sentAt: row.sentAt,
      readAt: row.readBy.includes(peerEmail) && row.fromEmail === me ? row.sentAt : null,
    }));
    const unread = sorted.filter((row) => row.toEmail === me && !row.readBy.includes(me)).length;
    threads.push({
      id: `th-circle-${threadKey.replace("|", "--")}`,
      personId: peer.id,
      name: peer.name,
      company: peer.company,
      unread,
      messages: mapped,
    });
  }
  return threads.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listInboxFor(email: string): Promise<InboxThread[]> {
  if (!isInboxCircleEmail(email)) return [];
  return threadsForInboxEmail(email, await hydrateInboxStore());
}

export async function postInboxMessage(input: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  text?: string;
  photo?: string | null;
}): Promise<{ ok: true; threads: InboxThread[] } | { ok: false; status: number; error: string }> {
  const fromEmail = normalizeInboxEmail(input.fromEmail);
  const toEmail = normalizeInboxEmail(input.toEmail);
  if (!isInboxCircleEmail(fromEmail) || !isInboxCircleEmail(toEmail)) {
    return { ok: false, status: 403, error: "Inbox is those six only." };
  }
  if (fromEmail === toEmail) {
    return { ok: false, status: 400, error: "Pick a person." };
  }
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const photo = typeof input.photo === "string" && input.photo.startsWith("data:") ? input.photo : null;
  if (!text && !photo) {
    return { ok: false, status: 400, error: "Write a message." };
  }
  const local = makeMessage({
    from: "self",
    author: input.fromName.trim() || inboxCirclePerson(fromEmail)?.name || fromEmail,
    text,
    photo,
  });
  const messages = await hydrateInboxStore();
  const next = await persist([
    ...messages,
    {
      id: local.id,
      threadKey: inboxThreadKey(fromEmail, toEmail),
      fromEmail,
      fromName: local.author,
      toEmail,
      text,
      photo,
      sentAt: local.sentAt,
      readBy: [fromEmail],
      hiddenBy: [],
    },
  ]);
  return { ok: true, threads: threadsForInboxEmail(fromEmail, next) };
}

function hideRowsFor(messages: StoredInboxMessage[], me: string, match: (row: StoredInboxMessage) => boolean) {
  let changed = false;
  for (const row of messages) {
    if (!match(row) || row.hiddenBy.includes(me)) continue;
    row.hiddenBy.push(me);
    changed = true;
  }
  return changed;
}

export async function hideInboxFor(
  email: string,
  input: { messageId?: string; personId?: string; personIds?: string[]; empty?: boolean },
): Promise<InboxThread[]> {
  const me = normalizeInboxEmail(email);
  if (!isInboxCircleEmail(me)) return [];
  const messages = await hydrateInboxStore();
  let changed = false;
  if (input.empty) {
    changed = hideRowsFor(messages, me, (row) => row.fromEmail === me || row.toEmail === me);
  } else if (typeof input.messageId === "string" && input.messageId.trim()) {
    const id = input.messageId.trim();
    changed = hideRowsFor(messages, me, (row) => row.id === id && (row.fromEmail === me || row.toEmail === me));
  } else {
    const personIds = [
      ...(typeof input.personId === "string" && input.personId.trim() ? [input.personId.trim()] : []),
      ...(Array.isArray(input.personIds) ? input.personIds.map((id) => String(id).trim()).filter(Boolean) : []),
    ];
    const peers = new Set(
      personIds
        .map((id) => inboxContactsFor(me).find((row) => row.id === id)?.email)
        .filter((value): value is string => Boolean(value)),
    );
    if (peers.size) {
      changed = hideRowsFor(
        messages,
        me,
        (row) => (row.fromEmail === me || row.toEmail === me) && peers.has(otherEmail(row, me)),
      );
    }
  }
  const next = changed ? await persist(messages) : messages;
  return threadsForInboxEmail(me, next);
}

export async function markInboxThreadRead(email: string, personId: string): Promise<InboxThread[]> {
  const me = normalizeInboxEmail(email);
  if (!isInboxCircleEmail(me)) return [];
  const peer = inboxContactsFor(me).find((row) => row.id === personId);
  if (!peer) return listInboxFor(me);
  const messages = await hydrateInboxStore();
  let changed = false;
  for (const row of messages) {
    if (row.toEmail !== me || row.fromEmail !== peer.email) continue;
    if (row.readBy.includes(me)) continue;
    row.readBy.push(me);
    changed = true;
  }
  const next = changed ? await persist(messages) : messages;
  return threadsForInboxEmail(me, next);
}

export function inboxPeopleFor(email: string): InboxPerson[] {
  return inboxContactsFor(email).map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
  }));
}

export function resetInboxStoreForTests(path?: string) {
  cache = null;
  loadedFrom = null;
  injectedAdapter = undefined;
  if (path) process.env.INBOX_STORE_PATH = path;
  else delete process.env.INBOX_STORE_PATH;
}

export function forgetInboxCacheForTests() {
  cache = null;
  loadedFrom = null;
  const file = inboxStorePath();
  if (existsSync(file)) unlinkSync(file);
}

/** Warm empty instance: process cache is stale, vault/file is not wiped. */
export function staleWarmInboxInstanceForTests() {
  cache = [];
  loadedFrom = inboxStorePath();
}

export function useInboxVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  cache = null;
  loadedFrom = null;
}
