import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  appendInboxMessage,
  makeMessage,
  makeThread,
  reconcileInboxDesk,
  rollbackInboxSend,
  type InboxThread,
} from "./inbox.ts";
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

  it("keeps both sides of the same person thread when the poll has the peer reply", () => {
    const created = makeThread(NATHAN);
    const outbound = makeMessage({ from: "self", author: "Robert", text: "Owner outbound", photo: null });
    const local = [DESK, { ...created, messages: [outbound] }];
    const remote = [
      circleThread(NATHAN, {
        messages: [{ id: "im-nathan", from: "them", author: "Nathan Boyte", text: "Nathan reply", photo: null, sentAt: "z", readAt: null }],
      }),
    ];
    const next = reconcileInboxDesk(local, remote, created.id);
    assert.equal(next.activeId, remote[0].id);
    const nathan = next.threads.find((thread) => thread.personId === NATHAN.id);
    assert.ok(nathan);
    assert.equal(nathan.messages.some((message) => message.text === "Owner outbound"), true);
    assert.equal(nathan.messages.some((message) => message.text === "Nathan reply"), true);
  });

  it("does not resurrect a deleted message from the remote poll", () => {
    const created = makeThread(NATHAN);
    const remote = [
      circleThread(NATHAN, {
        messages: [{ id: "im-gone", from: "self", author: "Robert", text: "Deleted", photo: null, sentAt: "", readAt: null }],
      }),
    ];
    const next = reconcileInboxDesk([DESK, created], remote, created.id, { hiddenMessageIds: ["im-gone"] });
    assert.equal(next.threads.find((thread) => thread.personId === NATHAN.id)?.messages.length, 0);
  });

  it("provider posts a hide and rolls back a failed send", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/InboxProvider.tsx", import.meta.url)), "utf8");
    assert.match(source, /hideMessageId/);
    assert.match(source, /hidePersonId/);
    assert.match(source, /emptyInbox: true/);
    assert.match(source, /rollbackInboxSend/);
    assert.match(source, /Message did not send/);
  });

  it("failed send drops the local-only delivered row", () => {
    const created = makeThread(NATHAN);
    const pending = makeMessage({ from: "self", author: "Robert", text: "Did not land", photo: null });
    const sent = appendInboxMessage([created], created.id, pending);
    assert.equal(sent[0].messages.some((message) => message.id === pending.id), true);
    const rolled = rollbackInboxSend(sent, created.id, pending.id);
    assert.equal(rolled[0].messages.some((message) => message.id === pending.id), false);
    assert.equal(rolled[0].messages.length, 0);
  });
});
