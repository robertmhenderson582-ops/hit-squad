import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyJobMeta, hydrateJobMeta } from "./staffing-plan.ts";
import {
  CIRCUIT_COUNT,
  DRUM_TUBE_COUNT,
  ROLL_STEPS,
  ROLLING_SHEETS,
  SIDE_WALL_TUBE_COUNT,
  SIDE_WALLS,
  drumTubeKey,
  emptyRollingChart,
  formatWallReduction,
  hydrateRollingChart,
  rollingHasElevationField,
  rollingProgression,
  sideWallTubeKey,
  wallReductionPct,
} from "./rolling-chart.ts";

describe("rolling chart shape", () => {
  it("locks circuits, tubes, side walls, and the six steps", () => {
    assert.equal(CIRCUIT_COUNT, 24);
    assert.equal(DRUM_TUBE_COUNT, 76);
    assert.equal(SIDE_WALL_TUBE_COUNT, 22);
    assert.deepEqual([...SIDE_WALLS], ["LEFT", "RIGHT"]);
    assert.equal(rollingHasElevationField(), false);
    assert.deepEqual(
      ROLL_STEPS.map((step) => step.label),
      [
        "Tube Stub Removed",
        "Drum Hole Cleaned",
        "Drum Hole Marked For Repair",
        "Drum Hole Repaired",
        "Tube Installed",
        "Tube Final Roll",
      ],
    );
    assert.deepEqual(
      ROLLING_SHEETS.map((sheet) => sheet.label),
      ["Steam Drum", "Mud Drum", "Side Walls", "Productivity Chart"],
    );
    assert.equal(ROLLING_SHEETS[0].title, "Steam Drum Rolling Chart");
    assert.equal(ROLLING_SHEETS[0].tracking, "Steam Drum Rolling Tracking Chart");
    assert.equal(ROLLING_SHEETS[1].title, "Mud Drum Rolling Tracking Chart");
    assert.equal(ROLLING_SHEETS[3].title, "Generating Bank Retube Progression Chart");
    assert.equal(drumTubeKey("steam", 1, 1), "steam:1:1");
    assert.equal(sideWallTubeKey("LEFT", 22), "sidewalls:LEFT:22");
  });
});

describe("rolling QA", () => {
  it("does not seed measurements and hides wall reduction when Actual Tube ID is empty", () => {
    const empty = emptyRollingChart();
    assert.equal(empty.idealPercentageRoll, "");
    assert.equal(empty.averageTubeId, "");
    assert.equal(empty.averageTubeOd, "");
    assert.deepEqual(empty.tubes, {});
    assert.equal(emptyJobMeta().rollingChart.averageTubeId, "");
    assert.notEqual(empty.idealPercentageRoll, "Yates");
    assert.equal(wallReductionPct("", "1.500", "2.000"), null);
    assert.equal(formatWallReduction("", "1.500", "2.000"), "");
    assert.equal(wallReductionPct("1.650", "1.500", "2.000"), 30);
    const saved = hydrateRollingChart({
      averageTubeId: "1.5",
      tubes: { "steam:1:1": { steps: { "final-roll": true }, actualTubeId: "1.62" } },
    });
    assert.equal(saved.tubes["steam:1:1"]?.actualTubeId, "1.62");
    const roundTrip = hydrateJobMeta({
      qualityDay1: { inspectionPlan: true, weldMap: false, travelerCount: "3" },
      rollingChart: saved,
    });
    assert.equal(roundTrip.qualityDay1.inspectionPlan, true);
    assert.equal(roundTrip.qualityDay1.travelerCount, "3");
    assert.equal(roundTrip.rollingChart.tubes["steam:1:1"]?.actualTubeId, "1.62");
    const progress = rollingProgression(saved);
    assert.equal(progress[0]?.total, CIRCUIT_COUNT * DRUM_TUBE_COUNT);
    assert.equal(progress[0]?.steps["final-roll"], 1);
    assert.equal(progress[2]?.total, SIDE_WALLS.length * SIDE_WALL_TUBE_COUNT);
  });
});
