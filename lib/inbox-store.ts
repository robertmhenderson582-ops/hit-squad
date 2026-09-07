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
import {
  acceptedInboxMessageId,
  acceptedInboxPhoto,
  makeMessage,
  type InboxMessage,
  type InboxPerson,
  type InboxThread,
} from "./inbox.ts";
import { DESK_PERSON_ID } from "./whats-new.ts";

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

/** Per-seat delete tombstones. Vault union wins over a stale device that still has the row. */
export type StoredInboxHides = {
  email: string;
  messageIds: string[];
  personIds: string[];
};

type InboxFile = { messages?: StoredInboxMessage[]; hides?: StoredInboxHides[] };

let cache: StoredInboxMessage[] | null = null;
let hideCache: StoredInboxHides[] = [];
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

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

function normalizeHideRow(row: Partial<StoredInboxHides> | null | undefined): StoredInboxHides | null {
  if (!row || typeof row !== "object") return null;
  const email = normalizeInboxEmail(String(row.email ?? ""));
  if (!isInboxCircleEmail(email)) return null;
  return {
    email,
    messageIds: stringIds(row.messageIds),
    personIds: stringIds(row.personIds).filter((id) => id !== DESK_PERSON_ID),
  };
}

export function hidesFromMessages(messages: StoredInboxMessage[]): StoredInboxHides[] {
  const map = new Map<string, Set<string>>();
  for (const row of messages) {
    for (const email of row.hiddenBy) {
      const set = map.get(email) ?? new Set<string>();
      set.add(row.id);
      map.set(email, set);
    }
  }
  return [...map.entries()].map(([email, ids]) => ({ email, messageIds: [...ids], personIds: [] }));
}

/** Union by seat. A stale device cannot drop a vault hide. */
export function mergeInboxHides(vault: StoredInboxHides[], incoming: StoredInboxHides[]): StoredInboxHides[] {
  const map = new Map<string, StoredInboxHides>();
  for (const row of [...vault, ...incoming]) {
    const email = normalizeInboxEmail(row.email);
    if (!isInboxCircleEmail(email)) continue;
    const existing = map.get(email) ?? { email, messageIds: [], personIds: [] };
    map.set(email, {
      email,
      messageIds: [...new Set([...existing.messageIds, ...row.messageIds])],
      personIds: [...new Set([...existing.personIds, ...row.personIds])].filter((id) => id !== DESK_PERSON_ID),
    });
  }
  return [...map.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function parseInboxHides(raw: unknown, messages?: StoredInboxMessage[]): StoredInboxHides[] {
  const parsed = raw && typeof raw === "object" ? (raw as InboxFile) : {};
  const listed: StoredInboxHides[] = [];
  for (const row of parsed.hides ?? []) {
    const next = normalizeHideRow(row);
    if (next) listed.push(next);
  }
  return mergeInboxHides(listed, hidesFromMessages(messages ?? parseInboxFile(raw)));
}

/** Re-apply tombstones onto hiddenBy so a smash without hiddenBy still stays hidden. */
export function applyInboxHideTombstones(messages: StoredInboxMessage[], hides: StoredInboxHides[]): StoredInboxMessage[] {
  const byMessage = new Map<string, Set<string>>();
  for (const hide of hides) {
    for (const id of hide.messageIds) {
      const emails = byMessage.get(id) ?? new Set<string>();
      emails.add(hide.email);
      byMessage.set(id, emails);
    }
  }
  return messages.map((row) => {
    const extra = byMessage.get(row.id);
    if (!extra) return row;
    const hiddenBy = circleEmails(
      [...row.hiddenBy, ...extra].filter((email) => email === row.fromEmail || email === row.toEmail),
    );
    return hiddenBy.length === row.hiddenBy.length && hiddenBy.every((email) => row.hiddenBy.includes(email))
      ? row
      : { ...row, hiddenBy };
  });
}

export function inboxHidesFor(email: string): { messageIds: string[]; personIds: string[] } {
  const me = normalizeInboxEmail(email);
  const row = hideCache.find((item) => item.email === me);
  return {
    messageIds: [...(row?.messageIds ?? [])],
    personIds: [...(row?.personIds ?? [])],
  };
}

function hideFingerprint(hides: StoredInboxHides[]) {
  return hides
    .map((row) => `${row.email}:${[...row.messageIds].sort().join(",")}:${[...row.personIds].sort().join(",")}`)
    .sort()
    .join("|");
}

function rememberHide(email: string, patch: { messageIds?: string[]; personIds?: string[] }) {
  hideCache = mergeInboxHides(hideCache, [
    {
      email,
      messageIds: patch.messageIds ?? [],
      personIds: patch.personIds ?? [],
    },
  ]);
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
      photo: acceptedInboxPhoto(row.photo),
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

function readDiskRaw(): unknown {
  try {
    return JSON.parse(readFileSync(inboxStorePath(), "utf8"));
  } catch {
    return null;
  }
}

function readCache(): StoredInboxMessage[] {
  const file = inboxStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    cache = parseInboxFile(raw);
    hideCache = parseInboxHides(raw, cache);
  } catch {
    cache = [];
    hideCache = [];
  }
  loadedFrom = file;
  return cache;
}

function writeCache(messages: StoredInboxMessage[], hides: StoredInboxHides[] = hideCache) {
  cache = messages;
  hideCache = mergeInboxHides(hides, hidesFromMessages(messages));
  const file = inboxStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ messages, hides: hideCache }, null, 2) + "\n", "utf8");
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

