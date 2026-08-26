import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MISC_CATALOG,
  blankTravel,
  miscAmount,
  otherCostTotals,
  perDiemAmount,
  seedMiscCatalog,
  showCraftTravelRow,
  travelAmount,
} from "./other-cost.ts";

test("per diem uses the job rate times Crew PD days", () => {
  assert.equal(perDiemAmount(185, 4), 740);
  assert.equal(perDiemAmount(0, 10), 0);
});

test("travel is Yes/No plus Mileage Rate and travel $, not a second Miles column", () => {
  const no = blankTravel("staff", 0.67);
  assert.equal(no.traveler, false);
  assert.equal(no.mileageRate, 0.67);
  assert.equal(travelAmount({ ...no, travelDollars: 400 }), 0);
  assert.equal(travelAmount({ ...no, traveler: true, travelDollars: 400 }), 400);
  assert.equal("miles" in no, false);
});

test("empty Craft travel / Mileage Rate stays hidden until a mileage rate exists", () => {
  assert.equal(showCraftTravelRow(0), false);
  assert.equal(showCraftTravelRow(0.67), true);
});

test("misc reimbursables are the CAT 2 list, not B-3 small tools", () => {
  assert.deepEqual([...MISC_CATALOG], [
    "Alloy rod",
    "Steel",
    "Grinding wheels",
    "Weld / cut gas",
    "Fire blanket",
    "Anti-seize",
  ]);
  const seeded = seedMiscCatalog();
  assert.equal(seeded.some((row) => /PPE|small tool|consumable/i.test(row.item)), false);
  assert.equal(miscAmount({ id: "1", item: "Alloy rod", qty: 2, each: 40 }), 80);
});

test("other cost totals PD + travel + misc", () => {
  const totals = otherCostTotals(
    {
      perDiemRate: 100,
      travel: [{ id: "t", kind: "staff", name: "Pat", traveler: true, mileageRate: 0.67, travelDollars: 250 }],
      misc: [{ id: "m", item: "Steel", qty: 1, each: 50 }],
    },
    3,
  );
  assert.equal(totals.perDiem, 300);
  assert.equal(totals.travel, 250);
  assert.equal(totals.misc, 50);
  assert.equal(totals.total, 600);
});
