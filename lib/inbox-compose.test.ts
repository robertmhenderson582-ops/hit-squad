import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { makeThread, reconcileInboxDesk, type InboxThread } from "./inbox.ts";
import { DESK_PERSON_ID } from "./whats-new.ts";

const NATHAN = {
  id: "tester-nathan",
  name: "Nathan Boyte",
  company: "Madison",
} as const;

const BENNY = {
  id: "tester-benny",
  name: "Benny Camp",
  company: "Hit Squad",
} as const;

const DESK: InboxThread = {
  id: "th-desk-v1.28",
  personId: DESK_PERSON_ID,
  name: "Hit Squad",
  company: "Project Controls",
  unread: 0,
  messages: [],
};

function circleThread(person: typeof NATHAN, extra?: Partial<InboxThread>): InboxThread {
  return {
    id: `th-circle-${person.id}`,
    personId: person.id,
    name: person.name,
    company: person.company,
    unread: 0,
    messages: [],
    ...extra,
  };
}

describe("inbox compose stays on the thread", () => {
  it("select Nathan, type, empty poll still on that compose thread", () => {
    const created = makeThread(NATHAN);
    const local = [DESK, created];
    const remote: InboxThread[] = [];

    const afterHydrate = reconcileInboxDesk(local, remote, created.id);
    assert.equal(afterHydrate.activeId, created.id);
    assert.equal(
      afterHydrate.threads.some((thread) => thread.id === created.id && thread.personId === NATHAN.id),
      true,
    );
    assert.equal(afterHydrate.threads.find((thread) => thread.id === created.id)?.messages.length, 0);

    const afterPoll = reconcileInboxDesk(afterHydrate.threads, remote, afterHydrate.activeId);
    assert.equal(afterPoll.activeId, created.id);
    const nathan = afterPoll.threads.find((thread) => thread.personId === NATHAN.id);
    assert.ok(nathan);
    assert.equal(nathan.id, created.id);
    assert.equal(nathan.messages.length, 0);
  });

  it("select anyone in the six, type, poll without that person keeps compose", () => {
    const created = makeThread(BENNY);
    const remote = [circleThread(NATHAN)];
    const next = reconcileInboxDesk([created], remote, created.id);
    assert.equal(next.activeId, created.id);
    assert.equal(next.threads.some((thread) => thread.id === created.id), true);
    assert.equal(next.threads.some((thread) => thread.personId === NATHAN.id), true);
  });

  it("does not jump to Inbox home when the poll has no matching thread id", () => {
    const created = makeThread(NATHAN);
    const next = reconcileInboxDesk([created], [], created.id);
    const stillOpen = next.threads.find((thread) => thread.id === next.activeId);
    assert.ok(stillOpen);
    assert.equal(stillOpen.personId, NATHAN.id);
    assert.notEqual(next.activeId, null);
  });

  it("remaps the open thread when the server later returns the same person", () => {
    const created = makeThread(NATHAN);
    const remote = [circleThread(NATHAN, { messages: [{ id: "im-1", from: "self", author: "Robert", text: "Hi", photo: null, sentAt: "", readAt: null }] })];
    const next = reconcileInboxDesk([DESK, created], remote, created.id);
    assert.equal(next.activeId, remote[0].id);
    assert.equal(next.threads.some((thread) => thread.id === created.id), false);
    assert.equal(next.threads.find((thread) => thread.personId === NATHAN.id)?.messages[0]?.text, "Hi");
    assert.equal(next.threads.some((thread) => thread.personId === DESK_PERSON_ID), true);
  });
});
