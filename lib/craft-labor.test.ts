import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cloneCraftRow,
  craftRowFromPhases,
  rangesFromPhases,
  syncCraftRows,
} from "./craft-labor.ts";
import { defaultPhases } from "./phase-schedule.ts";

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

  it("does not invent ranges for OFF phases so hours stay on worked windows", () => {
    const phases = defaultPhases().map((row) => (row.id === "oil-out" ? { ...row, on: false } : row));
    const ranges = rangesFromPhases(phases);
    assert.equal(ranges.some((range) => range.phaseId === "oil-out"), false);
    assert.equal(ranges.length, 4);
  });
});
