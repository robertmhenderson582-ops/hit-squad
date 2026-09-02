import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { DESK_VERSION, applyWhatsNew, deskWhatsNewThread } from "./whats-new.ts";
import {
  OWNER_CONTACTS,
  contactsFor,
  hidesKey,
  omitHiddenPersonThreads,
  ownerDemoThreads,
  readInboxHides,
  readThreads,
  storeKey,
  stripDemoThreads,
  writeInboxHides,
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
    assert.equal(stored[0].id, "th-desk-v1.38");
  });

  it("tester empty store stays empty (never had the demo threads)", () => {
    assert.deepEqual(readThreads("tester-james", false), []);
  });

  it("stripDemoThreads drops the three demo ids", () => {
    const note = deskWhatsNewThread(true);
    const cleaned = stripDemoThreads([...ownerDemoThreads(), note]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, "th-desk-v1.38");
    assert.equal(stripDemoThreads([note]).length, 1);
  });

  it("deleted-thread hides survive refresh and omit leftover local rows", () => {
    writeInboxHides("owner", { personIds: ["tester-nathan", "desk"], messageIds: ["im-old"] });
    assert.equal(hidesKey("owner"), "hs_inbox_hides_v1:owner");
    const hides = readInboxHides("owner");
    assert.deepEqual(hides.personIds, ["tester-nathan"]);
    assert.deepEqual(hides.messageIds, ["im-old"]);

    const leftover: InboxThread = {
      id: "th-circle-tester-nathan",
      personId: "tester-nathan",
      name: "Nathan Boyte",
      company: "Madison",
      unread: 1,
      messages: [
        {
          id: "im-old",
          from: "self",
          author: "Robert",
          text: "Should not come back",
          photo: null,
          sentAt: "",
          readAt: null,
        },
      ],
    };
    const note = deskWhatsNewThread(true);
    assert.deepEqual(omitHiddenPersonThreads([note, leftover], hides.personIds), [note]);
  });

  it("Desk note stays V1.38 and tester-safe", () => {
    assert.equal(DESK_VERSION, "1.38.0");
    const tester = applyWhatsNew([deskWhatsNewThread(false)], "tester-note", false, "nathanboyte@gmail.com");
    assert.equal(tester.length, 1);
    assert.equal(tester[0].id, "th-desk-v1.38");
    const testerBody = tester[0].messages.map((message) => message.text).join(" ");
    assert.match(testerBody, /V1\.38/);
    assert.match(testerBody, /You can delete HSE sample cards on JOBS the same way as estimates/);
    assert.match(testerBody, /Jobs only shows sites assigned to you/);
    assert.match(testerBody, /Company cards on Rates can collapse/);
    assert.match(testerBody, /Rate books Madison opens the wage lookup/);
    assert.match(testerBody, /Rates lists Madison plants including Monroe Energy/);
    assert.doesNotMatch(testerBody, /poll|dedupe|optimistic|vault|Drive|seats?|James|CBI|Joseph|Stephanie|password|security|View as/i);
    assert.doesNotMatch(testerBody, /Robert, Nathan, Benny, Shane, Wendell, and Chance/);
    const owner = applyWhatsNew([deskWhatsNewThread(true)], "owner-note", true);
    assert.equal(owner[0].id, "th-desk-v1.38");
    const ownerBody = owner[0].messages.map((message) => message.text).join(" ");
    assert.match(ownerBody, /HS-8622/);
    assert.match(ownerBody, /View as Nathan/);
    assert.match(ownerBody, /Company cards on Rates can collapse/);
    assert.match(ownerBody, /Monroe Energy/);
  });
});
