import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addSupportLine,
  assignCraftPosition,
  assignSupportBilledAs,
  assignSupportDuty,
  blankCraftRow,
  blankSupportLine,
  cloneCraftRow,
  cloneSupportLine,
  CRAFT_SHIFTS,
  craftRowFromPhases,
  defaultShiftForPhase,
  duplicateCraftRow,
  duplicateSupportLine,
  applyExtraRangeEnvelopes,
  clampExtraRangeDates,
  extraRangeEnvelope,
  extraDaysFromJobSetup,
  extraHoursFromJobSetup,
  extraRangeFromPhase,
  extraRangeIsValid,
  phaseIsOff,
  setPhaseOff,
  hydrateSupportLine,
  isListedRangeDescription,
  nextUnitId,
  phaseRangesOverlap,
  RANGE_DESCRIPTION_OTHER,
  RANGE_DESCRIPTION_REASONS,
  rangeDescriptionChoice,
  rangeDescriptionLabel,
  rangesFromPhases,
  syncCraftRows,
  syncSupportRows,
} from "./craft-labor.ts";
import { computeRowHours } from "./hours-clock.ts";
import { addUnit, defaultPhaseSchedule, defaultPhases, maskForPhaseDays, setMultiUnits } from "./phase-schedule.ts";
import { shahanCrewCostAmount } from "./shahan-wood-river.ts";

const WOOD = { site: "Wood River — Roxana, IL", client: "Phillips 66" };

function crewHours(row: Parameters<typeof computeRowHours>[0]) {
  return computeRowHours(row, WOOD.site, WOOD.client);
}

