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
  craftRowFromPhases,
  duplicateCraftRow,
  duplicateSupportLine,
  extraRangeFromPhase,
  hydrateSupportLine,
  nextUnitId,
  phaseRangesOverlap,
  rangesFromPhases,
  syncCraftRows,
  syncSupportRows,
} from "./craft-labor.ts";
import { computeRowHours } from "./hours-clock.ts";
import { addUnit, defaultPhaseSchedule, defaultPhases, setMultiUnits } from "./phase-schedule.ts";
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
    assert.equal(extra.hoursPerShift, 0);
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
    assert.equal(extra.hoursPerShift, 0);
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
    assert.equal(pres[1].hoursPerShift, 0);
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
