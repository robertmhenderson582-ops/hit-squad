import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_LANES } from "./crew-lanes.ts";
import { displayEstimateType, ESTIMATE_TYPES } from "./estimate-type.ts";
import {
  DESK_PERSON_ID,
  DESK_VERSION_LABEL,
  OWNER_WHATS_NEW,
  TESTER_WHATS_NEW,
  applyWhatsNew,
  deskWhatsNewThread,
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
  });
});

describe("inbox what's-new", () => {
  it("seeds a per-seat Desk thread and keeps tester copy clean", () => {
    assert.equal(TESTER_WHATS_NEW.startsWith(DESK_VERSION_LABEL), true);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(TESTER_WHATS_NEW, /Click a card opens that estimate/);
    assert.match(TESTER_WHATS_NEW, /phase card in each window/);
    assert.match(TESTER_WHATS_NEW, /Add activity on Work Activities/);
    assert.match(OWNER_WHATS_NEW, /inherit/);
    assert.match(OWNER_WHATS_NEW, /Per-diem Headcount/);
    assert.equal(/password|auth|Novus|vault|Drive|\/tmp|SMTP|seat/i.test(TESTER_WHATS_NEW), false);

    const first = applyWhatsNew([], "tester-joseph-new", false);
    assert.equal(first.length, 1);
    assert.equal(first[0].personId, DESK_PERSON_ID);
    assert.equal(first[0].name, "Hit Squad");
    assert.equal(first[0].messages[0]?.author, "Desk");
    assert.equal(first[0].messages[0]?.text, TESTER_WHATS_NEW);

    const owner = deskWhatsNewThread(true);
    assert.equal(owner.messages[0]?.text, OWNER_WHATS_NEW);
  });

  it("appends V1.4 onto an existing Hit Squad desk thread", () => {
    const prior = [
      {
        id: "th-desk-v1.3",
        personId: DESK_PERSON_ID,
        name: "Hit Squad",
        company: "Project Controls",
        unread: 0,
        messages: [
          {
            id: "im-desk-1.3.1",
            from: "them" as const,
            author: "Desk",
            text: "Hit Squad Project Controls V1.3",
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
});