describe("crew ranges are per position", () => {
  it("gives each new position its own five phase ranges with unique ids", () => {
    const phases = defaultPhases();
    const first = craftRowFromPhases(phases);
    const second = craftRowFromPhases(phases);
    assert.equal(first.ranges.length, 5);
    assert.equal(second.ranges.length, 5);
    assert.deepEqual(
      first.ranges.map((range) => range.phaseId),
      ["pre", "oil-out", "mech", "oil-in", "post"],
    );
    const firstIds = new Set(first.ranges.map((range) => range.id));
    const secondIds = new Set(second.ranges.map((range) => range.id));
    assert.equal(firstIds.size, 5);
    assert.equal(secondIds.size, 5);
    for (const id of firstIds) assert.equal(secondIds.has(id), false);
  });

  it("Oil Out, Mechanical, and Oil In default Shift to Days & nights; Pre and Post stay Days", () => {
    assert.deepEqual([...CRAFT_SHIFTS], ["Days", "Nights", "Days & nights"]);
    assert.equal(defaultShiftForPhase("oil-out"), "Days & nights");
    assert.equal(defaultShiftForPhase("mech"), "Days & nights");
    assert.equal(defaultShiftForPhase("oil-in"), "Days & nights");
    assert.equal(defaultShiftForPhase("pre"), "Days");
    assert.equal(defaultShiftForPhase("post"), "Days");
    assert.equal(defaultShiftForPhase(undefined), "Days");

    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", defaultPhases());
    assert.equal(row.shift, "Days");
    assert.deepEqual(
      Object.fromEntries(row.ranges.map((range) => [range.phaseId, range.shift])),
      {
        pre: "Days",
        "oil-out": "Days & nights",
        mech: "Days & nights",
        "oil-in": "Days & nights",
        post: "Days",
      },
    );

    const support = addSupportLine(defaultPhases());
    assert.equal(support.ranges.find((range) => range.phaseId === "oil-out")?.shift, "Days & nights");
    assert.equal(support.ranges.find((range) => range.phaseId === "pre")?.shift, "Days");

    const extraOil = extraRangeFromPhase(
      defaultPhases().find((phase) => phase.id === "oil-out")!,
      row.ranges.find((range) => range.phaseId === "oil-out"),
    );
    assert.equal(extraOil.shift, "Days & nights");
    const extraPre = extraRangeFromPhase(
      defaultPhases().find((phase) => phase.id === "pre")!,
      row.ranges.find((range) => range.phaseId === "pre"),
    );
    assert.equal(extraPre.shift, "Days");

    const cards = readFileSync(fileURLToPath(new URL("../components/CrewPhaseCards.tsx", import.meta.url)), "utf8");
    assert.match(cards, /CRAFT_SHIFTS\.map/);
    const job = readFileSync(fileURLToPath(new URL("../components/PhaseSchedule.tsx", import.meta.url)), "utf8");
    assert.equal(/Shift/.test(job), false);
  });

  it("changing Shift on a range still sticks through sync", () => {
    const phases = defaultPhases();
    const row = assignCraftPosition(blankCraftRow(), "Pipefitter Journeyman", phases);
    row.ranges = row.ranges.map((range) =>
      range.phaseId === "oil-out" ? { ...range, shift: "Days" } : range.phaseId === "mech" ? { ...range, shift: "Nights" } : range,
    );
    const synced = syncCraftRows([row], phases)[0];
    assert.equal(synced.ranges.find((range) => range.phaseId === "oil-out")?.shift, "Days");
    assert.equal(synced.ranges.find((range) => range.phaseId === "mech")?.shift, "Nights");
    assert.equal(synced.ranges.find((range) => range.phaseId === "oil-in")?.shift, "Days & nights");
    assert.equal(synced.ranges.find((range) => range.phaseId === "pre")?.shift, "Days");
  });

  it("existing estimates with Shift=Days stay Days — no silent flip", () => {
    const phases = defaultPhases();
    const saved = craftRowFromPhases(phases);
    saved.position = "Boilermaker Journeyman";
    saved.ranges = saved.ranges.map((range) => ({ ...range, shift: "Days" as const }));
    const synced = syncCraftRows([saved], phases)[0];
    assert.equal(
      synced.ranges.every((range) => range.shift === "Days"),
      true,
    );

    const missingShift = {
      ...saved,
      ranges: saved.ranges.map(({ shift: _drop, ...range }) => range),
    };
    const revived = syncCraftRows([missingShift], phases)[0];
    assert.equal(
      revived.ranges.every((range) => range.shift === "Days"),
      true,
    );
  });

  it("keeps one position's shift and headcount when another position is synced", () => {
    const phases = defaultPhases();
    const boilermaker = craftRowFromPhases(phases);
    boilermaker.position = "Boilermaker Journeyman";
    boilermaker.ranges = boilermaker.ranges.map((range) =>
      range.phaseId === "pre" ? { ...range, shift: "Nights", headcount: 4, perDiemPeople: 3 } : range,
    );
    const pipe = craftRowFromPhases(phases);
    pipe.position = "Pipefitter Journeyman";
    const next = syncCraftRows([boilermaker, pipe], phases);
    const preA = next[0].ranges.find((range) => range.phaseId === "pre");
    const preB = next[1].ranges.find((range) => range.phaseId === "pre");
    assert.equal(preA?.shift, "Nights");
    assert.equal(preA?.headcount, 4);
    assert.equal(preA?.perDiemPeople, 3);
    assert.equal(preB?.shift, "Days");
    assert.equal(preB?.headcount, 1);
    assert.notEqual(preA?.id, preB?.id);
  });

  it("duplicate copies hours but gets new range ids and stays a separate row", () => {
    const row = craftRowFromPhases(defaultPhases());
    row.ranges[0].headcount = 6;
    const copy = cloneCraftRow(row);
    assert.equal(copy.id === row.id, false);
    assert.equal(copy.ranges[0].headcount, 6);
    assert.equal(copy.ranges[0].id === row.ranges[0].id, false);
  });

  it("keeps extra date ranges and Sunday skip chips on a position through sync", () => {
    const phases = defaultPhases();
    const oil = phases.find((row) => row.id === "oil-out");
    assert.ok(oil);
    const row = craftRowFromPhases(phases);
    const extra = extraRangeFromPhase(oil, row.ranges.find((range) => range.phaseId === "oil-out"));
    extra.skipDates = ["2026-09-06"];
    extra.headcount = 2;
    row.ranges.push(extra);
    const next = syncCraftRows([row], phases)[0];
    const oils = next.ranges.filter((range) => range.phaseId === "oil-out");
    assert.equal(oils.length, 2);
    assert.deepEqual(oils[1].skipDates, ["2026-09-06"]);
    assert.equal(oils[1].headcount, 2);
    assert.notEqual(oils[0].id, oils[1].id);
  });

  it("duplicate copies Sunday skips without sharing the array", () => {
    const row = craftRowFromPhases(defaultPhases());
    row.ranges[0].skipDates = ["2026-09-06"];
    const copy = cloneCraftRow(row);
    copy.ranges[0].skipDates?.push("2026-09-13");
    assert.deepEqual(row.ranges[0].skipDates, ["2026-09-06"]);
    assert.deepEqual(copy.ranges[0].skipDates, ["2026-09-06", "2026-09-13"]);
  });

  it("copies Job setup OT-after-8 onto each phase range", () => {
    const phases = defaultPhases().map((row) =>
      row.id === "pre" ? { ...row, otAfter8: true, hoursPerDay: 10, daysPerWeek: 4 } : row,
    );
    const ranges = rangesFromPhases(phases);
    assert.equal(ranges.find((range) => range.phaseId === "pre")?.otAfter8, true);
    assert.equal(ranges.find((range) => range.phaseId === "mech")?.otAfter8, false);
    const synced = syncCraftRows([craftRowFromPhases(defaultPhases())], phases)[0];
    assert.equal(synced.ranges.find((range) => range.phaseId === "pre")?.otAfter8, true);
  });

  it("does not invent ranges for OFF phases so hours stay on worked windows", () => {
    const phases = defaultPhases().map((row) => (row.id === "oil-out" ? { ...row, on: false } : row));
    const ranges = rangesFromPhases(phases);
    assert.equal(ranges.some((range) => range.phaseId === "oil-out"), false);
    assert.equal(ranges.length, 4);
  });

  it("tags a second date range as the next unit without cloning the position row", () => {
    const schedule = addUnit(setMultiUnits(defaultPhaseSchedule(), true));
    const [unitA, unitB] = schedule.units;
    const row = craftRowFromPhases(schedule.phases, schedule.units, true);
    assert.equal(row.ranges.filter((range) => range.phaseId === "pre").length, 1);
    assert.equal(row.ranges.find((range) => range.phaseId === "pre")?.unitId, unitA.id);
    const extra = extraRangeFromPhase(
      unitB.phases.find((item) => item.id === "pre")!,
      row.ranges.find((range) => range.phaseId === "pre"),
      nextUnitId(schedule.units, row.ranges.filter((range) => range.phaseId === "pre")),
    );
    assert.equal(extra.unitId, unitB.id);
    row.ranges.push(extra);
    const synced = syncCraftRows([row], schedule.phases, schedule.units, true);
    assert.equal(synced.length, 1);
    const pres = synced[0].ranges.filter((range) => range.phaseId === "pre");
    assert.equal(pres.length, 2);
    assert.equal(pres[0].unitId, unitA.id);
    assert.equal(pres[1].unitId, unitB.id);
    const off = syncCraftRows(synced, schedule.phases, schedule.units, false);
    assert.equal(off[0].ranges.filter((range) => range.phaseId === "pre").length, 2);
    assert.equal(off[0].ranges.find((range) => range.phaseId === "pre")?.start, schedule.phases[0].start);
  });

  it("adds a position empty — no hours until a real craft is chosen", () => {
    const phases = defaultPhases();
    const empty = blankCraftRow();
    assert.equal(empty.position, "");
    assert.equal(empty.ranges.length, 0);
    assert.equal(computeRowHours(empty).hours, 0);
    const synced = syncCraftRows([empty], phases)[0];
    assert.equal(synced.ranges.length, 0);
    const assigned = assignCraftPosition(empty, "Boilermaker Journeyman", phases);
    assert.equal(assigned.position, "Boilermaker Journeyman");
    assert.equal(assigned.ranges.length, 5);
    assert.ok(computeRowHours(assigned, "Wood River", "Phillips 66").hours > 0);
  });

  it("adds a second date range empty so it does not clone and double-count", () => {
    const phases = defaultPhases();
    const oil = phases.find((row) => row.id === "oil-out");
    assert.ok(oil);
    const row = craftRowFromPhases(phases);
    row.position = "Pipefitter Journeyman";
    const first = row.ranges.find((range) => range.phaseId === "oil-out");
    assert.ok(first);
    const extra = extraRangeFromPhase(oil, first);
    assert.equal(extra.start, "");
    assert.equal(extra.end, "");
    assert.equal(extra.hoursPerShift, oil.hoursPerDay);
    assert.equal(phaseRangesOverlap([first, extra], "oil-out"), false);
    extra.start = first.start;
    extra.end = first.end;
    assert.equal(phaseRangesOverlap([first, extra], "oil-out"), true);
  });

  it("adding a second Pre-Turnaround range does not clone 08/21→09/03 × 10 × 1", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = craftRowFromPhases(phases);
    row.position = "Boilermaker Journeyman";
    const first = row.ranges.find((range) => range.phaseId === "pre");
    assert.ok(first);
    assert.equal(first.start, "2026-08-21");
    assert.equal(first.end, "2026-09-03");
    assert.equal(first.hoursPerShift, 10);
    assert.equal(first.headcount, 1);
    const before = computeRowHours(row, "Wood River — Roxana, IL", "Phillips 66");
    const extra = extraRangeFromPhase(pre, first);
    assert.equal(extra.start, "");
    assert.equal(extra.end, "");
    assert.equal(extra.hoursPerShift, pre.hoursPerDay);
    assert.notEqual(
      `${extra.start}→${extra.end}×${extra.hoursPerShift}×${extra.headcount}`,
      "2026-08-21→2026-09-03×10×1",
    );
    assert.equal(phaseRangesOverlap([first, extra], "pre"), false);
    row.ranges.push(extra);
    const synced = syncCraftRows([row], phases)[0];
    const pres = synced.ranges.filter((range) => range.phaseId === "pre");
    assert.equal(pres.length, 2);
    assert.equal(pres[1].start, "");
    assert.equal(pres[1].end, "");
    assert.equal(pres[1].hoursPerShift, pre.hoursPerDay);
    assert.equal(phaseRangesOverlap(pres, "pre"), false);
    const after = computeRowHours(synced, "Wood River — Roxana, IL", "Phillips 66");
    assert.equal(after.hours, before.hours);
  });
});

