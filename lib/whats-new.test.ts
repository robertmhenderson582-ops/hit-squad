import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_LANES } from "./crew-lanes.ts";
import { displayEstimateType, ESTIMATE_TYPES } from "./estimate-type.ts";
import {
  DESK_PERSON_ID,
  DESK_THREAD_ID,
  DESK_VERSION,
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
    assert.equal(
      CREW_LANES.some((lane) => lane.id === "support"),
      true,
    );
  });
});

describe("inbox what's-new", () => {
  it("seeds a per-seat Desk thread and keeps tester copy clean", () => {
    assert.equal(DESK_VERSION, "1.14.0");
    assert.equal(DESK_VERSION_LABEL, "Hit Squad Project Controls V1.14");
    assert.equal(DESK_THREAD_ID, "th-desk-v1.14");
    assert.equal(TESTER_WHATS_NEW.startsWith(DESK_VERSION_LABEL), true);
    assert.equal(testerCopyIsSafe(TESTER_WHATS_NEW), true);
    assert.match(TESTER_WHATS_NEW, /Equipment: listed large tools plus typed third-party rental at cost \+ 6%/);
    assert.match(TESTER_WHATS_NEW, /Other Cost is reimbursables, travel, and CAT 2 misc/);
    assert.match(TESTER_WHATS_NEW, /Empty Craft travel \/ Mileage Rate stays hidden/);
    assert.match(TESTER_WHATS_NEW, /Change Order FCR packet is on the estimate/);
    assert.match(TESTER_WHATS_NEW, /Staffing follows Crew calendars and Job setup phases/);
    assert.match(TESTER_WHATS_NEW, /Multiple units is a larger Job setup control; default stays off/);
    assert.match(TESTER_WHATS_NEW, /Crew Start and End calendars no longer overlap/);
    assert.match(TESTER_WHATS_NEW, /Estimate total is a floating right-side breakdown/);
    assert.match(TESTER_WHATS_NEW, /instrument chrome \(HUD\), not paper cards/);
    assert.match(TESTER_WHATS_NEW, /Crew starts empty/);
    assert.match(TESTER_WHATS_NEW, /Opening a job keeps its ID, window, and working figure/);
    assert.match(TESTER_WHATS_NEW, /4 Wood River jobs \(3 open, 1 hold\) and 3 estimates/);
    assert.match(TESTER_WHATS_NEW, /New estimate asks for the job \/ event/);
    assert.match(TESTER_WHATS_NEW, /Escape and × close it/);
    assert.match(TESTER_WHATS_NEW, /Cost EST hours follow Crew calendars/);
    assert.match(TESTER_WHATS_NEW, /Rate burdened figures are field-trial/);
    assert.match(OWNER_WHATS_NEW, /Equipment, Other Cost, Change Order FCR, and Staffing are locked/);
    assert.match(OWNER_WHATS_NEW, /Tester seats \/ View as stay as V1.13/);
    assert.match(OWNER_WHATS_NEW, /Mileage Yes is a flat \$2,500/);
    assert.match(OWNER_WHATS_NEW, /Crew Start\/End calendars stack/);
    assert.match(OWNER_WHATS_NEW, /instrument chrome \(HUD\), not paper cards/);
    assert.match(OWNER_WHATS_NEW, /Crew starts empty/);
    assert.equal(
      /password|passwords|auth|security|Novus|vault|Drive|seats|owner tools|View as|aliases|other testers/i.test(
        TESTER_WHATS_NEW,
      ),
      false,
    );

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

  it("appends V1.14 onto an existing Hit Squad desk thread", () => {
    const prior = [
      {
        id: "th-desk-v1.11.1",
        personId: DESK_PERSON_ID,
        name: "Hit Squad",
        company: "Project Controls",
        unread: 0,
        messages: [
          {
            id: "im-desk-1.11.1",
            from: "them" as const,
            author: "Desk",
            text: "Hit Squad Project Controls V1.11",
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
