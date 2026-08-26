import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasBuildDesk, isOwner, NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_CONTACT, type InboxMessage, type InboxPerson, type InboxThread } from "./inbox.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { listExtraSeats } from "./seat-store.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export type StoredInboxMessage = {
  id: string;
  fromEmail: string;
  fromName: string;
  text: string;
  photo: string | null;
  sentAt: number;
  deliveredTo: string[];
  readBy: string[];
};

export type StoredInboxThread = {
  id: string;
  testerEmail: string;
  testerName: string;
  messages: StoredInboxMessage[];
};

export type InboxSeatView = {
  hiddenMessageIds: string[];
  clearedAt: Record<string, number>;
};

type InboxFile = {
  threads?: StoredInboxThread[];
  views?: Record<string, InboxSeatView>;
};

type Viewer = { email: string; name: string; role: string };

let cache: InboxFile | null = null;
let loadedFrom: string | null = null;

export function inboxStoreKind() {
  return "server-json-file";
}

export function inboxStorePath() {
  if (process.env.INBOX_STORE_PATH) return process.env.INBOX_STORE_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-inbox.json";
  return join(process.cwd(), "data", "inbox.json");
}

export function resetInboxStoreForTests(path?: string) {
  cache = null;
  loadedFrom = null;
  if (path) {
    process.env.INBOX_STORE_PATH = path;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ threads: [], views: {} }, null, 2), "utf8");
    } catch {
      // next load starts empty
    }
  } else delete process.env.INBOX_STORE_PATH;
}

function emptyView(): InboxSeatView {
  return { hiddenMessageIds: [], clearedAt: {} };
}

function emptyFile(): InboxFile {
  return { threads: [], views: {} };
}

function load(): InboxFile {
  const file = inboxStorePath();
  if (cache && loadedFrom === file) return cache;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as InboxFile;
    cache = {
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      views: parsed.views && typeof parsed.views === "object" ? parsed.views : {},
    };
  } catch {
    cache = emptyFile();
  }
  loadedFrom = file;
  return cache;
}