describe("support position calendars", () => {
  it("adding a Support position seeds Job setup phase dates, not only Add a date range", () => {
    const phases = defaultPhases();
    const added = addSupportLine(phases);
    const direct = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);

    assert.equal(added.position, "");
    assert.equal(added.billedAs, "");
    assert.equal(added.ranges.length, direct.ranges.length);
    assert.equal(added.ranges.length > 0, true);
    assert.deepEqual(
      added.ranges.map((range) => range.phaseId),
      direct.ranges.map((range) => range.phaseId),
    );
    for (const phase of phases.filter((row) => row.on)) {
      const range = added.ranges.find((item) => item.phaseId === phase.id);
      assert.ok(range, `missing ${phase.id} calendar`);
      assert.equal(range.start, phase.start);
      assert.equal(range.end, phase.stop);
      assert.equal(range.hoursPerShift, phase.hoursPerDay);
    }
    assert.equal(
      added.ranges.every((range) => range.start === "" && range.end === ""),
      false,
    );

    const titled = assignSupportBilledAs(
      assignSupportDuty(added, "Tool Room Attendant", phases),
      "Boilermaker Journeyman",
      phases,
    );
    assert.equal(titled.position, "Tool Room Attendant");
    assert.equal(titled.billedAs, "Boilermaker Journeyman");
    assert.equal(titled.ranges.find((range) => range.phaseId === "pre")?.start, phases[0].start);
  });

  it("Hours / shift stays a per-position override above the Job setup seed", () => {
    const phases = defaultPhases();
    const postPhase = phases.find((row) => row.id === "post");
    const nightsPhase = phases.find((row) => row.id === "oil-out");
    assert.equal(postPhase?.hoursPerDay, 8);
    assert.equal(nightsPhase?.hoursPerDay, 12);

    const added = addSupportLine(phases);
    assert.equal(added.ranges.find((range) => range.phaseId === "post")?.hoursPerShift, 8);
    assert.equal(added.ranges.find((range) => range.phaseId === "oil-out")?.hoursPerShift, 12);

    const raised = {
      ...assignSupportDuty(added, "Tool Room Attendant", phases),
      ranges: added.ranges.map((range) => {
        if (range.phaseId === "post") return { ...range, hoursPerShift: 10 };
        if (range.phaseId === "oil-out") return { ...range, hoursPerShift: 13 };
        return range;
      }),
    };
    const synced = syncSupportRows([raised], phases)[0];
    assert.equal(synced.ranges.find((range) => range.phaseId === "post")?.hoursPerShift, 10);
    assert.equal(synced.ranges.find((range) => range.phaseId === "oil-out")?.hoursPerShift, 13);

    const staff = craftRowFromPhases(phases);
    staff.position = "Project Controls";
    staff.ranges = staff.ranges.map((range) =>
      range.phaseId === "post" ? { ...range, hoursPerShift: 10 } : range,
    );
    const staffSynced = syncCraftRows([staff], phases)[0];
    assert.equal(staffSynced.ranges.find((range) => range.phaseId === "post")?.hoursPerShift, 10);

    const seededHours = computeRowHours(
      { ...synced, ranges: addSupportLine(phases).ranges },
      "Wood River — Roxana, IL",
      "Phillips 66",
    );
    const overrideHours = computeRowHours(synced, "Wood River — Roxana, IL", "Phillips 66");
    assert.equal(overrideHours.hours > seededHours.hours, true);
  });

  it("duplicate keeps Position, Billed as, and hours, and a titled Support row has ST/OT/hours", () => {
    const phases = defaultPhases();
    const row = assignSupportBilledAs(
      assignSupportDuty(addSupportLine(phases), "Tool Room Attendant", phases),
      "Boilermaker Journeyman",
      phases,
    );
    const hours = computeRowHours(row, "Wood River — Roxana, IL", "Phillips 66");
    assert.equal(hours.hours > 0, true);
    assert.equal(hours.st > 0, true);
    const copy = cloneSupportLine(row);
    assert.equal(copy.id === row.id, false);
    assert.equal(copy.position, "Tool Room Attendant");
    assert.equal(copy.billedAs, "Boilermaker Journeyman");
    assert.equal(copy.ranges[0].id === row.ranges[0].id, false);
    assert.equal(computeRowHours(copy, "Wood River — Roxana, IL", "Phillips 66").hours, hours.hours);
  });

  it("keeps old saved Position + Billed as and fills phase ranges", () => {
    const phases = defaultPhases();
    const saved = hydrateSupportLine({
      id: "sup-old",
      position: "Tool Room Attendant",
      billedAs: "Boilermaker Journeyman",
    });
    assert.equal(saved.ranges.length, 0);
    const next = syncSupportRows([saved], phases)[0];
    const direct = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    assert.equal(next.id, "sup-old");
    assert.equal(next.position, "Tool Room Attendant");
    assert.equal(next.billedAs, "Boilermaker Journeyman");
    assert.deepEqual(
      next.ranges.map((range) => range.phaseId),
      direct.ranges.map((range) => range.phaseId),
    );
    assert.equal(next.ranges.length, 5);
  });
});

