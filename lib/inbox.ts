import { inboxContactsFor, isInboxCircleEmail } from "./inbox-circle.ts";
import { DESK_PERSON_ID } from "./whats-new.ts";

export const INBOX_STORE_PREFIX = "hs_inbox_v1:";
export const INBOX_HIDES_PREFIX = "hs_inbox_hides_v1:";
export const OWNER_CONTACT = {
  id: "owner",
  name: "Robert Henderson",
  company: "Hit Squad",
} as const;

export type InboxPerson = {
  id: string;
  name: string;
  company: string;
};

/** Grok-era demo people. Not real seats. Compose uses inboxContactsFor. */
export const OWNER_CONTACTS: InboxPerson[] = [];

export const DEMO_THREAD_IDS = ["th-james", "th-mark", "th-joseph"] as const;
export const DEMO_PERSON_IDS = ["james", "mark", "joseph"] as const;

export type InboxMessage = {
  id: string;
  from: "self" | "them";
  author: string;
  text: string;
  photo: string | null;
  sentAt: string;
  readAt: string | null;
};

export type InboxThread = {
  id: string;
  personId: string;
  name: string;
  company: string;
  unread: number;
  messages: InboxMessage[];
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function stamp(at = new Date()) {
  return at.toLocaleString("en-GB", { hour12: false });
}

function demoMessage(author: string, text: string): InboxMessage {
  return {
    id: uid("im"),
    from: "them",
    author,
    text,
    photo: null,
    sentAt: stamp(),
    readAt: null,
  };
}

export function isDemoInboxThread(thread: Pick<InboxThread, "id" | "personId">) {
  return (
    (DEMO_THREAD_IDS as readonly string[]).includes(thread.id) ||
    (DEMO_PERSON_IDS as readonly string[]).includes(thread.personId)
  );
}

export function stripDemoThreads(threads: InboxThread[]) {
  return threads.filter((thread) => !isDemoInboxThread(thread));
}

export function ownerDemoThreads(): InboxThread[] {
  return [
    {
      id: "th-james",
      personId: "james",
      name: "James Cain",
      company: "Hit Squad",
      unread: 1,
      messages: [demoMessage("James Cain", "What do you think?")],
    },
    {
      id: "th-mark",
      personId: "mark",
      name: "Mark H Schneider",
      company: "Hit Squad",
      unread: 1,
      messages: [demoMessage("Mark H Schneider", "Made some updates")],
    },
    {
      id: "th-joseph",
      personId: "joseph",
      name: "Joseph Henderson",
      company: "Hit Squad",
      unread: 1,
      messages: [demoMessage("Joseph Henderson", "UI is inconsistent when changing tabs.")],
    },
  ];
}

export function storeKey(seat: string) {
  return `${INBOX_STORE_PREFIX}${seat}`;
}

export function hidesKey(seat: string) {
  return `${INBOX_HIDES_PREFIX}${seat}`;
}

export type InboxHides = { personIds: string[]; messageIds: string[] };

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

export function readInboxHides(seat: string): InboxHides {
  if (typeof window === "undefined") return { personIds: [], messageIds: [] };
  try {
    const raw = window.localStorage.getItem(hidesKey(seat));
    if (!raw) return { personIds: [], messageIds: [] };
    const parsed = JSON.parse(raw) as Partial<InboxHides>;
    return {
      personIds: stringIds(parsed.personIds).filter((id) => id !== DESK_PERSON_ID),
      messageIds: stringIds(parsed.messageIds),
    };
  } catch {
    return { personIds: [], messageIds: [] };
  }
}

export function writeInboxHides(seat: string, hides: InboxHides) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    hidesKey(seat),
    JSON.stringify({
      personIds: stringIds(hides.personIds).filter((id) => id !== DESK_PERSON_ID),
      messageIds: stringIds(hides.messageIds),
    }),
  );
}

export function omitHiddenPersonThreads(threads: InboxThread[], hiddenPersonIds: Iterable<string>): InboxThread[] {
  const hidden = new Set(hiddenPersonIds);
  return threads.filter((thread) => thread.personId === DESK_PERSON_ID || !hidden.has(thread.personId));
}

/** Open a person. A deleted thread for that seat stays gone — New is an empty compose. */
export function startInboxThread(
  threads: InboxThread[],
  person: InboxPerson,
  opts?: { hiddenPersonIds?: Iterable<string>; hiddenMessageIds?: Iterable<string> },
): { threads: InboxThread[]; activeId: string } {
  const hiddenPeople = new Set(opts?.hiddenPersonIds ?? []);
  const hiddenMessages = new Set(opts?.hiddenMessageIds ?? []);
  const existing = threads.find((thread) => thread.personId === person.id);
  const visible = existing?.messages.filter((message) => !hiddenMessages.has(message.id)) ?? [];
  if (existing && !hiddenPeople.has(person.id)) {
    return { threads, activeId: existing.id };
  }
  if (existing && hiddenPeople.has(person.id) && visible.length > 0) {
    return {
      threads: threads.map((thread) =>
        thread.personId === person.id ? { ...thread, messages: visible, unread: 0 } : thread,
      ),
      activeId: existing.id,
    };
  }
  const created = makeThread(person);
  return {
    threads: [created, ...threads.filter((thread) => thread.personId !== person.id)],
    activeId: created.id,
  };
}

