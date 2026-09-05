import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUALITY_DESK_TABS,
  QUALITY_MODULE_PREFIX,
  QUALITY_SECTIONS,
  addQualityRow,
  emptyQualityModule,
  gaugeOverdue,
  hydrateQualityModule,
  isQualityDeskTab,
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
    state = patchQualityRow(state, "ncrs", ncrId, "client", "phillips-66");
    state = patchQualityRow(state, "ncrs", ncrId, "job", "new-awarded");
    state = patchQualityRow(state, "ncrs", ncrId, "unit", "B-12");
    state = patchQualityRow(state, "ncrs", ncrId, "description", "leak");
    state = patchQualityRow(state, "ncrs", ncrId, "disposition", "repair");
    state = patchQualityRow(state, "ncrs", ncrId, "status", "Open");
    state = addQualityRow(state, "travelers");
    state = {
      ...state,
      day1: {
        ...state.day1,
        inspectionPlan: true,
        forms: {
          "2.7.1": { fields: { job: "WR-1", testPressure: "150" }, rows: [{ id: "g1", cells: { gaugeId: "G-4" } }] },
        },
      },
    };
    writeQualityModule("phillips-66", state, store);
    const read = readQualityModule("Ironwood Refining", store);
    assert.equal(read.day1.inspectionPlan, true);
    assert.equal(read.day1.travelerCount, "1");
    assert.equal(read.sections.travelers.length, 1);
    assert.equal(read.day1.forms["2.7.1"]?.fields.testPressure, "150");
    assert.equal(read.day1.forms["2.7.1"]?.rows[0]?.cells.gaugeId, "G-4");
    assert.equal(read.sections.ncrs[0]?.cells.ncr, "NCR-1");
    assert.equal(read.sections.ncrs[0]?.cells.client, "phillips-66");
    assert.equal(read.sections.ncrs[0]?.cells.job, "new-awarded");
    assert.equal(read.sections.ncrs[0]?.cells.unit, "B-12");
    assert.equal(read.sections.ncrs[0]?.cells.disposition, "repair");
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

  it("migrates old NCR rows and keeps Client / Job / Unit on the log", () => {
    const ncrFields = QUALITY_SECTIONS.find((section) => section.id === "ncrs")?.fields.map((field) => field.id);
    assert.deepEqual(ncrFields, [
      "ncr",
      "client",
      "job",
      "unit",
      "area",
      "description",
      "disposition",
      "status",
      "date",
    ]);
    assert.deepEqual(
      QUALITY_DESK_TABS.map((tab) => tab.label),
      ["Board", "NCRs", "Welds/NDE", "Connections", "Travelers", "Welders", "Gauges", "Day-1 package", "Rolling chart"],
    );
    assert.equal(isQualityDeskTab("ncrs"), true);
    assert.equal(isQualityDeskTab("board"), true);
    assert.equal(isQualityDeskTab("money"), false);
    const old = hydrateQualityModule({
      sections: {
        ncrs: [{ id: "old", cells: { ncr: "NCR-9", area: "drum", note: "old note", company: "Phillips 66" } }],
      },
    });
    assert.equal(old.sections.ncrs[0]?.cells.description, "old note");
    assert.equal(old.sections.ncrs[0]?.cells.client, "phillips-66");
    assert.equal(old.sections.ncrs[0]?.cells.job, "");
    assert.equal(old.sections.ncrs[0]?.cells.unit, "");
    assert.equal(old.sections.ncrs[0]?.cells.area, "drum");
  });
});
