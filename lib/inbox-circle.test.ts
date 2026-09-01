import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { JOSEPH_EMAIL, JOHN_BEECH_EMAIL } from "./tester-seats.ts";
import {
  INBOX_CIRCLE,
  canReceiveDeskBot,
  canUseInbox,
  canUseSuggestionBox,
  inboxContactsFor,
  inboxThreadKey,
  isInboxCircleEmail,
} from "./inbox-circle.ts";

describe("inbox circle", () => {
  it("is Robert, Nathan, Benny, Shane, Wendell, and Chance only", () => {
    assert.deepEqual(
      INBOX_CIRCLE.map((row) => row.email),
      [
        "robertmhenderson582@gmail.com",
        "nathanboyte@gmail.com",
        "bccamp2@gmail.com",
        "shane@apcontrolsllc.com",
        "wlanderno@yahoo.com",
        "chancec318@yahoo.com",
      ],
    );
    assert.equal(INBOX_CIRCLE.length, 6);
    assert.equal(isInboxCircleEmail("Shane@apcontrolsllc.com"), true);
    assert.equal(isInboxCircleEmail(JOSEPH_EMAIL), false);
    assert.equal(isInboxCircleEmail(JOHN_BEECH_EMAIL), false);
    assert.equal(isInboxCircleEmail(NOVUS_EMAIL), false);
    assert.equal(isInboxCircleEmail("marks544@yahoo.com"), false);
    assert.equal(canUseInbox({ email: "nathanboyte@gmail.com" }), true);
    assert.equal(canUseSuggestionBox({ email: JOSEPH_EMAIL }), false);
    assert.equal(canReceiveDeskBot({ email: NOVUS_EMAIL }), false);
    assert.equal(canReceiveDeskBot({ email: "robertmhenderson582@gmail.com" }), true);
    assert.equal(
      inboxContactsFor("nathanboyte@gmail.com").some((row) => row.email === "bccamp2@gmail.com"),
      true,
    );
    assert.equal(
      inboxContactsFor("nathanboyte@gmail.com").some((row) => row.email === JOSEPH_EMAIL),
      false,
    );
    assert.equal(inboxContactsFor(JOSEPH_EMAIL).length, 0);
    assert.equal(inboxThreadKey("NathanBoyte@gmail.com", "bccamp2@gmail.com"), inboxThreadKey("bccamp2@gmail.com", "nathanboyte@gmail.com"));
    const fabs = readFileSync(fileURLToPath(new URL("../components/DeskFabs.tsx", import.meta.url)), "utf8");
    assert.match(fabs, /canUseInbox/);
    assert.match(fabs, /canUseSuggestionBox/);
    assert.match(fabs, /showInbox/);
    const panel = readFileSync(fileURLToPath(new URL("../components/InboxPanel.tsx", import.meta.url)), "utf8");
    assert.match(panel, /those six only/);
    assert.doesNotMatch(panel, /Testers do not see each other/);
  });
});