export function readThreads(seat: string, _ownerChrome: boolean): InboxThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storeKey(seat));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { threads?: InboxThread[] };
    const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
    const stripped = stripDemoThreads(threads);
    if (stripped.length !== threads.length) writeThreads(seat, stripped);
    return stripped;
  } catch {
    return [];
  }
}

export function writeThreads(seat: string, threads: InboxThread[]) {
  window.localStorage.setItem(storeKey(seat), JSON.stringify({ threads }));
}

export function unreadCount(threads: InboxThread[]) {
  return threads.reduce((sum, thread) => sum + thread.unread, 0);
}

export function previewOf(thread: InboxThread) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  if (last.photo && !last.text) return "Photo";
  return last.text;
}

export function makeThread(person: InboxPerson): InboxThread {
  return {
    id: uid("th"),
    personId: person.id,
    name: person.name,
    company: person.company,
    unread: 0,
    messages: [],
  };
}

export function makeMessage(input: {
  from: "self" | "them";
  author: string;
  text: string;
  photo?: string | null;
}): InboxMessage {
  return {
    id: uid("im"),
    from: input.from,
    author: input.author,
    text: input.text,
    photo: input.photo ?? null,
    sentAt: stamp(),
    readAt: null,
  };
}

export function contactsFor(ownerChrome: boolean, email = ""): InboxPerson[] {
  if (isInboxCircleEmail(email)) {
    return inboxContactsFor(email).map((row) => ({
      id: row.id,
      name: row.name,
      company: row.company,
    }));
  }
  if (ownerChrome) return OWNER_CONTACTS;
  return [OWNER_CONTACT];
}

export function appendInboxMessage(threads: InboxThread[], threadId: string, message: InboxMessage): InboxThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, messages: [...thread.messages, message] } : thread,
  );
}

export function rollbackInboxSend(threads: InboxThread[], threadId: string, messageId: string): InboxThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? { ...thread, messages: thread.messages.filter((message) => message.id !== messageId) }
      : thread,
  );
}

function mergePeerThread(
  local: InboxThread | undefined,
  remote: InboxThread,
  hiddenMessageIds: Set<string>,
): InboxThread {
  const map = new Map<string, InboxMessage>();
  if (local) {
    for (const row of local.messages) {
      if (!hiddenMessageIds.has(row.id)) map.set(row.id, row);
    }
  }
  for (const row of remote.messages) {
    if (hiddenMessageIds.has(row.id)) {
      map.delete(row.id);
      continue;
    }
    map.set(row.id, row);
  }
  const messages = [...map.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
  return { ...remote, messages };
}

/**
 * Merge a server poll into the open desk without kicking compose home.
 * Desk-bot stays local. Remote peers win when the person already exists
 * on the server. A brand-new local compose (Nathan, empty messages) is
 * not on the server yet, so it must survive the poll. If the server later
 * returns that same person under a stable id, remap activeId so the
 * textarea stays on that conversation.
 * Hidden ids stay gone even if a poll still has the vault copy.
 * A deleted thread stays off this seat: New/startThread must not remap
 * onto the vault conversation for that person.
 */
export function reconcileInboxDesk(
  local: InboxThread[],
  remote: InboxThread[],
  activeId: string | null,
  opts?: { hiddenMessageIds?: Iterable<string>; hiddenPersonIds?: Iterable<string> },
): { threads: InboxThread[]; activeId: string | null } {
  const hiddenMessageIds = new Set(opts?.hiddenMessageIds ?? []);
  const hiddenPersonIds = new Set(opts?.hiddenPersonIds ?? []);
  const desk = local.filter((thread) => thread.personId === DESK_PERSON_ID);
  const remotePeers = remote.filter((thread) => {
    if (thread.personId === DESK_PERSON_ID) return false;
    if (!hiddenPersonIds.has(thread.personId)) return true;
    return thread.messages.some((message) => !hiddenMessageIds.has(message.id));
  });
  const remotePersonIds = new Set(remotePeers.map((thread) => thread.personId));
  const localByPerson = new Map(
    local
      .filter((thread) => thread.personId !== DESK_PERSON_ID)
      .map((thread) => [thread.personId, thread] as const),
  );
  const mergedRemote = remotePeers.map((thread) =>
    mergePeerThread(localByPerson.get(thread.personId), thread, hiddenMessageIds),
  );
  const localOnlyPeers = local
    .filter((thread) => thread.personId !== DESK_PERSON_ID && !remotePersonIds.has(thread.personId))
    .map((thread) => ({
      ...thread,
      unread: hiddenPersonIds.has(thread.personId) ? 0 : thread.unread,
      messages: thread.messages.filter((message) => !hiddenMessageIds.has(message.id)),
    }));
  const threads = [...desk, ...mergedRemote, ...localOnlyPeers];

  if (!activeId) return { threads, activeId: null };
  if (threads.some((thread) => thread.id === activeId)) return { threads, activeId };

  const lost = local.find((thread) => thread.id === activeId);
  if (!lost) return { threads, activeId: null };
  if (hiddenPersonIds.has(lost.personId) && !remotePersonIds.has(lost.personId)) {
    const compose = threads.find((thread) => thread.personId === lost.personId && thread.messages.length === 0);
    return { threads, activeId: compose?.id ?? null };
  }
  const remapped = threads.find((thread) => thread.personId === lost.personId);
  return { threads, activeId: remapped?.id ?? null };
}
