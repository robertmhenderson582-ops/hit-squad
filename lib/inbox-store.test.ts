import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { JOSEPH_EMAIL } from "./tester-seats.ts";
import {
  forgetInboxCacheForTests,
  listInboxFor,
  postInboxMessage,
  resetInboxStoreForTests,
} from "./inbox-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-inbox-"));

afterEach(() => {
  forgetInboxCacheForTests();
  resetInboxStoreForTests();
});

describe("inbox store", () => {
  it("lets the six see each other's messages and keeps Joseph out", async () => {
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

    const steal = await postInboxMessage({
      fromEmail: JOSEPH_EMAIL,
      fromName: "Joseph Henderson",
      toEmail: "nathanboyte@gmail.com",
      text: "Should not land",
    });
    assert.equal(steal.ok, false);
    if (steal.ok) return;
    assert.equal(steal.status, 403);
    assert.deepEqual(await listInboxFor(JOSEPH_EMAIL), []);
  });
});
