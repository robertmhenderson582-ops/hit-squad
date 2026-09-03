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
    assert.equal(DESK_VERSION, "1.51.1");
    assert.equal(DESK_VERSION_LABEL, "Hit Squad Project Controls V1.51.1");
    assert.equal(DESK_THREAD_ID, "th-desk-v1.51.1");
    assert.equal(TESTER_WHATS_NEW.startsWith(DESK_VERSION_LABEL), true);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(TESTER_WHATS_NEW, /Quality and HSE are readable field modules with fillable forms/);
    assert.match(TESTER_WHATS_NEW, /Rolling chart: set up the bank, then mark tubes on the map/);
    assert.match(TESTER_WHATS_NEW, /Jobs cards use the live desk, not an old leftover/);
    assert.equal(/poll|dedupe|optimistic/i.test(TESTER_WHATS_NEW), false);
    assert.equal(/Joseph|testers|Follow|apcontrolsllc|seat|James|CBI|View as/i.test(TESTER_WHATS_NEW), false);
    assert.equal(/Robert, Nathan, Benny, Shane, Wendell, and Chance/i.test(TESTER_WHATS_NEW), false);
    assert.match(OWNER_WHATS_NEW, /Quality and HSE are readable field modules with fillable forms/);
    assert.match(OWNER_WHATS_NEW, /Persist and Excel export stay/);
    assert.match(OWNER_WHATS_NEW, /Madison manuals stay Madison-only/);
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

    assert.deepEqual(applyWhatsNew([], "tester-joseph-new", false, "josephmhenderson2002@gmail.com"), []);
    const first = applyWhatsNew([], "tester-nathan-new", false, "nathanboyte@gmail.com");
    assert.equal(first.length, 1);
    assert.equal(first[0].personId, DESK_PERSON_ID);
    assert.equal(first[0].id, DESK_THREAD_ID);
    assert.equal(first[0].name, "Hit Squad");
    assert.equal(first[0].messages[0]?.author, "Desk");
    assert.equal(first[0].messages[0]?.text, TESTER_WHATS_NEW);

    const owner = deskWhatsNewThread(true);
    assert.equal(owner.messages[0]?.text, OWNER_WHATS_NEW);
  });

  it("appends V1.51.1 onto an existing Hit Squad desk thread after V1.38", () => {
    assert.equal(seenKey("tester-x", "1.38.0"), `${WHATS_NEW_MARK_PREFIX}1.38.0:tester-x`);
    assert.equal(seenKey("tester-x"), `${WHATS_NEW_MARK_PREFIX}1.51.1:tester-x`);
    assert.notEqual(seenKey("tester-x", "1.38.0"), seenKey("tester-x"));

    const prior = [
      {
        id: "th-desk-v1.38",
        personId: DESK_PERSON_ID,
        name: "Hit Squad",
        company: "Project Controls",
        unread: 0,
        messages: [
          {
            id: "im-desk-1.38.0",
            from: "them" as const,
            author: "Desk",
            text: "Hit Squad Project Controls V1.38",
            photo: null,
            sentAt: "",
            readAt: "seen",
          },
        ],
      },
    ];
    const next = applyWhatsNew(prior, "tester-nathan-append", false, "nathanboyte@gmail.com");
    assert.equal(next.length, 1);
    assert.equal(next[0].messages.length, 2);
    assert.equal(next[0].messages[1]?.text, TESTER_WHATS_NEW);
    assert.equal(next[0].unread, 1);
    assert.equal(applyWhatsNew(next, "tester-nathan-append", false, "nathanboyte@gmail.com")[0].messages.length, 2);
    assert.deepEqual(applyWhatsNew(prior, "tester-joseph-append", false, "josephmhenderson2002@gmail.com"), prior);
  });

  it("posts the V1.51.1 Inbox note for testers and owner", () => {
    assert.equal(DESK_VERSION, "1.51.1");
    assert.equal(NEXT_SHIP_VERSION, DESK_VERSION);
    assert.equal(NEXT_SHIP_VERSION_LABEL, DESK_VERSION_LABEL);
    assert.equal(TESTER_NEXT_SHIP_DRAFT, TESTER_WHATS_NEW);
    assert.equal(OWNER_NEXT_SHIP_DRAFT, OWNER_WHATS_NEW);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(OWNER_WHATS_NEW, /Persist and Excel export stay/);
    assert.match(OWNER_WHATS_NEW, /Madison manuals stay Madison-only/);
    assert.match(TESTER_WHATS_NEW, /Quality and HSE are readable field modules with fillable forms/);
    assert.match(TESTER_WHATS_NEW, /Jobs cards use the live desk, not an old leftover/);
    assert.equal(/Robert, Nathan, Benny, Shane, Wendell, and Chance/i.test(TESTER_WHATS_NEW), false);
    assert.equal(/poll|dedupe|optimistic/i.test(TESTER_WHATS_NEW), false);
    assert.equal(/Joseph|Follow|apcontrolsllc|seat|security|vault|other users|James|CBI|Stephanie|View as/i.test(TESTER_WHATS_NEW), false);
    assert.equal(/Robert, Nathan, Benny, Shane, Wendell, and Chance/i.test(TESTER_WHATS_NEW), false);
    assert.equal(
      /password|auth|cookie|session|security|Novus|vault|Drive|seats|owner tools|View as|aliases|deploy|other users|other testers|anyone else/i.test(
        TESTER_WHATS_NEW,
      ),
      false,
    );
    const live = applyWhatsNew([], "tester-v151-live", false, "nathanboyte@gmail.com");
    assert.equal(live[0].id, "th-desk-v1.51.1");
    assert.equal(live[0].messages[0]?.text, TESTER_WHATS_NEW);
    const owner = applyWhatsNew([], "owner-v149-live", true);
    assert.equal(owner[0].messages[0]?.text, OWNER_WHATS_NEW);
  });
});