describe("duplicate position keeps the same ST/OT/DT/PD/cost", () => {
  it("proves re-seeding from Job setup drifts ST hours off a customized source", () => {
    const phases = defaultPhases();
    const source = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    source.ranges = source.ranges.map((range, index) =>
      index === 0
        ? { ...range, hoursPerShift: 12, otAfter8: true, skipDates: ["2026-08-23"] }
        : range,
    );
    const sourceHours = crewHours(source);
    assert.ok(sourceHours.hours > 0);
    assert.ok(sourceHours.st > 0);

    const reseeds = assignCraftPosition(blankCraftRow(), source.position, phases);
    const reseedHours = crewHours(reseeds);
    assert.notEqual(
      `${reseedHours.st}/${reseedHours.ot}/${reseedHours.dt}/${reseedHours.pd}`,
      `${sourceHours.st}/${sourceHours.ot}/${sourceHours.dt}/${sourceHours.pd}`,
      "assigning the title again from Job setup must not be what Duplicate does",
    );
    assert.notEqual(reseedHours.st, sourceHours.st);
  });

  it("duplicate of a filled craft row keeps ST/OT/DT/PD, book cost, and the name", () => {
    const phases = defaultPhases();
    const source = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    source.ranges = source.ranges.map((range, index) =>
      index === 0
        ? { ...range, hoursPerShift: 12, otAfter8: true, skipDates: ["2026-08-23"] }
        : range,
    );
    const sourceHours = crewHours(source);
    const sourceCost = shahanCrewCostAmount(source.position, sourceHours);
    assert.ok(sourceCost > 0);

    const copy = duplicateCraftRow(source);
    const copyHours = crewHours(copy);
    assert.equal(copy.id === source.id, false);
    assert.equal(copy.position, "Boilermaker Journeyman");
    assert.equal(copyHours.st, sourceHours.st);
    assert.equal(copyHours.ot, sourceHours.ot);
    assert.equal(copyHours.dt, sourceHours.dt);
    assert.equal(copyHours.pd, sourceHours.pd);
    assert.equal(copyHours.hours, sourceHours.hours);
    assert.equal(shahanCrewCostAmount(copy.position, copyHours), sourceCost);
    assert.equal(copy.ranges[0].hoursPerShift, 12);
    assert.equal(copy.ranges[0].otAfter8, true);
    assert.deepEqual(copy.ranges[0].skipDates, ["2026-08-23"]);
    assert.equal(copy.ranges[0].id === source.ranges[0].id, false);
  });

  it("duplicate of a named staff row stays named and keeps the staff ST split", () => {
    const phases = defaultPhases();
    const source = assignCraftPosition(blankCraftRow(), "Asst Superintendent 01", phases);
    const staffHours = computeRowHours(source, "", "");
    const staffCost = shahanCrewCostAmount(source.position, staffHours);
    assert.ok(staffHours.st > 0);
    assert.ok(staffCost > 0);

    const copy = duplicateCraftRow(source);
    assert.equal(copy.position, "Asst Superintendent 01");
    const copyHours = computeRowHours(copy, "", "");
    assert.equal(copyHours.st, staffHours.st);
    assert.equal(copyHours.ot, staffHours.ot);
    assert.equal(copyHours.dt, staffHours.dt);
    assert.equal(copyHours.pd, staffHours.pd);
    assert.equal(shahanCrewCostAmount(copy.position, copyHours), staffCost);

    const asCraft = { ...copy, position: "Boilermaker Journeyman" };
    const craftHours = computeRowHours(asCraft, "", "");
    assert.notEqual(craftHours.st, staffHours.st, "losing the staff title changes ST on the customer clock");
    assert.equal(computeRowHours({ ...copy, position: "" }, "", "").hours, 0);
  });

  it("does not leave phantom hours on an unnamed Select position copy", () => {
    const phases = defaultPhases();
    const named = assignCraftPosition(blankCraftRow(), "Pipefitter Journeyman", phases);
    const ghost = { ...named, position: "" };
    assert.ok(ghost.ranges.length > 0);
    assert.equal(crewHours(ghost).hours, 0);
    const copy = duplicateCraftRow(ghost);
    assert.equal(copy.position, "");
    assert.equal(copy.ranges.length, 0);
    assert.equal(crewHours(copy).hours, 0);
  });

  it("duplicate Support keeps Position, Billed as, and the same hours/cost", () => {
    const phases = defaultPhases();
    const row = assignSupportBilledAs(
      assignSupportDuty(addSupportLine(phases), "Tool Room Attendant", phases),
      "Boilermaker Journeyman",
      phases,
    );
    const hours = crewHours(row);
    const cost = shahanCrewCostAmount(row.billedAs, hours);
    assert.ok(hours.st > 0);
    assert.ok(cost > 0);
    const copy = duplicateSupportLine(row);
    assert.equal(copy.position, "Tool Room Attendant");
    assert.equal(copy.billedAs, "Boilermaker Journeyman");
    const copyHours = crewHours(copy);
    assert.equal(copyHours.st, hours.st);
    assert.equal(copyHours.ot, hours.ot);
    assert.equal(copyHours.dt, hours.dt);
    assert.equal(copyHours.pd, hours.pd);
    assert.equal(shahanCrewCostAmount(copy.billedAs, copyHours), cost);
  });

  it("crew Duplicate copies the source row — it does not assign a fresh Job setup calendar", () => {
    const grid = readFileSync(fileURLToPath(new URL("../components/CraftLaborGrid.tsx", import.meta.url)), "utf8");
    assert.match(grid, /duplicateCraftRow/);
    assert.equal(grid.includes("assignCraftPosition(blankCraftRow()"), false);
    const support = readFileSync(fileURLToPath(new URL("../components/SupportCrewCard.tsx", import.meta.url)), "utf8");
    assert.match(support, /duplicateSupportLine/);
  });
});

function splitKey(hours: { st: number; ot: number; dt: number; pd: number; hours: number }) {
  return `${hours.st}/${hours.ot}/${hours.dt}/${hours.pd}/${hours.hours}`;
}

/** V1.31 Description / Off math was measured on Days. Pin so those numbers stay the same. */
function daysOnly<T extends { ranges: Array<{ shift?: string }> }>(row: T): T {
  return {
    ...row,
    ranges: row.ranges.map((range) => ({ ...range, shift: "Days" as const })),
  };
}

function insidePreComeback(template: ReturnType<typeof extraRangeFromPhase>) {
  return {
    ...template,
    start: "2026-08-24",
    end: "2026-08-28",
    hoursPerShift: 8.5,
    headcount: 1,
    perDiemPeople: 1,
    nightHeadcount: 1,
    nightPerDiemPeople: 0,
    days: [false, true, true, true, true, true, false],
    shift: "Days" as const,
  };
}

