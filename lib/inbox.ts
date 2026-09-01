import { inboxContactsFor, isInboxCircleEmail } from "./inbox-circle.ts";
import { DESK_PERSON_ID } from "./whats-new.ts";

export const INBOX_STORE_PREFIX = "hs_inbox_v1:";
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

/**
 * Merge a server poll into the open desk without kicking compose home.
 * Desk-bot stays local. Remote peers win when the person already exists
 * on the server. A brand-new local compose (Nathan, empty messages) is
 * not on the server yet, so it must survive the poll. If the server later
 * returns that same person under a stable id, remap activeId so the
 * textarea stays on that conversation.
 */
export function reconcileInboxDesk(
  local: InboxThread[],
  remote: InboxThread[],
  activeId: string | null,
): { threads: InboxThread[]; activeId: string | null } {
  const desk = local.filter((thread) => thread.personId === DESK_PERSON_ID);
  const remotePeers = remote.filter((thread) => thread.personId !== DESK_PERSON_ID);
  const remotePersonIds = new Set(remotePeers.map((thread) => thread.personId));
  const localOnlyPeers = local.filter(
    (thread) => thread.personId !== DESK_PERSON_ID && !remotePersonIds.has(thread.personId),
  );
  const threads = [...desk, ...remotePeers, ...localOnlyPeers];

  if (!activeId) return { threads, activeId: null };
  if (threads.some((thread) => thread.id === activeId)) return { threads, activeId };

  const lost = local.find((thread) => thread.id === activeId);
  if (!lost) return { threads, activeId: null };
  const remapped = threads.find((thread) => thread.personId === lost.personId);
  return { threads, activeId: remapped?.id ?? null };
}
