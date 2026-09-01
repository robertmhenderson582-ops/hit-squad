import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  acceptedInboxMessageId,
  appendInboxMessage,
  makeMessage,
  makeThread,
  reconcileInboxDesk,
  rollbackInboxSend,
  startInboxThread,
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

  it("New after deleting a thread is empty and does not reattach vault messages", () => {
    const old = {
      id: "im-old",
      from: "self" as const,
      author: "Robert",
      text: "Deleted thread body",
      photo: null,
      sentAt: "",
      readAt: null,
    };
    const vault = circleThread(NATHAN, { messages: [old] });
    const afterDelete = reconcileInboxDesk([DESK], [vault], null, {
      hiddenPersonIds: [NATHAN.id],
      hiddenMessageIds: [old.id],
    });
    assert.equal(afterDelete.threads.some((thread) => thread.personId === NATHAN.id), false);
    assert.equal(
      afterDelete.threads.some((thread) => thread.messages.some((message) => message.text === old.text)),
      false,
    );

    const started = startInboxThread(afterDelete.threads, NATHAN, {
      hiddenPersonIds: [NATHAN.id],
      hiddenMessageIds: [old.id],
    });
    const compose = started.threads.find((thread) => thread.personId === NATHAN.id);
    assert.ok(compose);
    assert.equal(compose.messages.length, 0);
    assert.equal(started.activeId, compose.id);
    assert.notEqual(started.activeId, vault.id);

    const leftover = startInboxThread([DESK, vault], NATHAN, {
      hiddenPersonIds: [NATHAN.id],
      hiddenMessageIds: [old.id],
    });
    const fresh = leftover.threads.find((thread) => thread.personId === NATHAN.id);
    assert.ok(fresh);
    assert.equal(fresh.messages.length, 0);
    assert.notEqual(fresh.id, vault.id);

    const afterNew = reconcileInboxDesk(started.threads, [vault], started.activeId, {
      hiddenPersonIds: [NATHAN.id],
      hiddenMessageIds: [old.id],
    });
    const still = afterNew.threads.find((thread) => thread.personId === NATHAN.id);
    assert.ok(still);
    assert.equal(still.messages.length, 0);
    assert.equal(afterNew.activeId, still.id);
    assert.equal(
      afterNew.threads.some((thread) => thread.messages.some((message) => message.id === old.id)),
      false,
    );
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

  it("one send cannot paint two same-body same-sender bubbles after poll merge", () => {
    const created = makeThread(NATHAN);
    const pending = makeMessage({ from: "self", author: "Robert Henderson", text: "Testing", photo: null });
    const vault = {
      id: "im-vault-testing",
      from: "self" as const,
      author: "Robert Henderson",
      text: "Testing",
      photo: null,
      sentAt: pending.sentAt,
      readAt: null,
    };
    const local = [DESK, { ...created, messages: [pending] }];
    const remote = [circleThread(NATHAN, { messages: [vault] })];

    const afterSend = reconcileInboxDesk(local, remote, created.id);
    const thread = afterSend.threads.find((row) => row.personId === NATHAN.id);
    assert.ok(thread);
    const testing = thread.messages.filter((message) => message.from === "self" && message.text === "Testing");
    assert.equal(testing.length, 1);
    assert.equal(testing[0]?.id, vault.id);
    assert.equal(thread.messages.some((message) => message.id === pending.id), false);

    const afterPoll = reconcileInboxDesk(afterSend.threads, remote, afterSend.activeId);
    const again = afterPoll.threads.find((row) => row.personId === NATHAN.id);
    assert.ok(again);
    assert.equal(again.messages.filter((message) => message.from === "self" && message.text === "Testing").length, 1);
    assert.equal(afterPoll.activeId, remote[0].id);
  });

  it("hard refresh of a doubled local thread still paints one after poll", () => {
    const pending = {
      id: "im-local-testing",
      from: "self" as const,
      author: "Robert Henderson",
      text: "Testing",
      photo: null,
      sentAt: "a",
      readAt: null,
    };
    const vault = { ...pending, id: "im-vault-testing", sentAt: "b" };
    const stored = circleThread(NATHAN, { messages: [pending, vault] });
    const remote = [circleThread(NATHAN, { messages: [vault] })];
    const next = reconcileInboxDesk([DESK, stored], remote, stored.id);
    const thread = next.threads.find((row) => row.personId === NATHAN.id);
    assert.ok(thread);
    assert.equal(thread.messages.filter((message) => message.from === "self" && message.text === "Testing").length, 1);
    assert.equal(thread.messages[0]?.id, vault.id);
  });

  it("two real sends of the same body stay two bubbles", () => {
    const first = {
      id: "im-testing-1",
      from: "self" as const,
      author: "Robert Henderson",
      text: "Testing",
      photo: null,
      sentAt: "a",
      readAt: null,
    };
    const second = { ...first, id: "im-testing-2", sentAt: "b" };
    const remote = [circleThread(NATHAN, { messages: [first, second] })];
    const next = reconcileInboxDesk([DESK, makeThread(NATHAN)], remote, remote[0].id);
    const thread = next.threads.find((row) => row.personId === NATHAN.id);
    assert.ok(thread);
    assert.equal(thread.messages.filter((message) => message.text === "Testing").length, 2);
  });

  it("provider posts a hide and rolls back a failed send", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/InboxProvider.tsx", import.meta.url)), "utf8");
    assert.match(source, /hideMessageId/);
    assert.match(source, /hidePersonId/);
    assert.match(source, /emptyInbox: true/);
    assert.match(source, /rollbackInboxSend/);
    assert.match(source, /Message did not send/);
    assert.match(source, /startInboxThread/);
    assert.match(source, /writeInboxHides/);
    assert.match(source, /omitHiddenPersonThreads/);
    assert.match(source, /messageId: pending\.id/);
    assert.doesNotMatch(source, /\.then\(\(\) => \{\s*hiddenPersonIdsRef\.current\.delete/);
  });

  it("accepts the optimistic im- id and rejects junk", () => {
    const pending = makeMessage({ from: "self", author: "Robert", text: "Testing", photo: null });
    assert.equal(acceptedInboxMessageId(pending.id), pending.id);
    assert.equal(acceptedInboxMessageId("im-client-testing"), "im-client-testing");
    assert.equal(acceptedInboxMessageId("not-a-message"), "");
    assert.equal(acceptedInboxMessageId("../etc/passwd"), "");
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