describe("extra range description is a label only", () => {
  it("locks the reason list and saves custom Other text", () => {
    assert.deepEqual([...RANGE_DESCRIPTION_REASONS], [
      "Hiring progression",
      "Ramp-down",
      "Training",
      "Onboarding/Learning",
    ]);
    assert.equal(isListedRangeDescription("Ramp-down"), true);
    assert.equal(RANGE_DESCRIPTION_OTHER, "Other");
    assert.equal(isListedRangeDescription("Onboarding/Learning"), true);
    assert.equal(rangeDescriptionChoice("Onboarding/Learning"), "Onboarding/Learning");
    assert.equal(rangeDescriptionChoice("come back after sit-out"), RANGE_DESCRIPTION_OTHER);
    assert.equal(rangeDescriptionLabel("  Training  "), "Training");
    assert.equal(rangeDescriptionChoice(""), "");
    assert.equal(rangeDescriptionChoice("", true), RANGE_DESCRIPTION_OTHER);
  });

  it("first range without a description still totals 268 ST / 76 OT / 24 DT / 36 PD", () => {
    const phases = defaultPhases();
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    assert.equal(row.ranges.every((range) => !range.description), true);
    const hours = crewHours(row);
    assert.equal(splitKey(hours), "268/76/24/36/368");
    const unlabeled = {
      ...row,
      ranges: row.ranges.map(({ description: _drop, ...range }) => range),
    };
    assert.equal(splitKey(crewHours(unlabeled)), "268/76/24/36/368");
  });

  it("extra range still starts empty so hours do not copy from the first range", () => {
    const phases = defaultPhases();
    const oil = phases.find((row) => row.id === "oil-out");
    assert.ok(oil);
    const row = assignCraftPosition(blankCraftRow(), "Pipefitter Journeyman", phases);
    const first = row.ranges.find((range) => range.phaseId === "oil-out");
    assert.ok(first);
    const before = crewHours(row);
    const extra = extraRangeFromPhase(oil, first);
    assert.equal(extra.start, "");
    assert.equal(extra.end, "");
    assert.equal(extra.hoursPerShift, oil.hoursPerDay);
    assert.equal(extra.description, "");
    row.ranges.push(extra);
    assert.equal(splitKey(crewHours(row)), splitKey(before));
  });

  it("setting a description on an extra range does not change ST/OT/DT/PD", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const first = row.ranges.find((range) => range.phaseId === "pre");
    assert.ok(first);
    const extra = insidePreComeback(extraRangeFromPhase(pre, first));
    assert.equal(extraRangeIsValid(extra, first, pre), true);
    const unlabeled = { ...row, ranges: [...row.ranges, extra] };
    const listed = { ...row, ranges: [...row.ranges, { ...extra, description: "Onboarding/Learning" }] };
    const custom = { ...row, ranges: [...row.ranges, { ...extra, description: "sit out, then come back" }] };
    const unlabeledHours = crewHours(unlabeled);
    assert.equal(splitKey(unlabeledHours), "308/78.5/24/41/410.5");
    assert.equal(splitKey(crewHours(listed)), splitKey(unlabeledHours));
    assert.equal(splitKey(crewHours(custom)), splitKey(unlabeledHours));
    const extraSplit = computeRowHours({ ...row, ranges: [extra] }, WOOD.site, WOOD.client);
    assert.equal(splitKey(extraSplit), "40/2.5/0/5/42.5");
    assert.equal(
      splitKey(computeRowHours({ ...row, ranges: [{ ...extra, description: "Training" }] }, WOOD.site, WOOD.client)),
      "40/2.5/0/5/42.5",
    );
    const listedCost = shahanCrewCostAmount(listed.position, crewHours(listed));
    assert.equal(shahanCrewCostAmount(unlabeled.position, unlabeledHours), listedCost);
  });

  it("description still does not change math on the Days & nights default", () => {
    const phases = defaultPhases();
    const oil = phases.find((row) => row.id === "oil-out");
    assert.ok(oil);
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    assert.equal(row.ranges.find((range) => range.phaseId === "oil-out")?.shift, "Days & nights");
    const first = row.ranges.find((range) => range.phaseId === "oil-out");
    assert.ok(first);
    const extra = extraRangeFromPhase(oil, first);
    extra.start = first.start;
    extra.end = first.end;
    extra.hoursPerShift = 0;
    extra.description = "";
    const unlabeled = { ...row, ranges: [...row.ranges, extra] };
    const labeled = { ...row, ranges: [...row.ranges, { ...extra, description: "Training" }] };
    assert.equal(splitKey(crewHours(labeled)), splitKey(crewHours(unlabeled)));
    assert.equal(splitKey(crewHours(row)), splitKey(crewHours({ ...row, ranges: row.ranges.map((range) => ({ ...range, description: "Hiring progression" })) })));
  });

  it("empty extra does not double-count; overlapping dates inside the first range still bill twice", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    const first = row.ranges.find((range) => range.phaseId === "pre");
    assert.ok(first);
    const before = crewHours(row);
    const empty = extraRangeFromPhase(pre, first);
    empty.description = "Hiring progression";
    assert.equal(empty.start, "");
    assert.equal(extraRangeIsValid(empty, first, pre), true);
    assert.equal(phaseRangesOverlap([first, empty], "pre"), false);
    assert.equal(splitKey(crewHours({ ...row, ranges: [...row.ranges, empty] })), splitKey(before));

    const extra = insidePreComeback(empty);
    extra.description = "Hiring progression";
    assert.equal(extraRangeIsValid(extra, first, pre), true);
    assert.equal(phaseRangesOverlap([first, extra], "pre"), true);
    const added = crewHours({ ...row, ranges: [...row.ranges, extra] });
    assert.equal(added.st, before.st + 40);
    assert.equal(added.ot, before.ot + 2.5);
    assert.equal(added.dt, before.dt);
    assert.equal(added.pd, before.pd + 5);
    assert.equal(added.hours, before.hours + 42.5);

    const overlap = {
      ...extra,
      start: first.start,
      end: first.end,
      hoursPerShift: first.hoursPerShift,
      days: [...first.days],
      skipDates: first.skipDates ? [...first.skipDates] : [],
    };
    assert.equal(phaseRangesOverlap([first, overlap], "pre"), true);
    const doubled = crewHours({ ...row, ranges: [...row.ranges, overlap] });
    const firstOnly = computeRowHours({ ...row, ranges: [first] }, WOOD.site, WOOD.client);
    assert.equal(doubled.st, before.st + firstOnly.st);
    assert.equal(doubled.ot, before.ot + firstOnly.ot);
    assert.equal(doubled.dt, before.dt + firstOnly.dt);
    assert.equal(doubled.pd, before.pd + firstOnly.pd);
    assert.ok(doubled.hours > before.hours);
  });

  it("extra range cannot leave Job setup phase dates, but can sit past the first range", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    const first = row.ranges.find((range) => range.phaseId === "pre");
    assert.ok(first);
    const envelope = extraRangeEnvelope(first, pre);
    assert.deepEqual(envelope, { minStart: "2026-08-21", maxEnd: "2026-09-03" });
    const early = { ...insidePreComeback(extraRangeFromPhase(pre, first)), start: "2026-08-20" };
    const late = { ...insidePreComeback(extraRangeFromPhase(pre, first)), end: "2026-09-04" };
    const after = { ...insidePreComeback(extraRangeFromPhase(pre, first)), start: "2027-02-01", end: "2027-02-28" };
    assert.equal(extraRangeIsValid(early, first, pre), false);
    assert.equal(extraRangeIsValid(late, first, pre), false);
    assert.equal(extraRangeIsValid(after, first, pre), false);
    assert.equal(clampExtraRangeDates(early, envelope).start, "2026-08-21");
    assert.equal(clampExtraRangeDates(late, envelope).end, "2026-09-03");
    const clampedAfter = clampExtraRangeDates(after, envelope);
    assert.equal(clampedAfter.start, "2026-09-03");
    assert.equal(clampedAfter.end, "2026-09-03");
    assert.equal(extraRangeIsValid(clampedAfter, first, pre), true);
    assert.equal(extraRangeIsValid(insidePreComeback(extraRangeFromPhase(pre, first)), first, pre), true);

    const shortFirst = { ...first, end: "2026-08-25" };
    const pastFirst = { start: "2026-08-26", end: "2026-09-03" };
    assert.ok(shortFirst.end < pre.stop);
    assert.ok(pastFirst.start > shortFirst.end);
    assert.equal(extraRangeIsValid(pastFirst, shortFirst, pre), true);
    assert.deepEqual(clampExtraRangeDates(pastFirst, extraRangeEnvelope(shortFirst, pre)), pastFirst);
    assert.deepEqual(extraRangeEnvelope({ ...first, start: "2026-08-01", end: "2026-09-15" }, pre), envelope);

    row.ranges = row.ranges.map((range) => (range.phaseId === "pre" ? shortFirst : range));
    row.ranges.push({ ...extraRangeFromPhase(pre, shortFirst), ...pastFirst, hoursPerShift: 8 });
    const synced = applyExtraRangeEnvelopes(syncCraftRows([row], phases)[0].ranges, phases);
    const extras = synced.filter((range) => range.phaseId === "pre");
    assert.equal(extras.length, 2);
    assert.equal(extras[0].end, "2026-08-25");
    assert.equal(extras[1].start, "2026-08-26");
    assert.equal(extras[1].end, "2026-09-03");
    assert.ok(extras[1].start > extras[0].end);
  });

  it("Mechanical ramp-down 8 then 7 is sequential hours, not a double-count", () => {
    const phases = defaultPhases();
    const mech = phases.find((row) => row.id === "mech");
    assert.ok(mech);
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const first = row.ranges.find((range) => range.phaseId === "mech");
    assert.ok(first);
    first.start = mech.start;
    first.end = "2026-09-12";
    first.headcount = 8;
    first.perDiemPeople = 8;
    first.description = "Hiring progression";
    assert.ok(first.end < mech.stop);

    const extra = extraRangeFromPhase(mech, first);
    extra.start = "2026-09-13";
    extra.end = mech.stop;
    extra.hoursPerShift = first.hoursPerShift;
    extra.headcount = 7;
    extra.perDiemPeople = 7;
    extra.nightHeadcount = 7;
    extra.nightPerDiemPeople = 0;
    extra.days = [...first.days];
    extra.shift = "Days";
    extra.description = "Ramp-down";
    assert.ok(extra.start > first.end);
    assert.equal(extra.end, mech.stop);
    assert.equal(extraRangeIsValid(extra, first, mech), true);
    assert.equal(phaseRangesOverlap([first, extra], "mech"), false);

    const outside = { ...extra, start: "2026-09-06", end: "2026-09-10" };
    assert.equal(extraRangeIsValid(outside, first, mech), false);
    const pastPhase = { ...extra, start: "2026-09-14", end: "2026-09-21" };
    assert.equal(extraRangeIsValid(pastPhase, first, mech), false);

    row.ranges = row.ranges.map((range) => (range.phaseId === "mech" ? first : range));
    row.ranges.push(extra);
    const combined = crewHours({ ...row, ranges: [first, extra] });
    const eight = computeRowHours({ ...row, ranges: [first] }, WOOD.site, WOOD.client);
    const seven = computeRowHours({ ...row, ranges: [extra] }, WOOD.site, WOOD.client);
    assert.ok(eight.hours > 0);
    assert.ok(seven.hours > 0);
    assert.equal(combined.st, eight.st + seven.st);
    assert.equal(combined.ot, eight.ot + seven.ot);
    assert.equal(combined.dt, eight.dt + seven.dt);
    assert.equal(combined.pd, eight.pd + seven.pd);
    assert.equal(combined.hours, eight.hours + seven.hours);
    assert.equal(splitKey(crewHours({ ...row, ranges: [{ ...first, description: "Ramp-down" }, extra] })), splitKey(combined));

    const synced = syncCraftRows([{ ...row, ranges: row.ranges }], phases)[0];
    const mechs = synced.ranges.filter((range) => range.phaseId === "mech");
    assert.equal(mechs[0]?.end, "2026-09-12");
    assert.equal(mechs[1]?.start, "2026-09-13");
    assert.equal(mechs[1]?.end, mech.stop);
    assert.equal(mechs[1]?.description, "Ramp-down");
  });

  it("keeps the description through sync and Duplicate, and Remove drops that stretch", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const extra = insidePreComeback(extraRangeFromPhase(pre, row.ranges.find((range) => range.phaseId === "pre")));
    extra.description = "Onboarding/Learning";
    row.ranges.push(extra);
    const synced = syncCraftRows([row], phases)[0];
    const pres = synced.ranges.filter((range) => range.phaseId === "pre");
    assert.equal(pres.length, 2);
    assert.equal(pres[1].description, "Onboarding/Learning");
    assert.equal(pres[1].start, "2026-08-24");
    assert.equal(pres[1].end, "2026-08-28");
    const copy = duplicateCraftRow(synced);
    assert.equal(copy.ranges.filter((range) => range.phaseId === "pre")[1]?.description, "Onboarding/Learning");
    assert.equal(splitKey(crewHours(copy)), splitKey(crewHours(synced)));
    const removed = { ...synced, ranges: synced.ranges.filter((range) => range.id !== pres[1].id) };
    assert.equal(removed.ranges.filter((range) => range.phaseId === "pre").length, 1);
    assert.equal(splitKey(crewHours(removed)), "268/76/24/36/368");
  });

  it("Staff through Support share the Description control and extra-range envelope on CrewPhaseCards", () => {
    const cards = readFileSync(fileURLToPath(new URL("../components/CrewPhaseCards.tsx", import.meta.url)), "utf8");
    assert.match(cards, /Description/);
    assert.match(cards, /RANGE_DESCRIPTION_REASONS/);
    assert.match(cards, /RANGE_DESCRIPTION_OTHER/);
    const labor = readFileSync(fileURLToPath(new URL("./craft-labor.ts", import.meta.url)), "utf8");
    assert.match(labor, /Hiring progression/);
    assert.match(labor, /Ramp-down/);
    assert.match(labor, /Onboarding\/Learning/);
    assert.match(cards, /showDescription/);
    assert.match(cards, /line-chip/);
    assert.match(cards, /extraRangeEnvelope/);
    assert.match(cards, /min=\{envelope\?\.minStart\}/);
    assert.match(cards, /max=\{envelope\?\.maxEnd\}/);
    const field = readFileSync(fileURLToPath(new URL("../components/DateField.tsx", import.meta.url)), "utf8");
    assert.match(field, /min=\{min \|\| undefined\}/);
    assert.match(field, /max=\{max \|\| undefined\}/);
    const grid = readFileSync(fileURLToPath(new URL("../components/CraftLaborGrid.tsx", import.meta.url)), "utf8");
    const support = readFileSync(fileURLToPath(new URL("../components/SupportCrewCard.tsx", import.meta.url)), "utf8");
    assert.match(grid, /CrewPhaseCards/);
    assert.match(support, /CrewPhaseCards/);
    assert.match(grid, /applyExtraRangeEnvelopes/);
    assert.match(support, /applyExtraRangeEnvelopes/);
    assert.match(cards, /Off this position/);
    assert.match(cards, /Restore/);
    assert.match(cards, /onSetPhaseOff/);
    assert.match(grid, /setPhaseOff/);
    assert.match(support, /setPhaseOff/);
  });
});