function save(next: InboxFile) {
  cache = next;
  const file = inboxStorePath();
  loadedFrom = file;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    renameSync(tmp, file);
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function norm(email: string) {
  return email.trim().toLowerCase();
}

function viewOf(state: InboxFile, email: string): InboxSeatView {
  const key = norm(email);
  return state.views?.[key] ? { ...emptyView(), ...state.views[key] } : emptyView();
}

function writeView(state: InboxFile, email: string, view: InboxSeatView) {
  state.views = { ...(state.views || {}), [norm(email)]: view };
}

export function threadIdForTester(email: string) {
  return `th:${norm(email)}`;
}

export function listInboxTesters(): InboxPerson[] {
  const seen = new Set<string>();
  const rows: InboxPerson[] = [];
  for (const seat of [...TESTER_SEATS, ...listExtraSeats()]) {
    const email = norm(seat.email);
    if (!email || email === NOVUS_EMAIL || email === OWNER_LOGIN_EMAIL || seen.has(email)) continue;
    seen.add(email);
    rows.push({ id: email, name: seat.name, company: "Hit Squad" });
  }
  return rows;
}

export function inboxContactsFor(viewer: Viewer): InboxPerson[] {
  if (isOwner(viewer) || hasBuildDesk(viewer)) return listInboxTesters();
  return [OWNER_CONTACT];
}

function testerName(email: string) {
  return listInboxTesters().find((row) => row.id === norm(email))?.name || email;
}

function isInboxTester(email: string) {
  return listInboxTesters().some((row) => row.id === norm(email));
}

function resolveTesterEmail(viewer: Viewer, to: string) {
  const target = norm(to);
  if (isOwner(viewer) || hasBuildDesk(viewer)) {
    if (target === "owner" || target === OWNER_LOGIN_EMAIL) return null;
    const contact = listInboxTesters().find((row) => row.id === target || row.name.toLowerCase() === target);
    return contact?.id ?? (isInboxTester(target) ? target : null);
  }
  if (target === "owner" || target === OWNER_LOGIN_EMAIL || !target) return norm(viewer.email);
  return null;
}

function visibleMessages(thread: StoredInboxThread, viewerEmail: string, view: InboxSeatView) {
  const email = norm(viewerEmail);
  const cleared = view.clearedAt[thread.id] || 0;
  const hidden = new Set(view.hiddenMessageIds);
  return thread.messages.filter((message) => {
    if (hidden.has(message.id)) return false;
    if (message.sentAt <= cleared) return false;
    if (isInboxTester(email) && message.fromEmail !== email && message.fromEmail !== OWNER_LOGIN_EMAIL) {
      return false;
    }
    return true;
  });
}

function projectMessage(message: StoredInboxMessage, viewerEmail: string): InboxMessage {
  const mine = norm(message.fromEmail) === norm(viewerEmail);
  const other = mine
    ? message.deliveredTo.some((item) => item !== norm(viewerEmail))
    : message.deliveredTo.includes(norm(viewerEmail));
  return {
    id: message.id,
    from: mine ? "self" : "them",
    author: message.fromName,
    text: message.text,
    photo: message.photo,
    sentAt: new Date(message.sentAt).toLocaleString("en-GB", { hour12: false }),
    readAt: mine && other ? new Date(message.sentAt).toLocaleString("en-GB", { hour12: false }) : null,
  };
}

function projectThread(thread: StoredInboxThread, viewer: Viewer, view: InboxSeatView): InboxThread | null {
  const email = norm(viewer.email);
  const messages = visibleMessages(thread, email, view);
  if (messages.length === 0) return null;
  const unread = messages.filter(
    (message) => norm(message.fromEmail) !== email && !message.readBy.includes(email),
  ).length;
  const ownerView = isOwner(viewer) || hasBuildDesk(viewer);
  return {
    id: thread.id,
    personId: ownerView ? thread.testerEmail : OWNER_CONTACT.id,
    name: ownerView ? thread.testerName : OWNER_CONTACT.name,
    company: "Hit Squad",
    unread,
    messages: messages.map((message) => projectMessage(message, email)),
  };
}

function markDelivered(state: InboxFile, viewerEmail: string) {
  const email = norm(viewerEmail);
  for (const thread of state.threads || []) {
    for (const message of thread.messages) {
      if (norm(message.fromEmail) === email) continue;
      if (!message.deliveredTo.includes(email)) message.deliveredTo.push(email);
    }
  }
}

export function threadsForViewer(viewer: Viewer): InboxThread[] {
  const state = load();
  const email = norm(viewer.email);
  markDelivered(state, email);
  save(state);
  const view = viewOf(state, email);
  const ownerView = isOwner(viewer) || hasBuildDesk(viewer);
  const rows = (state.threads || [])
    .filter((thread) => (ownerView ? true : thread.testerEmail === email))
    .map((thread) => projectThread(thread, viewer, view))
    .filter((thread): thread is InboxThread => Boolean(thread));
  return rows;
}

export function postInboxMessage(input: {
  from: Viewer;
  to: string;
  text: string;
  photo?: string | null;
}): { ok: true; threadId: string; messageId: string } | { error: string; status: number } {
  const text = input.text.trim();
  const photo = typeof input.photo === "string" && input.photo.startsWith("data:") ? input.photo : null;
  if (!text && !photo) return { error: "Write a message or attach a photo.", status: 400 };

  const testerEmail = resolveTesterEmail(input.from, input.to);
  if (!testerEmail) return { error: "That thread is not on this desk.", status: 403 };
  if (isInboxTester(norm(input.from.email)) && testerEmail !== norm(input.from.email)) {
    return { error: "Testers only write the owner.", status: 403 };
  }

  const state = load();
  const id = threadIdForTester(testerEmail);
  let thread = (state.threads || []).find((row) => row.id === id);
  if (!thread) {
    thread = { id, testerEmail, testerName: testerName(testerEmail), messages: [] };
    state.threads = [...(state.threads || []), thread];
  }
  const message: StoredInboxMessage = {
    id: `im-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fromEmail: norm(input.from.email),
    fromName: input.from.name,
    text,
    photo,
    sentAt: Date.now(),
    deliveredTo: [norm(input.from.email)],
    readBy: [],
  };
  thread.messages.push(message);
  save(state);
  return { ok: true, threadId: id, messageId: message.id };
}

export function markInboxRead(viewer: Viewer, threadId: string) {
  const state = load();
  const email = norm(viewer.email);
  const thread = (state.threads || []).find((row) => row.id === threadId);
  if (!thread) return;
  if (!isOwner(viewer) && !hasBuildDesk(viewer) && thread.testerEmail !== email) return;
  for (const message of thread.messages) {
    if (norm(message.fromEmail) === email) continue;
    if (!message.readBy.includes(email)) message.readBy.push(email);
    if (!message.deliveredTo.includes(email)) message.deliveredTo.push(email);
  }
  save(state);
}

export function clearInboxThread(viewer: Viewer, threadId: string) {
  const state = load();
  const view = viewOf(state, viewer.email);
  view.clearedAt = { ...view.clearedAt, [threadId]: Date.now() };
  writeView(state, viewer.email, view);
  save(state);
}

export function emptyInboxFor(viewer: Viewer) {
  const state = load();
  const view = viewOf(state, viewer.email);
  const now = Date.now();
  const clearedAt = { ...view.clearedAt };
  for (const thread of state.threads || []) {
    if (isOwner(viewer) || hasBuildDesk(viewer) || thread.testerEmail === norm(viewer.email)) {
      clearedAt[thread.id] = now;
    }
  }
  writeView(state, viewer.email, { ...view, clearedAt });
  save(state);
}

export function hideInboxMessage(viewer: Viewer, threadId: string, messageId: string) {
  const state = load();
  const view = viewOf(state, viewer.email);
  if (!view.hiddenMessageIds.includes(messageId)) view.hiddenMessageIds.push(messageId);
  writeView(state, viewer.email, view);
  save(state);
}

