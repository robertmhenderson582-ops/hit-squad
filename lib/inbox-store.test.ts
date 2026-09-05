import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { INBOX_VAULT_KIND, INBOX_VAULT_NAME, readVaultJson } from "./drive-data.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { NOVUS_INBOX_EMAIL } from "./inbox-circle.ts";
import { acceptedInboxPhoto } from "./inbox.ts";
import { JOHN_BEECH_EMAIL, JOSEPH_EMAIL } from "./tester-seats.ts";
import {
  forgetInboxCacheForTests,
  hideInboxFor,
  listInboxFor,
  mergeInboxMessages,
  postInboxMessage,
  resetInboxStoreForTests,
  staleWarmInboxInstanceForTests,
  useInboxVaultForTests,
  type StoredInboxMessage,
} from "./inbox-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-inbox-"));
const OWNER = "robertmhenderson582@gmail.com";
const NATHAN = "nathanboyte@gmail.com";

afterEach(() => {
  forgetInboxCacheForTests();
  resetInboxStoreForTests();
});

function row(id: string, extra?: Partial<StoredInboxMessage>): StoredInboxMessage {
  return {
    id,
    threadKey: `${NATHAN}|${OWNER}`,
    fromEmail: OWNER,
    fromName: "Robert Henderson",
    toEmail: NATHAN,
    text: id,
    photo: null,
    sentAt: "2026-09-01T00:00:00",
    readBy: [OWNER],
    hiddenBy: [],
    ...extra,
  };
}