describe("extra Crew ranges default Hours/shift from Job setup", () => {
  it("Mechanical Hrs/Day 10 and Pre Hrs/Day 8 open extras at those hours", () => {
    const phases = defaultPhases().map((row) => (row.id === "pre" ? { ...row, hoursPerDay: 8 } : row));
    const mech = phases.find((row) => row.id === "mech");
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(mech);
    assert.ok(pre);
    assert.equal(mech.hoursPerDay, 10);
    assert.equal(pre.hoursPerDay, 8);
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    const firstMech = row.ranges.find((range) => range.phaseId === "mech");
    const firstPre = row.ranges.find((range) => range.phaseId === "pre");
    assert.ok(firstMech);
    assert.ok(firstPre);
    firstMech.hoursPerShift = 13;
    firstPre.hoursPerShift = 12;
    const extraMech = extraRangeFromPhase(mech, firstMech);
    const extraPre = extraRangeFromPhase(pre, firstPre);
    assert.equal(extraHoursFromJobSetup(mech, firstMech), 10);
    assert.equal(extraHoursFromJobSetup(pre, firstPre), 8);
    assert.equal(extraMech.hoursPerShift, 10);
    assert.equal(extraPre.hoursPerShift, 8);
    assert.equal(extraMech.start, "");
    assert.equal(extraMech.end, "");
    assert.equal(extraPre.start, "");
    assert.equal(extraPre.end, "");
    assert.equal(extraMech.headcount, 1);
    assert.equal(extraMech.description, "");
    assert.deepEqual(extraMech.days, maskForPhaseDays(mech.daysPerWeek));
    assert.deepEqual(extraPre.days, maskForPhaseDays(pre.daysPerWeek));
    assert.deepEqual(extraDaysFromJobSetup(mech, { ...firstMech, days: [false, false, false, false, false, false, false] }), maskForPhaseDays(mech.daysPerWeek));
    assert.equal(extraMech.shift, firstMech.shift);
    assert.equal(extraPre.shift, firstPre.shift);
  });

  it("empty Job setup Hrs/Day falls back to the first range, then 0", () => {
    const phases = defaultPhases();
    const mech = phases.find((row) => row.id === "mech");
    assert.ok(mech);
    const row = assignCraftPosition(blankCraftRow(), "Pipefitter Journeyman", phases);
    const first = row.ranges.find((range) => range.phaseId === "mech");
    assert.ok(first);
    first.hoursPerShift = 12;
    const emptyJob = { ...mech, hoursPerDay: 0 };
    assert.equal(extraRangeFromPhase(emptyJob, first).hoursPerShift, 12);
    assert.equal(extraHoursFromJobSetup(emptyJob, first), 12);
    assert.equal(extraRangeFromPhase({ ...mech, hoursPerDay: 0 }).hoursPerShift, 0);
    const noDays = { ...mech, daysPerWeek: 0 };
    assert.deepEqual(extraDaysFromJobSetup(noDays, first), [...first.days]);
    assert.deepEqual(extraDaysFromJobSetup({ ...mech, daysPerWeek: 0 }), maskForPhaseDays(0));
  });

  it("changing Job setup Hrs/Day does not rewrite an extra he already saved", () => {
    const phases = defaultPhases();
    const mech = phases.find((row) => row.id === "mech");
    assert.ok(mech);
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    const first = row.ranges.find((range) => range.phaseId === "mech");
    assert.ok(first);
    const typedZero = extraRangeFromPhase(mech, first);
    typedZero.hoursPerShift = 0;
    typedZero.start = "2026-09-13";
    typedZero.end = mech.stop;
    const typedTen = extraRangeFromPhase(mech, first);
    typedTen.hoursPerShift = 10;
    typedTen.start = "2026-09-13";
    typedTen.end = mech.stop;
    const raised = phases.map((row) => (row.id === "mech" ? { ...row, hoursPerDay: 12 } : row));
    const keptZero = syncCraftRows([{ ...row, ranges: [...row.ranges, typedZero] }], raised)[0];
    const keptTen = syncCraftRows([{ ...row, ranges: [...row.ranges, typedTen] }], raised)[0];
    assert.equal(keptZero.ranges.filter((range) => range.phaseId === "mech")[1]?.hoursPerShift, 0);
    assert.equal(keptTen.ranges.filter((range) => range.phaseId === "mech")[1]?.hoursPerShift, 10);
    assert.equal(keptZero.ranges.filter((range) => range.phaseId === "mech")[0]?.hoursPerShift, first.hoursPerShift);
  });

  it("description still does not change math; extra can sit past the first range inside the phase", () => {
    const phases = defaultPhases();
    const mech = phases.find((row) => row.id === "mech");
    assert.ok(mech);
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const first = row.ranges.find((range) => range.phaseId === "mech");
    assert.ok(first);
    first.end = "2026-09-12";
    first.headcount = 8;
    first.perDiemPeople = 8;
    const extra = extraRangeFromPhase(mech, first);
    assert.equal(extra.hoursPerShift, 10);
    extra.start = "2026-09-13";
    extra.end = mech.stop;
    extra.headcount = 7;
    extra.perDiemPeople = 7;
    extra.nightHeadcount = 7;
    extra.nightPerDiemPeople = 0;
    extra.shift = "Days";
    extra.description = "Ramp-down";
    assert.ok(extra.start > first.end);
    assert.equal(extra.end, mech.stop);
    assert.equal(extraRangeIsValid(extra, first, mech), true);
    assert.equal(phaseRangesOverlap([first, extra], "mech"), false);
    const unlabeled = { ...row, ranges: [first, { ...extra, description: "" }] };
    const labeled = { ...row, ranges: [first, extra] };
    assert.equal(splitKey(crewHours(labeled)), splitKey(crewHours(unlabeled)));
    const combined = crewHours(labeled);
    const eight = computeRowHours({ ...row, ranges: [first] }, WOOD.site, WOOD.client);
    const seven = computeRowHours({ ...row, ranges: [extra] }, WOOD.site, WOOD.client);
    assert.ok(seven.hours > 0);
    assert.equal(combined.hours, eight.hours + seven.hours);
  });
});

