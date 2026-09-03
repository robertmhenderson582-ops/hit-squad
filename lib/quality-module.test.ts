import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUALITY_MODULE_PREFIX,
  addQualityRow,
  emptyQualityModule,
  gaugeOverdue,
  hydrateQualityModule,
  patchQualityRow,
  qualityBoardCounts,
  qualityModuleKey,
  readQualityModule,
  welderExpired,
  writeQualityModule,
} from "./quality-module.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("Quality module store", () => {
  it("persists per client folder and does not invent expired or overdue rows", () => {
    assert.equal(qualityModuleKey("Ironwood Refining"), `${QUALITY_MODULE_PREFIX}phillips-66`);
    assert.equal(qualityModuleKey("Phillips 66"), qualityModuleKey("Ironwood"));
    const store = memoryStorage();
    let state = emptyQualityModule();
    state = addQualityRow(state, "ncrs");
    const ncrId = state.sections.ncrs[0].id;
    state = patchQualityRow(state, "ncrs", ncrId, "ncr", "NCR-1");
    state = patchQualityRow(state, "ncrs", ncrId, "status", "Open");
    state = {
      ...state,
      day1: { ...state.day1, inspectionPlan: true, travelerCount: "3" },
    };
    writeQualityModule("phillips-66", state, store);
    const read = readQualityModule("Ironwood Refining", store);
    assert.equal(read.day1.inspectionPlan, true);
    assert.equal(read.day1.travelerCount, "3");
    assert.equal(read.sections.ncrs[0]?.cells.ncr, "NCR-1");
    const now = new Date(2026, 8, 3);
    assert.equal(welderExpired("", now), false);
    assert.equal(welderExpired("2026-08-01", now), false);
    assert.equal(welderExpired("2026-02-01", now), true);
    assert.equal(gaugeOverdue("", now), false);
    assert.equal(gaugeOverdue("2026-09-04", now), false);
    assert.equal(gaugeOverdue("2026-09-02", now), true);
    const counted = hydrateQualityModule({
      sections: {
        ncrs: [{ id: "a", cells: { status: "Open" } }, { id: "b", cells: { status: "Closed" } }],
        welders: [{ id: "w", cells: { lastUsed: "2026-02-01" } }],
        calibration: [{ id: "g", cells: { due: "2026-09-02" } }],
        travelers: [{ id: "t", cells: { traveler: "T-1" } }],
      },
    });
    const board = qualityBoardCounts(counted, now);
    assert.equal(board.ncrs, 1);
    assert.equal(board.travelers, 1);
    assert.equal(board.welders, 1);
    assert.equal(board.calibration, 1);
  });
});
