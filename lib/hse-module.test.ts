import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HSE_PACKAGE_SLOTS } from "./hse-day1.ts";
import {
  HSE_EXECUTE_LANES,
  HSE_MODULE_PREFIX,
  addHseLaneRow,
  emptyHseModule,
  hseModuleKey,
  patchHseLaneRow,
  readHseModule,
  writeHseModule,
} from "./hse-module.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("HSE module store", () => {
  it("persists typed slots and execute lanes per client folder", () => {
    assert.equal(hseModuleKey("Phillips 66"), `${HSE_MODULE_PREFIX}phillips-66`);
    assert.equal(HSE_PACKAGE_SLOTS.some((slot) => /29\.1|sling/i.test(slot.label)), false);
    assert.equal(HSE_EXECUTE_LANES.length, 8);
    const store = memoryStorage();
    let state = emptyHseModule();
    state = {
      ...state,
      plant: "Wood River",
      day1: { slots: { orientation: "done" } },
    };
    state = addHseLaneRow(state, "incidents");
    const id = state.lanes.incidents[0].id;
    state = patchHseLaneRow(state, "incidents", id, "note", "near miss");
    writeHseModule("Ironwood", state, store);
    const read = readHseModule("phillips-66", store);
    assert.equal(read.plant, "Wood River");
    assert.equal(read.day1.slots.orientation, "done");
    assert.equal(read.lanes.incidents[0]?.cells.note, "near miss");
  });
});
