import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupShahanEquipment, rematchShahanEquipmentId, shahanEquipmentId, shahanEquipmentRows } from "./shahan-wood-river.ts";
import {
  billedPeriodCount,
  blankLargeTool,
  blankThirdParty,
  emptyEquipmentSheet,
  endDateForPeriodCount,
  equipmentTotals,
  jobSetupWindow,
  largeToolAmount,
  removeEquipmentLine,
  seedEmptyEquipmentWindow,
  seedLineDates,
  resolveLargeToolLine,
  resolveThirdPartyLine,
  thirdPartyCost,
  thirdPartyMarkedUp,
  type LargeToolLine,
} from "./equipment-sheet.ts";

test("third-party rental is typed cost + 6.5% COMP fee, not a plant picker", () => {
  const line = { ...blankThirdParty(), item: "Crane", period: "weekly" as const, rate: 1000, freight: 200, qty: 2 };
  assert.equal(thirdPartyCost(line), 2200);
  assert.equal(thirdPartyMarkedUp(line), 2343);
  assert.equal(thirdPartyMarkedUp(line, "Phillips 66", "Bayway"), 2343);
  assert.equal(thirdPartyMarkedUp(line, "Georgia Power", "Yates"), 2420);
  assert.equal("itemId" in line, false);
  assert.equal(lookupShahanEquipment("crane"), null);
});

test("large tools use the Shahan Wood River listed rate", () => {
  const mover = lookupShahanEquipment("air-mover");
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
  assert.equal(totals.thirdParty, 106.5);
  assert.equal(totals.total, 170.5);
});

test("illegal catalog periods fall back to the first period that has a rate", () => {
  const guns = resolveThirdPartyLine({
    ...blankThirdParty(),
    item: "LN 25 Mig guns",
    period: "daily",
    rate: 0,
    freight: 50,
  });
  assert.equal(guns.period, "monthly");
  assert.equal(guns.rate, 225);
  const custom = resolveThirdPartyLine({
    ...blankThirdParty(),
    item: "Made-up crane",
    period: "weekly",
    rate: 400,
  });
  assert.equal(custom.period, "weekly");
  assert.equal(custom.rate, 400);
  const threaders = resolveLargeToolLine({
    id: "lt-th",
    itemId: "PIPE THREADERS (535 AND LARGER) COST PLUS 6%",
    period: "daily",
    qty: 1,
    start: "",
    end: "",
    enteredCost: 100,
    freight: 0,
  });
  assert.equal(threaders.period, "daily");
});

test("wet and dry copies of the same description bill different Shahan dollars", () => {
  const rows = shahanEquipmentRows();
  const wet = rows.find((row) => row.wet && row.description === "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR");
  const dry = rows.find((row) => !row.wet && row.description === "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR");
  assert.ok(wet && dry);
  const wetLine: LargeToolLine = {
    id: "lt-wet",
    itemId: shahanEquipmentId(wet, rows.indexOf(wet)),
    period: "daily",
    qty: 1,
    start: "",
    end: "",
    enteredCost: 0,
    freight: 0,
  };
  const dryLine = { ...wetLine, id: "lt-dry", itemId: shahanEquipmentId(dry, rows.indexOf(dry)) };
  assert.equal(largeToolAmount(wetLine), 1592);
  assert.equal(largeToolAmount(dryLine), 1512);
  assert.equal(rematchShahanEquipmentId("air-mover").startsWith("dry:"), true);
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

test("third-party 6.5% COMP fee covers typed cost plus freight", () => {
  const line = { ...blankThirdParty(), rate: 1000, freight: 200, qty: 2 };
  assert.equal(thirdPartyCost(line), 2200);
  assert.equal(thirdPartyMarkedUp(line), 2343);
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
  assert.equal(totals.thirdParty, 2343);
  assert.equal(totals.total, 2447);
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
  assert.equal(thirdPartyMarkedUp(rental), 452.63);
  assert.equal(thirdPartyCost({ ...rental, start: "", end: "" }), 225);
});

test("removing one large-tool line leaves the others; last line may empty the card", () => {
  const keep = { ...blankLargeTool(), id: "lt-keep", itemId: "air-mover", qty: 2 };
  const drop = { ...blankLargeTool(), id: "lt-drop", itemId: "rad-gun-torque", qty: 1 };
  const rental = { ...blankThirdParty(), id: "tp-keep", item: "Skip Pan", rate: 847 };
  const sheet = { largeTools: [keep, drop], thirdParty: [rental] };
  const next = removeEquipmentLine(sheet, "largeTools", "lt-drop");
  assert.deepEqual(next.largeTools.map((line) => line.id), ["lt-keep"]);
  assert.equal(next.largeTools[0]?.qty, 2);
  assert.equal(next.thirdParty.length, 1);
  assert.equal(next.thirdParty[0]?.item, "Skip Pan");
  assert.equal(next.thirdParty[0]?.rate, 847);
  const empty = removeEquipmentLine(next, "largeTools", "lt-keep");
  assert.deepEqual(empty.largeTools, []);
  assert.equal(empty.thirdParty[0]?.id, "tp-keep");
});

test("removing one third-party line leaves the others; last line may empty the card", () => {
  const tool = { ...blankLargeTool(), id: "lt-keep", itemId: "air-mover" };
  const keep = { ...blankThirdParty(), id: "tp-keep", item: "Skip Pan", rate: 847, freight: 100 };
  const drop = { ...blankThirdParty(), id: "tp-drop", item: "Sissor Lift", rate: 417, freight: 250 };
  const sheet = { largeTools: [tool], thirdParty: [keep, drop] };
  const next = removeEquipmentLine(sheet, "thirdParty", "tp-drop");
  assert.deepEqual(next.thirdParty.map((line) => line.id), ["tp-keep"]);
  assert.equal(next.thirdParty[0]?.item, "Skip Pan");
  assert.equal(next.thirdParty[0]?.rate, 847);
  assert.equal(next.largeTools.length, 1);
  assert.equal(next.largeTools[0]?.itemId, "air-mover");
  const empty = removeEquipmentLine(next, "thirdParty", "tp-keep");
  assert.deepEqual(empty.thirdParty, []);
  assert.equal(empty.largeTools[0]?.id, "lt-keep");
});

test("endDateForPeriodCount inverts billedPeriodCount for daily weekly and monthly", () => {
  const start = "2026-09-01";
  for (const period of ["daily", "weekly", "monthly"] as const) {
    for (const n of [1, 2, 5, 12]) {
      const end = endDateForPeriodCount(start, period, n);
      assert.equal(billedPeriodCount(start, end, period), n, `${period} × ${n}`);
    }
  }
  assert.equal(endDateForPeriodCount(start, "daily", 1), start);
  assert.equal(billedPeriodCount(start, endDateForPeriodCount(start, "hourly", 8), "hourly"), 8);
});
