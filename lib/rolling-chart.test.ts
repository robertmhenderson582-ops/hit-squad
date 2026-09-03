import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CIRCUIT_HINT,
  CIRCUIT_COUNT,
  CIRCUIT_MAX,
  DRUM_TUBE_COUNT,
  ROLL_STEPS,
  ROLLING_SHEETS,
  SIDE_WALL_HINT,
  SIDE_WALL_MAX,
  SIDE_WALL_TUBE_COUNT,
  SIDE_WALLS,
  TUBE_HINT,
  TUBE_MAX,
  chartSetupReady,
  defaultHoleId,
  drumKeys,
  drumTubeKey,
  emptyRollingChart,
  emptyRollingTube,
  effectiveDrumHoleId,
  formatIdealTubeId,
  formatWallReduction,
  hydrateRollingChart,
  keyInLiveMap,
  liveCircuitCount,
  liveSideCount,
  liveTubesPerCircuit,
  rollingHasElevationField,
  rollingProgression,
  sideWallKeys,
  sideWallTubeKey,
  wallReductionBand,
  wallReductionPct,
  wallReductionVsIdeal,
} from "./rolling-chart.ts";

describe("rolling chart shape", () => {
  it("keeps typical hints and the six steps without locking geometry", () => {
    assert.equal(CIRCUIT_HINT, 24);
    assert.equal(TUBE_HINT, 76);
    assert.equal(SIDE_WALL_HINT, 22);
    assert.equal(CIRCUIT_COUNT, 24);
    assert.equal(DRUM_TUBE_COUNT, 76);
    assert.equal(SIDE_WALL_TUBE_COUNT, 22);
    assert.equal(CIRCUIT_MAX, 48);
    assert.equal(TUBE_MAX, 120);
    assert.equal(SIDE_WALL_MAX, 80);
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
    assert.equal(empty.circuits, "");
    assert.equal(empty.tubesPerCircuit, "");
    assert.deepEqual(empty.tubes, {});
    assert.notEqual(empty.idealPercentageRoll, "Yates");
    assert.equal(wallReductionPct("", "1.500", "2.000"), null);
    assert.equal(formatWallReduction("", "1.500", "2.000"), "");
    assert.equal(wallReductionBand("", "1.500", "2.000", "10", "14"), null);
    assert.equal(wallReductionVsIdeal("", "1.500", "2.000", "12"), null);
    assert.equal(wallReductionPct("1.650", "1.500", "2.000"), 30);
    assert.equal(wallReductionBand("1.650", "1.500", "2.000", "10", "14"), "over");
    assert.equal(wallReductionBand("1.545", "1.500", "2.000", "10", "14", "12"), "under");
    assert.equal(wallReductionBand("1.555", "1.500", "2.000", "10", "14", "12"), "low-ok");
    assert.equal(wallReductionBand("1.565", "1.500", "2.000", "10", "14", "12"), "target");
    assert.equal(defaultHoleId("2.5"), "2.5313");
    const noActual = emptyRollingTube();
    assert.equal(formatIdealTubeId(noActual, emptyRollingChart()), "");
    const withHole = { ...noActual, drumHoleId: "2.5313" };
    assert.equal(
      formatIdealTubeId(withHole, { ...emptyRollingChart(), averageTubeId: "1.500", averageTubeOd: "2.000", idealPercentageRoll: "12" }),
      "1.56",
    );
    assert.equal(effectiveDrumHoleId({ ...noActual, drumHoleId: "2.540" }, { ...emptyRollingChart(), tubeOd: "2.5" }), "2.540");
    assert.equal(effectiveDrumHoleId(noActual, { ...emptyRollingChart(), tubeOd: "2.5" }), "2.5313");
    const saved = hydrateRollingChart({
      circuits: "3",
      tubesPerCircuit: "4",
      leftTubeCount: "2",
      rightTubeCount: "0",
      averageTubeId: "1.5",
      tubes: { "steam:1:1": { steps: { "final-roll": true }, actualTubeId: "1.62" } },
    });
    assert.equal(saved.tubes["steam:1:1"]?.actualTubeId, "1.62");
    const progress = rollingProgression(saved);
    assert.equal(progress[0]?.total, 12);
    assert.equal(progress[0]?.steps["final-roll"], 1);
    assert.equal(progress[2]?.total, 2);
  });

  it("changes the live map when setup geometry changes and keeps out-of-range marks stored", () => {
    const empty = emptyRollingChart();
    assert.equal(liveCircuitCount(empty), 0);
    assert.equal(liveTubesPerCircuit(empty), 0);
    assert.equal(chartSetupReady(empty), false);
    assert.deepEqual(drumKeys(empty, "steam"), []);
    const set = hydrateRollingChart({
      circuits: "2",
      tubesPerCircuit: "3",
      leftTubeCount: "1",
      rightTubeCount: "1",
      tubes: {
        "steam:1:3": { steps: { "stub-removed": true }, actualTubeId: "", drumHoleId: "H-1" },
        "steam:3:1": { steps: { "tube-installed": true }, actualTubeId: "" },
      },
    });
    assert.equal(chartSetupReady(set), true);
    assert.equal(liveCircuitCount(set), 2);
    assert.equal(liveTubesPerCircuit(set), 3);
    assert.deepEqual(drumKeys(set, "steam"), ["steam:1:1", "steam:1:2", "steam:1:3", "steam:2:1", "steam:2:2", "steam:2:3"]);
    assert.equal(keyInLiveMap(set, "steam:1:3"), true);
    assert.equal(keyInLiveMap(set, "steam:3:1"), false);
    assert.equal(set.tubes["steam:3:1"]?.steps["tube-installed"], true);
    const grown = hydrateRollingChart({ ...set, circuits: "3" });
    assert.equal(keyInLiveMap(grown, "steam:3:1"), true);
    assert.equal(sideWallKeys(set).length, 2);
    const leftOnly = hydrateRollingChart({ ...set, sideWalls: "left", leftTubeCount: "3", rightTubeCount: "4" });
    assert.equal(liveSideCount(leftOnly, "LEFT"), 3);
    assert.equal(liveSideCount(leftOnly, "RIGHT"), 0);
    const migrated = hydrateRollingChart({ sideWalls: "left-right", leftTubeCount: "2", rightTubeCount: "2" });
    assert.equal(migrated.sideWalls, "both");
    const maxed = hydrateRollingChart({ circuits: "48", tubesPerCircuit: "120" });
    assert.equal(liveCircuitCount(maxed), 48);
    assert.equal(liveTubesPerCircuit(maxed), 120);
    assert.equal(liveCircuitCount(hydrateRollingChart({ circuits: "49" })), 0);
  });
});