async function readVaultRaw(): Promise<unknown> {
  const drive = resolveAdapter();
  if (!drive) return null;
  return readVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND);
}

function inboxNeedsVaultWrite(
  vault: StoredInboxMessage[],
  merged: StoredInboxMessage[],
  vaultHides: StoredInboxHides[],
  mergedHides: StoredInboxHides[],
) {
  if (merged.length !== vault.length) return true;
  if (hideFingerprint(mergedHides) !== hideFingerprint(vaultHides)) return true;
  const byId = new Map(vault.map((row) => [row.id, row]));
  return merged.some((row) => {
    const existing = byId.get(row.id);
    return (
      !existing ||
      row.hiddenBy.length > existing.hiddenBy.length ||
      row.readBy.length > existing.readBy.length ||
      Boolean(row.photo && !existing.photo) ||
      Boolean(row.text && !existing.text)
    );
  });
}

function foldInboxState(baseMessages: StoredInboxMessage[], incoming: StoredInboxMessage[], baseHides: StoredInboxHides[]) {
  const hides = mergeInboxHides(baseHides, hideCache);
  const merged = applyInboxHideTombstones(mergeInboxMessages(baseMessages, incoming), hides);
  return { merged, hides };
}

async function persist(messages: StoredInboxMessage[]): Promise<StoredInboxMessage[]> {
  const drive = resolveAdapter();
  if (drive) {
    const raw = await readVaultRaw();
    const vaultMessages = parseInboxFile(raw);
    const { merged, hides } = foldInboxState(vaultMessages, messages, parseInboxHides(raw, vaultMessages));
    writeCache(merged, hides);
    await writeVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND, { messages: merged, hides });
    return merged;
  }
  const raw = readDiskRaw();
  const diskMessages = parseInboxFile(raw);
  const { merged, hides } = foldInboxState(diskMessages, messages, parseInboxHides(raw, diskMessages));
  writeCache(merged, hides);
  return merged;
}

export async function hydrateInboxStore(): Promise<StoredInboxMessage[]> {
  const cached = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultRaw();
      const vault = parseInboxFile(raw);
      const vaultHides = parseInboxHides(raw, vault);
      const { merged, hides } = foldInboxState(vault, cached, vaultHides);
      writeCache(merged, hides);
      if (inboxNeedsVaultWrite(vault, merged, vaultHides, hides)) {
        await writeVaultJson(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND, { messages: merged, hides });
      }
    } catch {
      // Keep the local cache. Never replace a richer set with a thinner vault read.
    }
    return readCache();
  }
  const raw = readDiskRaw();
  const disk = parseInboxFile(raw);
  const { merged, hides } = foldInboxState(disk, cached, parseInboxHides(raw, disk));
  writeCache(merged, hides);
  return readCache();
}

