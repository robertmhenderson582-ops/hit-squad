import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ESTIMATE_TOTAL_RAIL_PHONE_KEY,
  ESTIMATE_TOTAL_RAIL_PHONE_QUERY,
  ESTIMATE_TOTAL_RAIL_POS_KEY,
  ESTIMATE_TOTAL_RAIL_POS_MARGIN,
  clampEstimateTotalRailPosition,
  clearEstimateTotalRailPosition,
  estimateTotalRailPositionKey,
  readEstimateTotalRailPhoneHidden,
  readEstimateTotalRailPosition,
  writeEstimateTotalRailPhoneHidden,
  writeEstimateTotalRailPosition,
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
    removeItem(key: string) {
      delete data[key];
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
  assert.match(railUi, /readEstimateTotalRailPosition/);
  assert.match(railUi, /writeEstimateTotalRailPosition/);
  assert.match(railUi, /clampEstimateTotalRailPosition/);
  assert.match(railUi, /onPointerDown/);
  assert.match(railUi, /Reset/);
  assert.match(railUi, /Hide/);
  assert.match(railUi, /Show estimate total/);
  assert.match(railUi, /ESTIMATE_TOTAL_RAIL_PHONE_QUERY/);
  assert.doesNotMatch(desk, /ESTIMATE_TOTAL_RAIL_PHONE|ESTIMATE_TOTAL_RAIL_POS|phone hidden|railPhone/);
  assert.doesNotMatch(total, /ESTIMATE_TOTAL_RAIL_PHONE|ESTIMATE_TOTAL_RAIL_POS/);
  assert.doesNotMatch(railUi, /purchasing/i);
});

test("rail position persists on this device and can key by seat", () => {
  const store = memoryStore();
  const seat = "robert@example.com";
  assert.equal(ESTIMATE_TOTAL_RAIL_POS_KEY, "hs_est_total_rail_pos_v1");
  assert.equal(estimateTotalRailPositionKey(seat), "hs_est_total_rail_pos_v1:robert@example.com");
  assert.equal(readEstimateTotalRailPosition(store), null);
  writeEstimateTotalRailPosition({ left: 48, top: 120 }, store, seat);
  assert.deepEqual(readEstimateTotalRailPosition(store, seat), { left: 48, top: 120 });
  assert.equal(readEstimateTotalRailPosition(store), null);
  writeEstimateTotalRailPosition({ left: 12, top: 20 }, store);
  assert.deepEqual(readEstimateTotalRailPosition(store, "other@example.com"), { left: 12, top: 20 });
  clearEstimateTotalRailPosition(store, seat);
  assert.equal(readEstimateTotalRailPosition(store, seat), null);
  assert.equal(readEstimateTotalRailPosition(store), null);
});

test("rail position ignores junk and non-finite values", () => {
  const store = memoryStore({
    [ESTIMATE_TOTAL_RAIL_POS_KEY]: "{not-json",
  });
  assert.equal(readEstimateTotalRailPosition(store), null);
  store.setItem(ESTIMATE_TOTAL_RAIL_POS_KEY, JSON.stringify({ left: Number.NaN, top: 10 }));
  assert.equal(readEstimateTotalRailPosition(store), null);
  store.setItem(ESTIMATE_TOTAL_RAIL_POS_KEY, JSON.stringify({ left: "40", top: 10 }));
  assert.equal(readEstimateTotalRailPosition(store), null);
});

test("rail position clamp keeps the bar inside the viewport", () => {
  const viewport = { width: 1280, height: 720 };
  const size = { width: 268, height: 220 };
  assert.deepEqual(
    clampEstimateTotalRailPosition({ left: -40, top: -10 }, viewport, size),
    { left: ESTIMATE_TOTAL_RAIL_POS_MARGIN, top: ESTIMATE_TOTAL_RAIL_POS_MARGIN },
  );
  assert.deepEqual(
    clampEstimateTotalRailPosition({ left: 2000, top: 2000 }, viewport, size),
    {
      left: 1280 - 268 - ESTIMATE_TOTAL_RAIL_POS_MARGIN,
      top: 720 - 220 - ESTIMATE_TOTAL_RAIL_POS_MARGIN,
    },
  );
  assert.deepEqual(
    clampEstimateTotalRailPosition({ left: 100, top: 80 }, viewport, size),
    { left: 100, top: 80 },
  );
});
