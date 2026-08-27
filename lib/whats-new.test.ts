import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_LANES } from "./crew-lanes.ts";
import { displayEstimateType, ESTIMATE_TYPES } from "./estimate-type.ts";
import {
  DESK_PERSON_ID,
  DESK_THREAD_ID,
  DESK_VERSION,
  DESK_VERSION_LABEL,
  NEXT_SHIP_VERSION,
  NEXT_SHIP_VERSION_LABEL,
  OWNER_NEXT_SHIP_DRAFT,
  OWNER_WHATS_NEW,
  TESTER_NEXT_SHIP_DRAFT,
  TESTER_WHATS_NEW,
  WHATS_NEW_MARK_PREFIX,
  applyWhatsNew,
  deskWhatsNewThread,
  seenKey,
  testerCopyIsSafe,
} from "./whats-new.ts";

describe("estimate type", () => {
  it("never treats Outage as the type", () => {
    assert.equal(displayEstimateType("Outage / T&M"), "T&M");
    assert.equal(displayEstimateType("Outage"), "T&M");
    assert.equal(displayEstimateType("T&M"), "T&M");
    assert.equal(displayEstimateType("Lump sum"), "Lump sum");
    assert.equal(displayEstimateType("CR/FF"), "CR/FF");
    assert.equal(ESTIMATE_TYPES.includes("T&M"), true);
    assert.equal(
      ESTIMATE_TYPES.some((item) => /outage/i.test(item)),
      false,
    );
  });
});

describe("crew lanes", () => {
  it("has the five desk cards and keeps phases off crew", () => {
    assert.deepEqual(
      CREW_LANES.map((lane) => lane.title),
      ["Staff", "General Foreman", "Foreman", "Direct Craft", "Support"],
    );
    assert.match(CREW_LANES[0].note, /Supervision/);
    assert.match(CREW_LANES[2].note, /does not count as working foreman/);
    assert.equal(
      CREW_LANES.some((lane) => lane.id === "support"),
      true,
    );
  });
});

describe("inbox what's-new", () => {
  it("seeds a per-seat Desk thread and keeps tester copy clean", () => {
    assert.equal(DESK_VERSION, "1.26.0");
    assert.equal(DESK_VERSION_LABEL, "Hit Squad Project Controls V1.26");
    assert.equal(DESK_THREAD_ID, "th-desk-v1.26");
    assert.equal(TESTER_WHATS_NEW.startsWith(DESK_VERSION_LABEL), true);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(TESTER_WHATS_NEW, /Leftover copies can no longer undo a Turn over/);
    assert.match(TESTER_WHATS_NEW, /The person you handed the job to sees it again with Return/);
    assert.equal(/Wendell|Joseph|testers|Follow|Shane|apcontrolsllc|seat/i.test(TESTER_WHATS_NEW), false);
    assert.match(OWNER_WHATS_NEW, /Leftover copies can no longer undo a Turn over/);
    assert.match(OWNER_WHATS_NEW, /Jobs in the header stays put/);
    assert.equal(/View as/i.test(TESTER_WHATS_NEW), false);
    assert.equal(
      /password|passwords|auth|cookie|session|security|Novus|vault|Drive|seats|owner tools|View as|aliases|deploy|other users|other testers|anyone else/i.test(
        TESTER_WHATS_NEW,
      ),
      false,
    );
    for (const word of [
      "password",
      "auth",
      "cookie",
      "session",
      "security",
      "novus",
      "vault",
      "seats",
      "owner tools",
      "view as",
      "deploy",
      "other users",
      "other testers",
      "anyone else",
    ]) {
      assert.equal(testerCopyIsSafe(word), false, word);
    }

    const first = applyWhatsNew([], "tester-joseph-new", false);
    assert.equal(first.length, 1);
    assert.equal(first[0].personId, DESK_PERSON_ID);
    assert.equal(first[0].id, DESK_THREAD_ID);
    assert.equal(first[0].name, "Hit Squad");
    assert.equal(first[0].messages[0]?.author, "Desk");
    assert.equal(first[0].messages[0]?.text, TESTER_WHATS_NEW);

    const owner = deskWhatsNewThread(true);
    assert.equal(owner.messages[0]?.text, OWNER_WHATS_NEW);
  });

  it("appends V1.26 onto an existing Hit Squad desk thread after V1.25", () => {
    assert.equal(seenKey("tester-x", "1.25.0"), `${WHATS_NEW_MARK_PREFIX}1.25.0:tester-x`);
    assert.equal(seenKey("tester-x"), `${WHATS_NEW_MARK_PREFIX}1.26.0:tester-x`);
    assert.notEqual(seenKey("tester-x", "1.25.0"), seenKey("tester-x"));

    const prior = [
      {
        id: "th-desk-v1.25",
        personId: DESK_PERSON_ID,
        name: "Hit Squad",
        company: "Project Controls",
        unread: 0,
        messages: [
          {
            id: "im-desk-1.25.0",
            from: "them" as const,
            author: "Desk",
            text: "Hit Squad Project Controls V1.25",
            photo: null,
            sentAt: "",
            readAt: "seen",
          },
        ],
      },
    ];
    const next = applyWhatsNew(prior, "tester-joseph-append", false);
    assert.equal(next.length, 1);
    assert.equal(next[0].messages.length, 2);
    assert.equal(next[0].messages[1]?.text, TESTER_WHATS_NEW);
    assert.equal(next[0].unread, 1);
    assert.equal(applyWhatsNew(next, "tester-joseph-append", false)[0].messages.length, 2);
  });

  it("posts the V1.26 Inbox note for testers and owner", () => {
    assert.equal(DESK_VERSION, "1.26.0");
    assert.equal(NEXT_SHIP_VERSION, DESK_VERSION);
    assert.equal(NEXT_SHIP_VERSION_LABEL, DESK_VERSION_LABEL);
    assert.equal(TESTER_NEXT_SHIP_DRAFT, TESTER_WHATS_NEW);
    assert.equal(OWNER_NEXT_SHIP_DRAFT, OWNER_WHATS_NEW);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(OWNER_WHATS_NEW, /Leftover copies can no longer undo a Turn over/);
    assert.match(TESTER_WHATS_NEW, /Leftover copies can no longer undo a Turn over/);
    assert.match(TESTER_WHATS_NEW, /sees it again with Return/);
    assert.equal(/Wendell|Joseph|Follow|Shane|apcontrolsllc|seat|security|vault|other users/i.test(TESTER_WHATS_NEW), false);
    assert.equal(
      /password|auth|cookie|session|security|Novus|vault|Drive|seats|owner tools|View as|aliases|deploy|other users|other testers|anyone else/i.test(
        TESTER_WHATS_NEW,
      ),
      false,
    );
    const live = applyWhatsNew([], "tester-v126-live", false);
    assert.equal(live[0].id, "th-desk-v1.26");
    assert.equal(live[0].messages[0]?.text, TESTER_WHATS_NEW);
    const owner = applyWhatsNew([], "owner-v126-live", true);
    assert.equal(owner[0].messages[0]?.text, OWNER_WHATS_NEW);
  });
});
