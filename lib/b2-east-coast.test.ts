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

test("sourced East Coast B-2 catalog is locked", () => {
  const rows = B2_EAST_COAST.map((row) => [
    row.description,
    row.hourly,
    row.daily,
    row.weekly,
    row.monthly,
    row.requiresOperator,
    row.billing,
  ]);
  assert.deepEqual(rows, [
    ["AIR MOVER", 4, 32, 96, 288, false, "dry"],
    ["EXTRACTOR BUNDLE AERIAL <21FT", 189, 1512, 4536, 13608, true, "dry"],
    ["EXTRACTOR BUNDLE AERIAL <26FT", 189, 1512, 4536, 13608, true, "dry"],
    ["EXTRACTOR BUNDLE AERIAL <33FT", 189, 1512, 4536, 13608, true, "dry"],
    ["EXTRACTOR BUNDLE AERIAL 45 TON", 315, 2520, 7560, 22680, true, "dry"],
    ["EXTRACTOR SELF PROPELLED", 370, 2960, 8880, 26640, true, "dry"],
    ["EXTRACTOR TRUCK MOUNT", 270, 2160, 6480, 19440, true, "dry"],
    ['MACHINE FLANGE FACING <24"', 120, 960, 2880, 8640, true, "dry"],
    ['MACHINE FLANGE FACING 14"-36"', 140, 1120, 3360, 10080, true, "dry"],
    ['MACHINE FLANGE FACING 2"-12"', 120, 960, 2880, 8640, true, "dry"],
    ['MACHINE FLANGE FACING 24"-60"', 120, 960, 2880, 8640, true, "dry"],
    ['MACHINE FLANGE FACING 38"-60"', 120, 960, 2880, 8640, true, "dry"],
    ['MACHINE FLANGE FACING 60"-80"', 120, 960, 2880, 8640, true, "dry"],
    ['PIPE CUT BEVEL 14"-24"', 114, 912, 2736, 8208, true, "dry"],
    ['PIPE CUT BEVEL 26"-36"', 128, 1024, 3072, 9216, true, "dry"],
    ['PIPE CUT BEVEL OVER 36"', 140, 1120, 3360, 10080, true, "dry"],
    ['PIPE CUT BEVEL TO 12"', 114, 912, 2736, 8208, true, "dry"],
    ["PUMP HYDROSTATIC TEST", 26, 208, 624, 1872, false, "dry"],
    ["PUMP TORQUE CONSOLE 10K PSI thru 60k ft lb", 165, 1320, 3960, 11880, false, "dry"],
    ["TRAILER FLATBED", 6, 48, 144, 432, false, "dry"],
    ["TRAILER GOOSENECK", 18, 144, 432, 1296, false, "dry"],
    ["TRAILER TOOL <40FT", 26, 208, 624, 1872, false, "dry"],
    ["TRAILER TOOL >40FT", 25, 200, 600, 1800, false, "dry"],
    ["TRAILER TOWER TRAY HARDWARE CONSIGNMENT", 50, 400, 1200, 3600, false, "cost-plus"],
    ["TRAILER TUBE BUNDLE", 29, 232, 696, 2088, false, "dry"],
    ["TRUCK CREW", 13, 104, 312, 936, false, "dry"],
    ["VAN 15 PASSENGER", 22, 176, 528, 1584, false, "dry"],
    ["WELDER ARC 100-300 AMP Electric", 8.5, 68, 204, 612, false, "dry"],
    ["WELDER ARC 301-499 AMP Electric", 11, 88, 264, 792, false, "dry"],
    ["WELDER EIGHT BANK", 15, 120, 360, 1080, false, "dry"],
    ["Bundle Dolly", 29, 232, 696, 2088, false, "dry"],
    ["RAD Gun Torque", 62, 496, 1488, 4464, false, "dry"],
    ["Pipe Threaders (535+)", null, null, null, null, false, "cost-plus"],
    ["Spreader Bars", null, null, null, null, false, "cost-plus"],
    ["Porta-Power >25T", null, null, null, null, false, "cost-plus"],
    ["Beam Trolleys >5T", null, null, null, null, false, "cost-plus"],
    ["TRAILER ALKY DECON", null, null, null, null, false, "no-cost"],
    ["TRAILER WELDING", null, null, null, null, false, "skip"],
    ["PUMP TORQUE CONSOLE 10K (wrenches)", null, null, null, null, false, "skip"],
    ["TRUCK RIG WELDER", null, null, null, null, false, "skip"],
  ]);
  const billed = billableB2Items();
  assert.equal(billed.some((row) => row.billing === "skip" || row.billing === "no-cost"), false);
  assert.equal(
    billed.every((row) => row.mob == null && row.replacement == null),
    true,
  );
});
