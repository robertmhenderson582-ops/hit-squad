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

/** Grok-era demo people. Not real seats. Compose stays empty until a real list exists. */
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

export function contactsFor(ownerChrome: boolean): InboxPerson[] {
  if (ownerChrome) return OWNER_CONTACTS;
  return [OWNER_CONTACT];
}
