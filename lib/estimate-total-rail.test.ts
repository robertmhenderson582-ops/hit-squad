import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ESTIMATE_TOTAL_RAIL_PHONE_KEY,
  ESTIMATE_TOTAL_RAIL_PHONE_QUERY,
  readEstimateTotalRailPhoneHidden,
  writeEstimateTotalRailPhoneHidden,
} from "./estimate-total-rail.ts";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

test("phone hide persist is off by default and stays until shown again", () => {
  const store = memoryStore();
  assert.equal(ESTIMATE_TOTAL_RAIL_PHONE_KEY, "hs_est_total_rail_phone_v1");
  assert.equal(ESTIMATE_TOTAL_RAIL_PHONE_QUERY, "(max-width: 899px)");
  assert.equal(readEstimateTotalRailPhoneHidden(store), false);
  writeEstimateTotalRailPhoneHidden(true, store);
  assert.equal(readEstimateTotalRailPhoneHidden(store), true);
  assert.equal(readEstimateTotalRailPhoneHidden(store), true);
  writeEstimateTotalRailPhoneHidden(false, store);
  assert.equal(readEstimateTotalRailPhoneHidden(store), false);
  assert.equal(JSON.parse(store.getItem(ESTIMATE_TOTAL_RAIL_PHONE_KEY) || "{}").hidden, false);
});

test("phone hide is UI only — Estimate Total math files stay off the hide path", () => {
  const railPref = read("./estimate-total-rail.ts");
  const railUi = read("../components/EstimateTotalRail.tsx");
  const desk = read("./estimate-desk-total.ts");
  const total = read("./estimate-total.ts");
  assert.doesNotMatch(railPref, /from "\.\/estimate-total|from "\.\/estimate-desk-total/);
  assert.match(railUi, /deskPackageBreakdown/);
  assert.match(railUi, /readEstimateTotalRailPhoneHidden/);
  assert.match(railUi, /Hide/);
  assert.match(railUi, /Show estimate total/);
  assert.match(railUi, /ESTIMATE_TOTAL_RAIL_PHONE_QUERY/);
  assert.doesNotMatch(desk, /ESTIMATE_TOTAL_RAIL_PHONE|phone hidden|railPhone/);
  assert.doesNotMatch(total, /ESTIMATE_TOTAL_RAIL_PHONE/);
  assert.doesNotMatch(railUi, /purchasing/i);
});
