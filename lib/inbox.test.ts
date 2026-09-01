import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { DESK_VERSION, applyWhatsNew, deskWhatsNewThread } from "./whats-new.ts";
import {
  OWNER_CONTACTS,
  contactsFor,
  ownerDemoThreads,
  readThreads,
  storeKey,
  stripDemoThreads,
  writeThreads,
  type InboxThread,
} from "./inbox.ts";

const DEMO_IDS = ["th-james", "th-mark", "th-joseph"] as const;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe("inbox demo wipe", () => {
  const realWindow = (globalThis as { window?: Window }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: memoryStorage(),
    } as Window;
  });

  afterEach(() => {
    if (realWindow) (globalThis as { window?: Window }).window = realWindow;
    else delete (globalThis as { window?: unknown }).window;
  });

  it("owner empty store is not the three Grok-era demo threads", () => {
    const threads = readThreads("owner", true);
    assert.equal(threads.some((thread) => (DEMO_IDS as readonly string[]).includes(thread.id)), false);
    assert.equal(threads.length, 0);
    assert.equal(OWNER_CONTACTS.length, 0);
    assert.equal(
      OWNER_CONTACTS.some((person) => /James|Mark|Joseph/.test(person.name)),
      false,
    );
    const ownerPeople = contactsFor(true, "robertmhenderson582@gmail.com");
    assert.equal(ownerPeople.length, 5);
    assert.equal(ownerPeople.some((person) => person.name === "Nathan Boyte"), true);
    assert.equal(ownerPeople.some((person) => /Joseph|James|Mark/.test(person.name)), false);
    const nathanPeople = contactsFor(false, "nathanboyte@gmail.com");
    assert.equal(nathanPeople.some((person) => person.id === "owner"), true);
    assert.equal(nathanPeople.some((person) => person.id === "tester-joseph"), false);
  });

  it("stored demo threads are stripped and the cleaned list is persisted", () => {
    const dirty: InboxThread[] = [...ownerDemoThreads(), { ...deskWhatsNewThread(true), unread: 0 }];
    writeThreads("owner", dirty);
    const cleaned = readThreads("owner", true);
    assert.equal(cleaned.some((thread) => (DEMO_IDS as readonly string[]).includes(thread.id)), false);
    assert.equal(
      cleaned.some((thread) => thread.personId === "james" || thread.personId === "mark" || thread.personId === "joseph"),
      false,
    );
    const persisted = JSON.parse(window.localStorage.getItem(storeKey("owner")) || "{}") as { threads?: InboxThread[] };
    const stored = persisted.threads ?? [];
    assert.equal(stored.some((thread) => (DEMO_IDS as readonly string[]).includes(thread.id)), false);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, "th-desk-v1.27");
  });

  it("tester empty store stays empty (never had the demo threads)", () => {
    assert.deepEqual(readThreads("tester-james", false), []);
  });

  it("stripDemoThreads drops the three demo ids", () => {
    const note = deskWhatsNewThread(true);
    const cleaned = stripDemoThreads([...ownerDemoThreads(), note]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, "th-desk-v1.27");
    assert.equal(stripDemoThreads([note]).length, 1);
  });

  it("Desk note stays V1.27 and tester-safe", () => {
    assert.equal(DESK_VERSION, "1.27.0");
    const threads = applyWhatsNew([deskWhatsNewThread(true)], "owner-note", true);
    assert.equal(threads.length, 1);
    assert.equal(threads[0].id, "th-desk-v1.27");
    const body = threads[0].messages.map((message) => message.text).join(" ");
    assert.match(body, /V1\.27/);
    assert.match(body, /Add user on Users creates a login/);
    assert.doesNotMatch(body, /View as|vault|Drive|seats?|James|CBI|Madison|Nathan|Joseph|Stephanie/i);
  });
});