function otherEmail(message: StoredInboxMessage, me: string) {
  return message.fromEmail === me ? message.toEmail : message.fromEmail;
}

export function threadsForInboxEmail(email: string, messages: StoredInboxMessage[]): InboxThread[] {
  const me = normalizeInboxEmail(email);
  if (!isInboxCircleEmail(me)) return [];
  const hiddenIds = new Set(inboxHidesFor(me).messageIds);
  const grouped = new Map<string, StoredInboxMessage[]>();
  for (const message of messages) {
    if (message.hiddenBy.includes(me) || hiddenIds.has(message.id)) continue;
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
  id?: string;
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
  const photo = acceptedInboxPhoto(input.photo);
  if (input.photo && !photo) {
    return { ok: false, status: 400, error: "Could not attach. Try again." };
  }
  if (!text && !photo) {
    return { ok: false, status: 400, error: "Write a message." };
  }
  const local = makeMessage({
    from: "self",
    author: input.fromName.trim() || inboxCirclePerson(fromEmail)?.name || fromEmail,
    text,
    photo,
  });
  const id = acceptedInboxMessageId(input.id) || local.id;
  const messages = await hydrateInboxStore();
  if (messages.some((row) => row.id === id)) {
    const next = await persist(messages);
    return { ok: true, threads: threadsForInboxEmail(fromEmail, next) };
  }
  const next = await persist([
    ...messages,
    {
      id,
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
  const hidesBefore = hideFingerprint(hideCache);
  let changed = false;
  if (input.empty) {
    const mine = messages.filter((row) => row.fromEmail === me || row.toEmail === me);
    changed = hideRowsFor(messages, me, (row) => row.fromEmail === me || row.toEmail === me);
    rememberHide(me, {
      messageIds: mine.map((row) => row.id),
      personIds: [
        ...new Set(
          mine
            .map((row) => inboxCirclePerson(otherEmail(row, me))?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    });
  } else if (typeof input.messageId === "string" && input.messageId.trim()) {
    const id = input.messageId.trim();
    changed = hideRowsFor(messages, me, (row) => row.id === id && (row.fromEmail === me || row.toEmail === me));
    rememberHide(me, { messageIds: [id] });
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
      const mine = messages.filter(
        (row) => (row.fromEmail === me || row.toEmail === me) && peers.has(otherEmail(row, me)),
      );
      changed = hideRowsFor(
        messages,
        me,
        (row) => (row.fromEmail === me || row.toEmail === me) && peers.has(otherEmail(row, me)),
      );
      rememberHide(me, {
        messageIds: mine.map((row) => row.id),
        personIds: personIds.filter((id) => inboxContactsFor(me).some((row) => row.id === id)),
      });
    }
  }
  const hideChanged = hideFingerprint(hideCache) !== hidesBefore;
  const next = changed || hideChanged ? await persist(messages) : messages;
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
  hideCache = [];
  loadedFrom = null;
  injectedAdapter = undefined;
  if (path) process.env.INBOX_STORE_PATH = path;
  else delete process.env.INBOX_STORE_PATH;
}

export function forgetInboxCacheForTests() {
  cache = null;
  hideCache = [];
  loadedFrom = null;
  const file = inboxStorePath();
  if (existsSync(file)) unlinkSync(file);
}

/** Warm empty instance: process cache is stale, vault/file is not wiped. */
export function staleWarmInboxInstanceForTests() {
  cache = [];
  hideCache = [];
  loadedFrom = inboxStorePath();
}

export function useInboxVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  cache = null;
  hideCache = [];
  loadedFrom = null;
}
