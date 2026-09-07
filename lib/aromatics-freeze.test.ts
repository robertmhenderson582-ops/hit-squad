import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS,
  AROMATICS_FREEZE_PROJECT_START,
  aromaticsEmbeddedFreezeClock,
  aromaticsPackIsThinner,
  aromaticsPackLooksSmashed,
  aromaticsSourceCanRestore,
  aromaticsStateLooksSmashed,
  crewClockSpanDays,
  crewRangesAreCollapsedStubs,
  isAromaticsIdentity,
} from "./aromatics-freeze.ts";
import { HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID } from "./his-wood-river.ts";
import { defaultPhaseSchedule } from "./phase-schedule.ts";

const TITLE = "2027 Aromatics Turnaround";

describe("aromatics freeze smash lock", () => {
  it("embeds the Sep 2 2027-01-11 clock and does not invent a dollar baseline", () => {
    const clock = aromaticsEmbeddedFreezeClock();
    assert.equal(AROMATICS_FREEZE_PROJECT_START, "2027-01-11");
    assert.equal(clock.projectStart, "2027-01-11");
    assert.equal(clock.phases.find((row) => row.id === "pre")?.start, "2027-01-11");
    assert.ok(AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS >= 14);
    assert.equal(isAromaticsIdentity({ packId: HIS_AROMATICS_PACK_ID }), true);
    assert.equal(isAromaticsIdentity({ packId: HIS_CAT2_PACK_ID, title: "Madison CAT 2 (Pit Stop)" }), false);
  });

  it("treats demo 2026-08-21 clock and single-day 2027 stubs as smash", () => {
    const seed = {
      packId: HIS_AROMATICS_PACK_ID,
      title: TITLE,
      schedule: defaultPhaseSchedule(),
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
    };
    const stubs = {
      packId: HIS_AROMATICS_PACK_ID,
      title: TITLE,
      schedule: aromaticsEmbeddedFreezeClock(),
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-01-11" }] }] },
    };
    const freeze = {
      packId: HIS_AROMATICS_PACK_ID,
      title: TITLE,
      schedule: aromaticsEmbeddedFreezeClock(),
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
    };
    assert.equal(crewRangesAreCollapsedStubs(seed.crew), true);
    assert.equal(crewRangesAreCollapsedStubs(stubs.crew), true);
    assert.equal(crewRangesAreCollapsedStubs(freeze.crew), false);
    assert.ok(crewClockSpanDays(freeze.crew) >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS);
    assert.equal(aromaticsPackLooksSmashed(seed), true);
    assert.equal(aromaticsPackLooksSmashed(stubs), true);
    assert.equal(aromaticsPackLooksSmashed(freeze), false);
    assert.equal(aromaticsSourceCanRestore(freeze), true);
    assert.equal(aromaticsSourceCanRestore(stubs), false);
    assert.equal(aromaticsPackIsThinner(stubs, freeze), true);
    assert.equal(aromaticsStateLooksSmashed(HIS_AROMATICS_PACK_ID, stubs.schedule, stubs.crew, TITLE), true);
  });

  it("does not flag Cat 2 short ranges as an Aromatics smash", () => {
    const cat2 = {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", start: "2026-09-01", stop: "2026-09-03" }] },
      crew: { direct: [{ id: "bm-1", ranges: [{ phaseId: "pre", start: "2026-09-01", end: "2026-09-03" }] }] },
    };
    assert.equal(aromaticsPackLooksSmashed(cat2), false);
    assert.equal(aromaticsPackIsThinner(cat2, { packId: HIS_CAT2_PACK_ID, crew: cat2.crew }), false);
  });
});
