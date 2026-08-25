import assert from "node:assert/strict";
import { test } from "node:test";
import {
  B2_EAST_COAST,
  B2_PLANT,
  B2_WEST_PLANT,
  b2LineTotal,
  billableB2Items,
  clockPeriods,
  isWestCoastPlant,
  markup6,
} from "./b2-east-coast.ts";

test("East Coast B-2 is PCA0001103 and never West Coast", () => {
  assert.equal(B2_PLANT, "PCA0001103");
  assert.equal(isWestCoastPlant(B2_WEST_PLANT), true);
  assert.equal(isWestCoastPlant(B2_PLANT), false);
  assert.equal(
    B2_EAST_COAST.some((row) => /PCA0001100|West Coast/i.test(row.description)),
    false,
  );
});

test("only listed dry or cost-plus items are billable", () => {
  const billed = billableB2Items();
  assert.equal(billed.some((row) => row.description === "TRUCK RIG WELDER"), false);
  assert.equal(billed.some((row) => row.description === "TRAILER ALKY DECON"), false);
  assert.equal(billed.some((row) => row.description === "TRAILER WELDING"), false);
  assert.equal(billed.some((row) => row.description === "AIR MOVER"), true);
  assert.equal(billed.find((row) => row.description === "Pipe Threaders (535+)")?.billing, "cost-plus");
});

test("clock is 8 hr = day, 3 days = week, 3 weeks = month", () => {
  assert.deepEqual(clockPeriods(8), { hours: 8, days: 1, weeks: 1 / 3, months: 1 / 9 });
  assert.equal(clockPeriods(24).weeks, 1);
  assert.equal(clockPeriods(72).months, 1);
});

test("dry line uses catalog rate; cost-plus is entered cost + 6%", () => {
  const mover = B2_EAST_COAST.find((row) => row.description === "AIR MOVER");
  assert.ok(mover);
  assert.equal(b2LineTotal(mover, "daily", 2), 64);
  const threader = B2_EAST_COAST.find((row) => row.description === "Pipe Threaders (535+)");
  assert.ok(threader);
  assert.equal(b2LineTotal(threader, "daily", 1, 1000), 1060);
  assert.equal(markup6(250), 265);
});

test("operator-required extractors do not invent a rental operator rate", () => {
  const aerial = B2_EAST_COAST.find((row) => row.description === "EXTRACTOR TRUCK MOUNT");
  assert.ok(aerial);
  assert.equal(aerial.requiresOperator, true);
  assert.equal(aerial.mob, null);
  assert.equal(aerial.replacement, null);
});
