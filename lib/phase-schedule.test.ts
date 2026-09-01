import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addUnit,
  applyOtPick,
  cascadePhases,
  defaultPhaseSchedule,
  mergeSchedule,
  otPicksForPhase,
  patchPhase,
  PHASE_OT_PICKS,
  phaseDateFieldDisabled,
  setMultiUnits,
  setProjectStart,
  sundaysInRange,
  workedDays,
} from "./phase-schedule.ts";

function readRel(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

/** Same gate DateField uses: a disabled or readOnly input never fires onChange from typing. */
function typeStartDate(
  disabled: boolean,
  readOnly: boolean,
  onChange: (value: string) => void,
  typed: string,
) {
  if (disabled || readOnly) return false;
  onChange(typed);
  return true;
}

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

  it("Mechanical stop does not disable later START pickers or block typed onChange", () => {
    let state = defaultPhaseSchedule();
    state = patchPhase(state, "pre", { start: "2027-01-11", stop: "2027-02-28", daysPerWeek: 5, hoursPerDay: 8 });
    state = patchPhase(state, "oil-out", { stop: "2027-03-10", daysPerWeek: 7, hoursPerDay: 10 });
    state = patchPhase(state, "mech", { stop: "2027-04-17", daysPerWeek: 7, hoursPerDay: 10 });
    state = patchPhase(state, "oil-in", { stop: "2027-04-24", daysPerWeek: 7, hoursPerDay: 10 });
    state = patchPhase(state, "post", { stop: "2027-05-02", daysPerWeek: 5, hoursPerDay: 8 });

    const byId = Object.fromEntries(state.phases.map((row) => [row.id, row]));
    assert.equal(byId.pre.start, "2027-01-11");
    assert.equal(byId.pre.stop, "2027-02-28");
    assert.equal(byId["oil-out"].start, "2027-03-01");
    assert.equal(byId["oil-out"].stop, "2027-03-10");
    assert.equal(byId.mech.start, "2027-03-11");
    assert.equal(byId.mech.stop, "2027-04-17");
    assert.equal(byId["oil-in"].start, "2027-04-18");
    assert.equal(byId["oil-in"].stop, "2027-04-24");
    assert.equal(byId.post.start, "2027-04-25");
    assert.equal(byId.post.stop, "2027-05-02");

    const sundays = sundaysInRange(byId.mech.start, byId.mech.stop);
    assert.equal(sundays.includes("2027-04-04"), true);
    assert.equal(sundays.includes("2027-04-11"), true);

    for (const id of ["oil-out", "mech", "oil-in", "post"] as const) {
      const row = byId[id];
      assert.equal(row.on, true, id);
      assert.equal(phaseDateFieldDisabled(row), false, `${id} start must stay enabled after Mechanical stop`);
      let typed = "";
      const fired = typeStartDate(phaseDateFieldDisabled(row), false, (value) => {
        typed = value;
      }, "2027-06-15");
      assert.equal(fired, true, `${id} START must accept typed MM/DD/YYYY`);
      assert.equal(typed, "2027-06-15");
    }

    const later = patchPhase(state, "mech", { stop: "2027-04-20" });
    assert.equal(later.phases.find((row) => row.id === "oil-in")?.start, "2027-04-21");
    assert.equal(later.phases.find((row) => row.id === "oil-in")?.stop, "2027-04-27");
    assert.equal(phaseDateFieldDisabled(later.phases.find((row) => row.id === "mech")!), false);
    assert.equal(phaseDateFieldDisabled(later.phases.find((row) => row.id === "oil-in")!), false);
    assert.equal(phaseDateFieldDisabled(later.phases.find((row) => row.id === "post")!), false);

    const ui = readRel("../components/PhaseSchedule.tsx");
    assert.doesNotMatch(ui, /startLocked|firstOn|row\.id !== firstOn/);
    const startField = ui.match(/value=\{row\.start\}[\s\S]{0,180}aria-label=\{`\$\{row\.name\} start`\}/);
    const stopField = ui.match(/value=\{row\.stop\}[\s\S]{0,180}aria-label=\{`\$\{row\.name\} stop`\}/);
    assert.ok(startField);
    assert.ok(stopField);
    assert.match(startField[0], /disabled=\{!row\.on\}/);
    assert.match(stopField[0], /disabled=\{!row\.on\}/);
    assert.match(ui, /onChange=\{\(start\) => onPatch\(row\.id, \{ start \}\)\}/);
    assert.match(ui, /onChange=\{\(stop\) => onPatch\(row\.id, \{ stop \}\)\}/);
    assert.match(ui, /Tap a Sunday to skip it/);

    const field = readRel("../components/DateField.tsx");
    assert.doesNotMatch(field, /readOnly/);
    assert.match(field, /onChange=\{\(event\) => onChange\(event\.target\.value\)\}/);
    assert.match(field, /Open calendar/);
    assert.match(field, /disabled \? null/);
  });
});