describe("per-position phase off preserves hours", () => {
  it("killing an empty Post leaves Mechanical hours; Post bills 0", () => {
    const phases = defaultPhases();
    assert.equal(phases.find((row) => row.id === "post")?.on, true);
    const clerk = daysOnly(assignCraftPosition(blankCraftRow(), "Project Controls", phases));
    const other = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    clerk.ranges = clerk.ranges.map((range) =>
      range.phaseId === "post" ? { ...range, start: "", end: "", hoursPerShift: 0 } : range,
    );
    const before = crewHours(clerk);
    const mech = computeRowHours(
      { ...clerk, ranges: clerk.ranges.filter((range) => range.phaseId === "mech") },
      WOOD.site,
      WOOD.client,
    );
    assert.ok(mech.hours > 0);
    const postBefore = computeRowHours(
      { ...clerk, ranges: clerk.ranges.filter((range) => range.phaseId === "post") },
      WOOD.site,
      WOOD.client,
    );
    assert.equal(postBefore.hours, 0);

    clerk.ranges = setPhaseOff(clerk.ranges, "post", true);
    assert.equal(phaseIsOff(clerk.ranges, "post"), true);
    assert.equal(phaseIsOff(clerk.ranges, "mech"), false);
    const after = crewHours(clerk);
    assert.equal(splitKey(after), splitKey(before));
    assert.equal(
      splitKey(computeRowHours({ ...clerk, ranges: clerk.ranges.filter((range) => range.phaseId === "mech") }, WOOD.site, WOOD.client)),
      splitKey(mech),
    );
    assert.equal(
      computeRowHours({ ...clerk, ranges: clerk.ranges.filter((range) => range.phaseId === "post" && !range.off) }, WOOD.site, WOOD.client)
        .hours,
      0,
    );

    const otherAfter = crewHours(other);
    assert.ok(otherAfter.hours > 0);
    assert.equal(phaseIsOff(other.ranges, "post"), false);
    const otherPost = computeRowHours(
      { ...other, ranges: other.ranges.filter((range) => range.phaseId === "post") },
      WOOD.site,
      WOOD.client,
    );
    assert.equal(otherPost.hours, 48);
    assert.equal(phases.find((row) => row.id === "post")?.on, true);
  });

  it("killing Mechanical drops those hours; Restore brings the same ST/OT/DT/PD back", () => {
    const phases = defaultPhases();
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const full = crewHours(row);
    const mech = computeRowHours(
      { ...row, ranges: row.ranges.filter((range) => range.phaseId === "mech") },
      WOOD.site,
      WOOD.client,
    );
    assert.equal(splitKey(mech), "80/40/0/12/120");
    assert.equal(splitKey(full), "268/76/24/36/368");

    const killed = { ...row, ranges: setPhaseOff(row.ranges, "mech", true) };
    const dropped = crewHours(killed);
    assert.equal(dropped.st, full.st - 80);
    assert.equal(dropped.ot, full.ot - 40);
    assert.equal(dropped.dt, full.dt);
    assert.equal(dropped.pd, full.pd - 12);
    assert.equal(dropped.hours, full.hours - 120);
    assert.equal(killed.ranges.filter((range) => range.phaseId === "mech").every((range) => range.off), true);
    assert.equal(killed.ranges.filter((range) => range.phaseId === "mech")[0]?.hoursPerShift, 10);

    const restored = { ...killed, ranges: setPhaseOff(killed.ranges, "mech", false) };
    assert.equal(splitKey(crewHours(restored)), splitKey(full));
    assert.equal(phaseIsOff(restored.ranges, "mech"), false);

    const synced = syncCraftRows([killed], phases)[0];
    assert.equal(phaseIsOff(synced.ranges, "mech"), true);
    assert.equal(splitKey(crewHours(synced)), splitKey(dropped));
    assert.equal(splitKey(crewHours({ ...synced, ranges: setPhaseOff(synced.ranges, "mech", false) })), splitKey(full));
  });

  it("extras on a killed phase go with it and do not orphan hours", () => {
    const phases = defaultPhases();
    const pre = phases.find((row) => row.id === "pre");
    assert.ok(pre);
    const row = daysOnly(assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases));
    const first = row.ranges.find((range) => range.phaseId === "pre");
    const extra = insidePreComeback(extraRangeFromPhase(pre, first));
    extra.description = "Onboarding/Learning";
    row.ranges.push(extra);
    const withExtra = crewHours(row);
    assert.equal(splitKey(withExtra), "308/78.5/24/41/410.5");
    const withoutPre = computeRowHours(
      { ...row, ranges: row.ranges.filter((range) => range.phaseId !== "pre") },
      WOOD.site,
      WOOD.client,
    );
    row.ranges = setPhaseOff(row.ranges, "pre", true);
    assert.equal(row.ranges.filter((range) => range.phaseId === "pre").every((range) => range.off), true);
    assert.equal(row.ranges.filter((range) => range.phaseId === "pre").length, 2);
    assert.equal(splitKey(crewHours(row)), splitKey(withoutPre));
    row.ranges = setPhaseOff(row.ranges, "pre", false);
    assert.equal(splitKey(crewHours(row)), splitKey(withExtra));
    assert.equal(row.ranges.filter((range) => range.phaseId === "pre")[1]?.description, "Onboarding/Learning");
  });

  it("Off this position still zeros and restores a Days & nights Mechanical range", () => {
    const phases = defaultPhases();
    const row = assignCraftPosition(blankCraftRow(), "Boilermaker Journeyman", phases);
    assert.equal(row.ranges.find((range) => range.phaseId === "mech")?.shift, "Days & nights");
    const full = crewHours(row);
    const mech = computeRowHours(
      { ...row, ranges: row.ranges.filter((range) => range.phaseId === "mech") },
      WOOD.site,
      WOOD.client,
    );
    assert.ok(mech.hours > 0);
    const killed = { ...row, ranges: setPhaseOff(row.ranges, "mech", true) };
    const dropped = crewHours(killed);
    assert.equal(dropped.st, full.st - mech.st);
    assert.equal(dropped.ot, full.ot - mech.ot);
    assert.equal(dropped.dt, full.dt - mech.dt);
    assert.equal(dropped.pd, full.pd - mech.pd);
    assert.equal(dropped.hours, full.hours - mech.hours);
    const restored = { ...killed, ranges: setPhaseOff(killed.ranges, "mech", false) };
    assert.equal(splitKey(crewHours(restored)), splitKey(full));
    assert.equal(phaseIsOff(syncCraftRows([killed], phases)[0].ranges, "mech"), true);
  });
});
