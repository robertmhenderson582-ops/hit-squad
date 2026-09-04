import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addUnit,
  applyOtPick,
  cascadePhases,
  defaultPhaseSchedule,
  liveJobSetupPhases,
  mergeSchedule,
  otPicksForPhase,
  patchPhase,
  phaseBarRuns,
  phaseOwningDate,
  PHASE_OT_PICKS,
  PHASE_TONE_BAND_INK,
  PHASE_TONE_FILLS,
  setMultiUnits,
  setProjectStart,
  workedDays,
} from "./phase-schedule.ts";

describe("phase schedule", () => {
  it("changing Pre stop slides Oil Out and keeps Oil Out length", () => {
    const start = defaultPhaseSchedule();
    const oil = start.phases.find((row) => row.id === "oil-out");
    assert.ok(oil);
    const length = 3;
    const next = patchPhase(start, "pre", { stop: "2026-09-05" });
    const pre = next.phases.find((row) => row.id === "pre");
    const slid = next.phases.find((row) => row.id === "oil-out");
    const mech = next.phases.find((row) => row.id === "mech");
    assert.equal(pre?.stop, "2026-09-05");
    assert.equal(slid?.start, "2026-09-06");
    assert.equal(slid?.stop, "2026-09-08");
    assert.equal(
      Math.round(
        (Date.parse(slid!.stop) - Date.parse(slid!.start)) / 86_400_000,
      ) + 1,
      length,
    );
    assert.equal(mech?.start, "2026-09-09");
  });

  it("turning Oil Out off slides Mechanical into the gap", () => {
    const start = defaultPhaseSchedule();
    const mechLength =
      Math.round(
        (Date.parse("2026-09-20") - Date.parse("2026-09-07")) / 86_400_000,
      ) + 1;
    const next = patchPhase(start, "oil-out", { on: false });
    const oil = next.phases.find((row) => row.id === "oil-out");
    const mech = next.phases.find((row) => row.id === "mech");
    assert.equal(oil?.on, false);
    assert.equal(oil?.start, "2026-09-04");
    assert.equal(oil?.stop, "2026-09-06");
    assert.equal(mech?.start, "2026-09-04");
    assert.equal(mech?.stop, "2026-09-17");
    assert.equal(
      Math.round((Date.parse(mech!.stop) - Date.parse(mech!.start)) / 86_400_000) + 1,
      mechLength,
    );
    const back = patchPhase(next, "oil-out", { on: true });
    const restored = back.phases.find((row) => row.id === "oil-out");
    assert.equal(restored?.start, "2026-09-04");
    assert.equal(restored?.stop, "2026-09-06");
    assert.equal(back.phases.find((row) => row.id === "mech")?.start, "2026-09-07");
  });

  it("Total days is worked days, not calendar span", () => {
    const pre = defaultPhaseSchedule().phases.find((row) => row.id === "pre");
    assert.ok(pre);
    assert.equal(workedDays(pre), 8);
    assert.equal(workedDays({ start: "2026-09-04", stop: "2026-09-06", daysPerWeek: 7, sundaysOff: [] }), 3);
    assert.equal(workedDays({ start: "2026-09-04", stop: "2026-09-06", daysPerWeek: 7, sundaysOff: ["2026-09-06"] }), 2);
    assert.equal(workedDays({ start: "2026-09-07", stop: "2026-09-13", daysPerWeek: 5, sundaysOff: [] }), 5);
    assert.equal(workedDays({ start: "2026-09-07", stop: "2026-09-13", daysPerWeek: 6, sundaysOff: [] }), 6);
    assert.equal(workedDays({ start: "2026-08-24", stop: "2026-08-27", daysPerWeek: 4, sundaysOff: [] }), 4);
  });

  it("project start drives Pre-TAR then the rest slide", () => {
    const next = setProjectStart(defaultPhaseSchedule(), "2026-08-24");
    const pre = next.phases.find((row) => row.id === "pre");
    const oil = next.phases.find((row) => row.id === "oil-out");
    assert.equal(next.projectStart, "2026-08-24");
    assert.equal(pre?.start, "2026-08-24");
    assert.equal(pre?.stop, "2026-09-06");
    assert.equal(oil?.start, "2026-09-07");
  });

  it("4×10 picker fills days, hours, and OT split", () => {
    const ot = applyOtPick(defaultPhaseSchedule(), "pre", "4x10-ot8");
    const pre = ot.phases.find((row) => row.id === "pre");
    assert.equal(pre?.daysPerWeek, 4);
    assert.equal(pre?.hoursPerDay, 10);
    assert.equal(pre?.otAfter8, true);
    const st = applyOtPick(ot, "pre", "4x10-st");
    assert.equal(st.phases.find((row) => row.id === "pre")?.otAfter8, false);
    const post = applyOtPick(defaultPhaseSchedule(), "post", "5x8-st");
    assert.equal(post.phases.find((row) => row.id === "post")?.daysPerWeek, 5);
    assert.equal(post.phases.find((row) => row.id === "post")?.hoursPerDay, 8);
    assert.equal(post.phases.find((row) => row.id === "post")?.otAfter8, false);
    const preFive = applyOtPick(defaultPhaseSchedule(), "pre", "5x8-st");
    assert.equal(preFive.phases.find((row) => row.id === "pre")?.daysPerWeek, 5);
    assert.equal(preFive.phases.find((row) => row.id === "pre")?.hoursPerDay, 8);
    assert.equal(preFive.phases.find((row) => row.id === "pre")?.otAfter8, false);
    const preFiveOt = applyOtPick(preFive, "pre", "5x8-ot8");
    assert.equal(preFiveOt.phases.find((row) => row.id === "pre")?.otAfter8, true);
  });

  it("Pre-Turnaround schedule picker matches Post", () => {
    const pre = otPicksForPhase("pre");
    const post = otPicksForPhase("post");
    assert.ok(pre);
    assert.ok(post);
    assert.deepEqual(pre, post);
    assert.deepEqual(
      pre.map((item) => item.id),
      ["5x8-st", "5x8-ot8", "4x10-st", "4x10-ot8"],
    );
    assert.equal(PHASE_OT_PICKS.length, 4);
    assert.equal(otPicksForPhase("mech"), null);
  });

  it("merge persist never drops a locked phase", () => {
    const saved = mergeSchedule({
      projectStart: "2026-08-21",
      phases: [{ id: "pre", name: "Pre-Turnaround", on: true, start: "2026-08-21", stop: "2026-08-28", daysPerWeek: 4, hoursPerDay: 10, otAfter8: true, sundaysOff: [] }],
    });
    assert.equal(saved.phases.length, 5);
    assert.deepEqual(
      saved.phases.map((row) => row.id),
      ["pre", "oil-out", "mech", "oil-in", "post"],
    );
    assert.equal(saved.phases[0].stop, "2026-08-28");
    assert.equal(saved.phases[0].otAfter8, true);
    assert.equal(saved.phases[1].name, "Oil Out");
    const packed = cascadePhases(saved.phases);
    assert.equal(packed[1].start, "2026-08-29");
    assert.equal(saved.multiUnits, false);
    assert.deepEqual(saved.units, []);
  });

  it("Multiple units is off by default and does not clone the job timeline until turned on", () => {
    const start = defaultPhaseSchedule();
    assert.equal(start.multiUnits, false);
    assert.equal(start.units.length, 0);
    const on = setMultiUnits(start, true);
    assert.equal(on.multiUnits, true);
    assert.equal(on.units.length, 1);
    assert.equal(on.units[0].name, "Unit 1");
    assert.deepEqual(
      on.units[0].phases.map((row) => row.id),
      ["pre", "oil-out", "mech", "oil-in", "post"],
    );
    const two = addUnit(on);
    assert.equal(two.units.length, 2);
    const off = setMultiUnits(two, false);
    assert.equal(off.multiUnits, false);
    assert.equal(off.units.length, 2);
    assert.equal(off.phases.find((row) => row.id === "pre")?.start, two.units[0].phases[0].start);
  });

  it("phase owning date and bar runs follow ON Job setup windows", () => {
    const start = defaultPhaseSchedule();
    assert.equal(phaseOwningDate(start.phases, "2026-08-21")?.id, "pre");
    assert.equal(phaseOwningDate(start.phases, "2026-09-04")?.id, "oil-out");
    assert.equal(phaseOwningDate(start.phases, "2026-09-07")?.id, "mech");
    const slid = patchPhase(start, "pre", { stop: "2026-09-05" });
    assert.equal(phaseOwningDate(slid.phases, "2026-09-05")?.id, "pre");
    assert.equal(phaseOwningDate(slid.phases, "2026-09-06")?.id, "oil-out");
    const offOil = {
      ...start,
      phases: start.phases.map((row) => (row.id === "oil-out" ? { ...row, on: false } : row)),
    };
    assert.equal(liveJobSetupPhases(offOil).some((row) => row.id === "oil-out"), false);
    assert.equal(phaseOwningDate(liveJobSetupPhases(offOil), "2026-09-05"), undefined);
    const dates = ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
    const runs = phaseBarRuns(dates, liveJobSetupPhases(start));
    assert.deepEqual(
      runs.map((run) => ({ id: run.phase.id, startIndex: run.startIndex, endIndex: run.endIndex })),
      [
        { id: "oil-out", startIndex: 0, endIndex: 2 },
        { id: "mech", startIndex: 3, endIndex: 3 },
      ],
    );
  });

  it("Excel phase bar uses hard blue / red / green with white labels", () => {
    assert.equal(PHASE_TONE_FILLS.pre, "FF0B5CAD");
    assert.equal(PHASE_TONE_FILLS.post, PHASE_TONE_FILLS.pre);
    assert.equal(PHASE_TONE_FILLS["oil-out"], "FFC62828");
    assert.equal(PHASE_TONE_FILLS["oil-in"], PHASE_TONE_FILLS["oil-out"]);
    assert.equal(PHASE_TONE_FILLS.mech, "FF1B7F3A");
    assert.equal(PHASE_TONE_BAND_INK, "FFFFFFFF");
    assert.notEqual(PHASE_TONE_FILLS.pre, "FFD5E2C4");
    assert.notEqual(PHASE_TONE_FILLS.mech, "FFC5D0D5");
  });
});