describe("inbox store", { concurrency: 1 }, () => {
  it("lets the seven plus Novus see each other's messages and keeps John Beech out", async () => {
    resetInboxStoreForTests(join(dir, "inbox.json"));
    const posted = await postInboxMessage({
      fromEmail: "nathanboyte@gmail.com",
      fromName: "Nathan Boyte",
      toEmail: "bccamp2@gmail.com",
      text: "Hello Benny",
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.threads.some((thread) => thread.personId === "tester-benny"), true);
    const benny = await listInboxFor("bccamp2@gmail.com");
    const fromNathan = benny.find((thread) => thread.personId === "tester-nathan");
    assert.ok(fromNathan);
    assert.equal(fromNathan.messages.some((message) => message.text === "Hello Benny"), true);
    assert.equal(fromNathan.unread, 1);

    const josephToRobert = await postInboxMessage({
      fromEmail: JOSEPH_EMAIL,
      fromName: "Joseph Henderson",
      toEmail: OWNER,
      text: "Joseph to Robert",
    });
    assert.equal(josephToRobert.ok, true);
    if (!josephToRobert.ok) return;
    const robert = await listInboxFor(OWNER);
    const fromJoseph = robert.find((thread) => thread.personId === "tester-joseph");
    assert.ok(fromJoseph);
    assert.equal(fromJoseph.messages.some((message) => message.text === "Joseph to Robert"), true);

    const steal = await postInboxMessage({
      fromEmail: JOHN_BEECH_EMAIL,
      fromName: "John Beech",
      toEmail: "nathanboyte@gmail.com",
      text: "Should not land",
    });
    assert.equal(steal.ok, false);
    if (steal.ok) return;
    assert.equal(steal.status, 403);
    assert.deepEqual(await listInboxFor(JOHN_BEECH_EMAIL), []);
  });

  it("two posts from different hydrate resets keep both messages in the vault", async () => {
    const drive = memoryDrive();
    resetInboxStoreForTests(join(dir, "wipe.json"));
    useInboxVaultForTests(drive);

    const ownerPost = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Owner to Nathan",
    });
    assert.equal(ownerPost.ok, true);

    staleWarmInboxInstanceForTests();

    const nathanPost = await postInboxMessage({
      fromEmail: NATHAN,
      fromName: "Nathan Boyte",
      toEmail: OWNER,
      text: "Nathan to owner",
    });
    assert.equal(nathanPost.ok, true);

    const vault = await readVaultMessages(drive);
    assert.equal(vault.some((message) => message.text === "Owner to Nathan"), true);
    assert.equal(vault.some((message) => message.text === "Nathan to owner"), true);
    assert.equal(vault.length, 2);
  });

  it("a GET after another instance's POST sees the new row", async () => {
    const drive = memoryDrive();
    resetInboxStoreForTests(join(dir, "fresh-get.json"));
    useInboxVaultForTests(drive);

    await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Landed on vault",
    });

    staleWarmInboxInstanceForTests();
    const nathan = await listInboxFor(NATHAN);
    const fromRobert = nathan.find((thread) => thread.personId === "owner");
    assert.ok(fromRobert);
    assert.equal(fromRobert.messages.some((message) => message.text === "Landed on vault"), true);
    assert.equal(fromRobert.messages[0]?.from, "them");
  });

  it("owner → Nathan is on Nathan's Inbox as from them", async () => {
    resetInboxStoreForTests(join(dir, "owner-to-nathan.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Hi Nathan",
    });
    assert.equal(posted.ok, true);
    const nathan = await listInboxFor(NATHAN);
    const thread = nathan.find((row) => row.personId === "owner");
    assert.ok(thread);
    assert.equal(thread.messages.some((message) => message.from === "them" && message.text === "Hi Nathan"), true);
    assert.equal(thread.messages.some((message) => message.author === "Robert Henderson"), true);
  });

  it("Nathan → owner is on the owner Inbox as from them", async () => {
    resetInboxStoreForTests(join(dir, "nathan-to-owner.json"));
    const posted = await postInboxMessage({
      fromEmail: NATHAN,
      fromName: "Nathan Boyte",
      toEmail: OWNER,
      text: "Hi Robert",
    });
    assert.equal(posted.ok, true);
    const owner = await listInboxFor(OWNER);
    const thread = owner.find((row) => row.personId === "tester-nathan");
    assert.ok(thread);
    assert.equal(thread.messages.some((message) => message.from === "them" && message.text === "Hi Robert"), true);
  });

  it("delete hides the message for that person only and a later list stays gone", async () => {
    resetInboxStoreForTests(join(dir, "hide.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Please delete me",
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    const messageId = posted.threads
      .find((thread) => thread.personId === "tester-nathan")
      ?.messages.find((message) => message.text === "Please delete me")?.id;
    assert.ok(messageId);

    await hideInboxFor(OWNER, { messageId });
    const ownerAfter = await listInboxFor(OWNER);
    assert.equal(
      ownerAfter.some((thread) => thread.messages.some((message) => message.id === messageId)),
      false,
    );

    staleWarmInboxInstanceForTests();
    const ownerAgain = await listInboxFor(OWNER);
    assert.equal(
      ownerAgain.some((thread) => thread.messages.some((message) => message.id === messageId)),
      false,
    );

    const nathan = await listInboxFor(NATHAN);
    assert.equal(
      nathan.some((thread) => thread.messages.some((message) => message.id === messageId && message.from === "them")),
      true,
    );
  });

  it("View as Nathan delete is Nathan's hide, not an unsend from the owner", async () => {
    resetInboxStoreForTests(join(dir, "nathan-hide.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Nathan can hide this",
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    const messageId = posted.threads
      .find((thread) => thread.personId === "tester-nathan")
      ?.messages.find((message) => message.text === "Nathan can hide this")?.id;
    assert.ok(messageId);

    await hideInboxFor(NATHAN, { messageId });
    staleWarmInboxInstanceForTests();
    assert.equal(
      (await listInboxFor(NATHAN)).some((thread) => thread.messages.some((message) => message.id === messageId)),
      false,
    );
    assert.equal(
      (await listInboxFor(OWNER)).some((thread) => thread.messages.some((message) => message.id === messageId)),
      true,
    );
  });

  it("deleting a thread stays gone on list/poll; the other person still has it", async () => {
    resetInboxStoreForTests(join(dir, "delete-thread.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Thread to delete",
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.threads.some((thread) => thread.personId === "tester-nathan"), true);

    const ownerHidden = await hideInboxFor(OWNER, { personId: "tester-nathan" });
    assert.equal(ownerHidden.some((thread) => thread.personId === "tester-nathan"), false);
    assert.equal(
      ownerHidden.some((thread) => thread.messages.some((message) => message.text === "Thread to delete")),
      false,
    );

    staleWarmInboxInstanceForTests();
    const ownerPoll = await listInboxFor(OWNER);
    assert.equal(ownerPoll.some((thread) => thread.personId === "tester-nathan"), false);
    assert.deepEqual(ownerPoll, []);

    const nathan = await listInboxFor(NATHAN);
    const stillThere = nathan.find((thread) => thread.personId === "owner");
    assert.ok(stillThere);
    assert.equal(stillThere.messages.some((message) => message.text === "Thread to delete"), true);
  });

  it("clear conversation hides that thread for the viewer only", async () => {
    resetInboxStoreForTests(join(dir, "clear.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: NATHAN,
      text: "Clear this thread",
    });
    assert.equal(posted.ok, true);
    await hideInboxFor(OWNER, { personId: "tester-nathan" });
    staleWarmInboxInstanceForTests();
    assert.equal((await listInboxFor(OWNER)).some((thread) => thread.personId === "tester-nathan"), false);
    assert.equal(
      (await listInboxFor(NATHAN)).some((thread) => thread.messages.some((message) => message.text === "Clear this thread")),
      true,
    );
  });

  it("one owner send is one bubble for Robert and one copy for Wendell", async () => {
    resetInboxStoreForTests(join(dir, "one-send.json"));
    const posted = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: "wlanderno@yahoo.com",
      text: "Testing",
      id: "im-client-testing",
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    const ownerThread = posted.threads.find((thread) => thread.personId === "tester-wendell");
    assert.ok(ownerThread);
    assert.equal(ownerThread.messages.filter((message) => message.from === "self" && message.text === "Testing").length, 1);
    assert.equal(ownerThread.messages[0]?.id, "im-client-testing");

    const again = await postInboxMessage({
      fromEmail: OWNER,
      fromName: "Robert Henderson",
      toEmail: "wlanderno@yahoo.com",
      text: "Testing",
      id: "im-client-testing",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    const still = again.threads.find((thread) => thread.personId === "tester-wendell");
    assert.ok(still);
    assert.equal(still.messages.filter((message) => message.text === "Testing").length, 1);

    const wendell = await listInboxFor("wlanderno@yahoo.com");
    const fromRobert = wendell.find((thread) => thread.personId === "owner");
    assert.ok(fromRobert);
    assert.equal(fromRobert.messages.filter((message) => message.from === "them" && message.text === "Testing").length, 1);
    assert.equal(fromRobert.messages[0]?.id, "im-client-testing");
    assert.equal(fromRobert.messages[0]?.author, "Robert Henderson");
  });

  it("union by id does not let a stale list wipe a vault hide or a sibling message", () => {
    const first = row("im-1", { text: "first" });
    const second = row("im-2", { text: "second", fromEmail: NATHAN, fromName: "Nathan Boyte", toEmail: OWNER });
    const hidden = row("im-1", { text: "first", hiddenBy: [OWNER] });
    const merged = mergeInboxMessages([first], [second, { ...first, hiddenBy: [] }]);
    assert.equal(merged.length, 2);
    const afterHide = mergeInboxMessages(merged, [hidden]);
    assert.equal(afterHide.find((item) => item.id === "im-1")?.hiddenBy.includes(OWNER), true);
    assert.equal(afterHide.some((item) => item.id === "im-2"), true);
    const staleWrite = mergeInboxMessages(afterHide, [second]);
    assert.equal(staleWrite.find((item) => item.id === "im-1")?.hiddenBy.includes(OWNER), true);
    assert.equal(staleWrite.length, 2);
  });

  it("Chance can compose to Novus and the photo persists in the vault", async () => {
    const drive = memoryDrive();
    resetInboxStoreForTests(join(dir, "chance-novus.json"));
    useInboxVaultForTests(drive);
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const posted = await postInboxMessage({
      fromEmail: "chancec318@yahoo.com",
      fromName: "Chance Middlebrooks",
      toEmail: NOVUS_INBOX_EMAIL,
      text: "Screenshot",
      photo,
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    const novus = posted.threads.find((thread) => thread.personId === "novus");
    assert.ok(novus);
    assert.equal(novus.name, "Novus");
    assert.equal(novus.messages.some((message) => message.photo === photo && message.text === "Screenshot"), true);

    staleWarmInboxInstanceForTests();
    const again = await listInboxFor("chancec318@yahoo.com");
    const thread = again.find((row) => row.personId === "novus");
    assert.ok(thread);
    assert.equal(thread.messages.some((message) => message.photo === photo), true);

    const vault = await readVaultMessages(drive);
    assert.equal(vault.some((message) => message.fromEmail === "chancec318@yahoo.com" && message.toEmail === NOVUS_INBOX_EMAIL && message.photo === photo), true);

    const bad = await postInboxMessage({
      fromEmail: "chancec318@yahoo.com",
      fromName: "Chance Middlebrooks",
      toEmail: NOVUS_INBOX_EMAIL,
      photo: "not-an-image",
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal(bad.status, 400);
    assert.match(bad.error, /attach/i);
    assert.equal(acceptedInboxPhoto("not-an-image"), null);
    assert.equal(acceptedInboxPhoto(photo), photo);
  });

  it("a failed Drive write throws on Inbox persist", async () => {
    resetInboxStoreForTests(join(dir, "inbox-fail.json"));
    useInboxVaultForTests({
      configured: true,
      async listJson() {
        return [];
      },
      async readJson() {
        return "{}";
      },
      async createJson() {
        throw new Error("update");
      },
      async updateJson() {
        throw new Error("update");
      },
      async deleteJson() {},
    });
    await assert.rejects(
      () =>
        postInboxMessage({
          fromEmail: "chancec318@yahoo.com",
          fromName: "Chance Middlebrooks",
          toEmail: OWNER,
          text: "Must not look saved",
        }),
      /update/,
    );
  });
});

async function readVaultMessages(drive: ReturnType<typeof memoryDrive>) {
  const raw = await readVaultJson<{ messages?: Array<{ id: string; text: string; fromEmail?: string; toEmail?: string; photo?: string | null }> }>(
    drive,
    INBOX_VAULT_NAME,
    INBOX_VAULT_KIND,
  );
  return raw?.messages ?? [];
}
