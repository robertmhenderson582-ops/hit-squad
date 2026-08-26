import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  inboxStoreKind,
  postInboxMessage,
  resetInboxStoreForTests,
  threadsForViewer,
} from "./inbox-store.ts";
import { INBOX_STORE_PREFIX } from "./inbox.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-inbox-"));
const file = join(dir, "inbox.json");

const owner = {
  email: "robertmhenderson582@gmail.com",
  name: "Robert Henderson",
  role: "owner",
};
const joseph = {
  email: JOSEPH_EMAIL,
  name: "Joseph Henderson",
  role: "tester",
};
const nathan = {
  email: "nathanboyte@gmail.com",
  name: "Nathan Boyte",
  role: "tester",
};

after(() => {
  resetInboxStoreForTests();
});

describe("server inbox", { concurrency: 1 }, () => {
it("owner posts to Joseph and Joseph’s store returns that text", () => {
  resetInboxStoreForTests(file);
  const posted = postInboxMessage({ from: owner, to: JOSEPH_EMAIL, text: "Hello" });
  assert.equal("ok" in posted && posted.ok, true);
  assert.equal(inboxStoreKind(), "server-json-file");

  const beforeLoad = threadsForViewer(owner)
    .flatMap((row) => row.messages)
    .find((row) => row.text === "Hello");
  assert.equal(beforeLoad?.from, "self");
  assert.equal(beforeLoad?.readAt, null);

  const josephThreads = threadsForViewer(joseph);
  assert.equal(josephThreads.length, 1);
  assert.equal(josephThreads[0].personId, "owner");
  assert.equal(josephThreads[0].name, "Robert Henderson");
  assert.equal(josephThreads[0].messages.some((row) => row.text === "Hello"), true);
  assert.equal(josephThreads[0].unread > 0, true);

  const afterLoad = threadsForViewer(owner)
    .flatMap((row) => row.messages)
    .find((row) => row.text === "Hello");
  assert.equal(Boolean(afterLoad?.readAt), true);
});

it("Joseph cannot list Nathan’s thread", () => {
  resetInboxStoreForTests(file);
  postInboxMessage({ from: owner, to: JOSEPH_EMAIL, text: "Hello" });
  postInboxMessage({ from: owner, to: nathan.email, text: "Night window" });

  const josephThreads = threadsForViewer(joseph);
  assert.equal(josephThreads.length, 1);
  assert.equal(
    josephThreads.some((row) => row.messages.some((message) => message.text === "Night window")),
    false,
  );
  assert.equal(josephThreads[0].personId, "owner");

  const nathanThreads = threadsForViewer(nathan);
  assert.equal(nathanThreads.length, 1);
  assert.equal(nathanThreads[0].messages[0]?.text, "Night window");
  assert.equal(
    threadsForViewer(joseph).some((row) => row.personId === nathan.email || row.name === "Nathan Boyte"),
    false,
  );
});

it("localStorage-only send is gone", () => {
  assert.equal(inboxStoreKind(), "server-json-file");
  assert.notEqual(inboxStoreKind(), INBOX_STORE_PREFIX);
  resetInboxStoreForTests(file);
  const blocked = postInboxMessage({ from: joseph, to: nathan.email, text: "secret" });
  assert.equal("error" in blocked, true);
  assert.equal(threadsForViewer(nathan).length, 0);
});
});
