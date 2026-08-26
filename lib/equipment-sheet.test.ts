import assert from "node:assert/strict";
import { test } from "node:test";
import { b2ItemById } from "./b2-east-coast.ts";
import {
  billedPeriodCount,
  blankLargeTool,
  blankThirdParty,
  emptyEquipmentSheet,
  equipmentTotals,
  jobSetupWindow,
  largeToolAmount,
  seedEmptyEquipmentWindow,
  seedLineDates,
  thirdPartyCost,
  thirdPartyMarkedUp,
  type LargeToolLine,
} from "./equipment-sheet.ts";

test("third-party rental is typed cost + 6%, not a COMP picker", () => {
  const line = { ...blankThirdParty(), item: "Crane", period: "weekly" as const, rate: 1000, freight: 200, qty: 2 };
  assert.equal(thirdPartyCost(line), 2200);
  assert.equal(thirdPartyMarkedUp(line), 2332);
  assert.equal("itemId" in line, false);
  assert.equal(b2ItemById("crane"), undefined);
});

test("large tools use the East Coast listed dry rate", () => {
  const mover = b2ItemById("air-mover");
  assert.ok(mover);
  const line: LargeToolLine = {
    id: "lt-1",
    itemId: "air-mover",
    period: "daily",
    qty: 2,
    start: "",
    end: "",
    enteredCost: 0,
    freight: 0,
  };
  assert.equal(largeToolAmount(line), 64);
  const sheet = emptyEquipmentSheet();
  sheet.largeTools = [line];
  sheet.thirdParty = [{ ...blankThirdParty(), rate: 100, freight: 0, qty: 1 }];
  const totals = equipmentTotals(sheet);
  assert.equal(totals.largeTools, 64);
  assert.equal(totals.thirdParty, 106);
  assert.equal(totals.total, 170);
});

test("unlisted large tools cannot be billed", () => {
  assert.equal(
    largeToolAmount({
      id: "x",
      itemId: "made-up-crane",
      period: "daily",
      qty: 1,
      start: "",
      end: "",
      enteredCost: 999,
      freight: 0,
    }),
    0,
  );
});

test("large-tool freight is typed dollars in the line total, never +6%", () => {
  const line: LargeToolLine = {
    id: "lt-1",
    itemId: "air-mover",
    period: "daily",
    qty: 2,
    start: "",
    end: "",
    enteredCost: 0,
    freight: 40,
  };
  assert.equal(largeToolAmount({ ...line, freight: 0 }), 64);
  assert.equal(largeToolAmount(line), 104);
  const threader: LargeToolLine = {
    ...line,
    itemId: "pipe-threaders-535",
    qty: 1,
    enteredCost: 1000,
    freight: 50,
  };
  assert.equal(largeToolAmount({ ...threader, freight: 0 }), 1060);
  assert.equal(largeToolAmount(threader), 1110);
});

test("third-party 6% covers typed cost plus freight", () => {
  const line = { ...blankThirdParty(), rate: 1000, freight: 200, qty: 2 };
  assert.equal(thirdPartyCost(line), 2200);
  assert.equal(thirdPartyMarkedUp(line), 2332);
  const sheet = emptyEquipmentSheet();
  sheet.largeTools = [
    {
      id: "lt-1",
      itemId: "air-mover",
      period: "daily",
      qty: 2,
      start: "",
      end: "",
      enteredCost: 0,
      freight: 40,
    },
  ];
  sheet.thirdParty = [line];
  const totals = equipmentTotals(sheet);
  assert.equal(totals.largeTools, 104);
  assert.equal(totals.thirdParty, 2332);
  assert.equal(totals.total, 2436);
});

test("empty equipment dates seed from PRE start and POST end; typed dates stick", () => {
  const window = jobSetupWindow([
    { id: "pre", start: "2026-08-21", stop: "2026-09-03" },
    { id: "post", start: "2026-09-28", stop: "2026-10-05" },
  ]);
  assert.deepEqual(window, { start: "2026-08-21", end: "2026-10-05" });
  const added = blankLargeTool(window);
  assert.equal(added.start, "2026-08-21");
  assert.equal(added.end, "2026-10-05");
  const typed = seedLineDates(
    { ...blankThirdParty(), start: "2026-09-21", end: "2026-09-21" },
    window,
  );
  assert.equal(typed.start, "2026-09-21");
  assert.equal(typed.end, "2026-09-21");
  const hydrated = seedEmptyEquipmentWindow(
    {
      largeTools: [{ ...blankLargeTool(), start: "", end: "" }],
      thirdParty: [{ ...blankThirdParty(), start: "2026-09-21", end: "2026-09-21" }],
    },
    window,
  );
  assert.equal(hydrated.largeTools[0].start, "2026-08-21");
  assert.equal(hydrated.largeTools[0].end, "2026-10-05");
  assert.equal(hydrated.thirdParty[0].start, "2026-09-21");
  assert.equal(hydrated.thirdParty[0].end, "2026-09-21");
  assert.deepEqual(jobSetupWindow([]), { start: "", end: "" });
  assert.equal(blankLargeTool().start, "");
});

test("Start/End bill inclusive periods; empty dates stay 1 so totals do not drop", () => {
  assert.equal(billedPeriodCount("", "", "monthly"), 1);
  assert.equal(billedPeriodCount("2026-09-21", "2026-10-21", "monthly"), 1);
  assert.equal(billedPeriodCount("2026-09-21", "2026-10-22", "monthly"), 2);
  assert.equal(billedPeriodCount("2026-09-21", "2026-09-21", "daily"), 1);
  assert.equal(billedPeriodCount("2026-09-21", "2026-09-23", "daily"), 3);
  assert.equal(billedPeriodCount("2026-09-21", "2026-09-27", "weekly"), 1);
  assert.equal(billedPeriodCount("2026-09-21", "2026-09-28", "weekly"), 2);
  const month = {
    id: "lt-1",
    itemId: "air-mover",
    period: "monthly" as const,
    qty: 1,
    start: "2026-09-21",
    end: "2026-10-21",
    enteredCost: 0,
    freight: 40,
  };
  assert.equal(largeToolAmount(month), 288 + 40);
  assert.equal(largeToolAmount({ ...month, end: "2026-10-22" }), 288 * 2 + 40);
  const daily = { ...month, period: "daily" as const, start: "2026-09-21", end: "2026-09-23", freight: 10 };
  assert.equal(largeToolAmount(daily), 32 * 3 + 10);
  assert.equal(largeToolAmount({ ...daily, start: "", end: "" }), 32 + 10);
  const rental = {
    ...blankThirdParty(),
    rate: 100,
    qty: 2,
    freight: 25,
    period: "weekly" as const,
    start: "2026-09-21",
    end: "2026-09-28",
  };
  assert.equal(thirdPartyCost(rental), 100 * 2 * 2 + 25);
  assert.equal(thirdPartyMarkedUp(rental), 450.5);
  assert.equal(thirdPartyCost({ ...rental, start: "", end: "" }), 225);
});
