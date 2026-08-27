import assert from "node:assert/strict";
import { test } from "node:test";
import { thirdPartyCost } from "./equipment-sheet.ts";
import {
  BUILDERS_RISK_YATES,
  ESTIMATE_MARKUP_LABEL,
  ESTIMATE_MARKUP_RATE,
  buildersRiskPct,
  estimateMarkupDollars,
  estimateTotalBreakdown,
  markupBase,
  moneyLines,
  parseDeskDollars,
} from "./estimate-total.ts";
import { miscAmount } from "./other-cost.ts";
import { readSubSheet, subcontractorMarkupBase, subcontractorTotal, writeSubSheet } from "./subcontractor.ts";

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

test("zero-dollar buckets stay off the rail", () => {
  const next = estimateTotalBreakdown({
    labor: 0,
    equipment: 1200,
    markup: 0,
    otherCost: 0,
    changeOrders: 0,
    hours: 40,
    client: "Phillips 66",
    site: "Wood River",
  });
  assert.deepEqual(
    next.lines.map((line) => line.id),
    ["equipment"],
  );
  assert.equal(next.lines.some((line) => line.amount === 0), false);
  assert.equal(next.total, 1200);
  assert.equal(next.hours, 40);
  assert.equal(next.lines.some((line) => /bid/i.test(line.label)), false);
  assert.equal(next.lines.some((line) => /margin/i.test(line.label)), false);
});

test("P66 never gets builder's risk; Yates / Georgia Power is 0.834% only", () => {
  assert.equal(buildersRiskPct("Phillips 66", "Wood River"), 0);
  assert.equal(buildersRiskPct("P66", "Bayway"), 0);
  assert.equal(buildersRiskPct("Georgia Power", "Yates"), BUILDERS_RISK_YATES);
  assert.equal(buildersRiskPct("Yates", "Newnan, GA"), BUILDERS_RISK_YATES);
  assert.equal(buildersRiskPct("Monroe Energy", "Trainer"), 0);
  const p66 = estimateTotalBreakdown({ equipment: 1000, client: "Phillips 66", site: "Wood River" });
  assert.equal(p66.lines.some((line) => line.id === "risk"), false);
  const yates = estimateTotalBreakdown({ equipment: 1000, client: "Georgia Power", site: "Yates" });
  assert.equal(yates.lines.find((line) => line.id === "risk")?.amount, 8.34);
  assert.equal(yates.total, 1008.34);
});

test("markup is its own line only when the 6.5% markup has dollars", () => {
  const hidden = estimateTotalBreakdown({ equipment: 400, markup: 0 });
  assert.equal(hidden.lines.some((line) => line.id === "markup"), false);
  const shown = estimateTotalBreakdown({ equipment: 400, markup: 24 });
  assert.equal(shown.lines.find((line) => line.id === "markup")?.amount, 24);
  assert.equal(shown.lines.find((line) => line.id === "markup")?.label, ESTIMATE_MARKUP_LABEL);
  assert.equal(shown.total, 424);
});

test("6.5% markup is only subs + third-party + misc", () => {
  assert.equal(ESTIMATE_MARKUP_RATE, 0.065);
  assert.equal(markupBase({ subcontractor: 1000, thirdParty: 200, misc: 50 }), 1250);
  assert.equal(estimateMarkupDollars({ subcontractor: 1000, thirdParty: 200, misc: 50 }), 81.25);
  assert.equal(estimateMarkupDollars({ subcontractor: 0, thirdParty: 0, misc: 0 }), 0);
  assert.equal(estimateMarkupDollars({ subcontractor: 100, thirdParty: 0, misc: 0 }), 6.5);

  const crew = 9000;
  const tools = 500;
  const travelAndPd = 250;
  const subs = 1000;
  const thirdParty = 200;
  const misc = 50;
  const markup = estimateMarkupDollars({ subcontractor: subs, thirdParty, misc });
  assert.equal(markup, 81.25);
  const next = estimateTotalBreakdown({
    labor: crew,
    equipment: tools + thirdParty,
    subcontractor: subs,
    markup,
    otherCost: travelAndPd + misc,
    hours: 40,
  });
  assert.equal(next.lines.find((line) => line.id === "markup")?.amount, 81.25);
  assert.equal(next.lines.find((line) => line.id === "markup")?.label, "6.5% markup");
  assert.equal(next.lines.find((line) => line.id === "labor")?.amount, crew);
  assert.equal(next.lines.find((line) => line.id === "equipment")?.amount, tools + thirdParty);
  assert.equal(next.total, crew + tools + thirdParty + subs + travelAndPd + misc + 81.25);
  assert.equal(estimateMarkupDollars({ subcontractor: 0, thirdParty: 0, misc: 80 }), 5.2);
  assert.notEqual(estimateMarkupDollars({ subcontractor: 1000, thirdParty: 200, misc: 50 }), 1000 * 0.06);
});

test("6.5% markup rereads the same dollars after the estimate sheets persist", () => {
  const store = memoryStore();
  const key = "new:markup-keep";
  writeSubSheet(
    key,
    { lines: [{ id: "a", vendor: "Apex", scope: "LS", qty: 1, unit: "LS", rate: 4000 }] },
    store,
  );
  const third = thirdPartyCost({
    id: "tp-1",
    item: "Crane",
    period: "weekly",
    rate: 1000,
    freight: 0,
    qty: 1,
    start: "",
    end: "",
  });
  const misc = miscAmount({ id: "m", item: "Steel", description: "Channel", qty: 2, each: 40 });
  const first = estimateMarkupDollars({
    subcontractor: subcontractorTotal(readSubSheet(key, store)),
    thirdParty: third,
    misc,
  });
  const again = estimateMarkupDollars({
    subcontractor: subcontractorTotal(readSubSheet(key, store)),
    thirdParty: third,
    misc,
  });
  assert.equal(first, 330.2);
  assert.equal(again, first);
});

test("affiliate one-off stays on Subcontractor and is left out of the persisted 6.5% markup", () => {
  const store = memoryStore();
  const key = "new:affiliate-markup";
  writeSubSheet(
    key,
    { lines: [{ id: "a", vendor: "JVIC", scope: "LS", qty: 1, unit: "LS", rate: 4000, affiliate: true }] },
    store,
  );
  const sheet = readSubSheet(key, store);
  assert.equal(subcontractorTotal(sheet), 4000);
  assert.equal(subcontractorMarkupBase(sheet), 0);
  const first = estimateMarkupDollars({
    subcontractor: subcontractorMarkupBase(sheet),
    thirdParty: 200,
    misc: 50,
  });
  const again = estimateMarkupDollars({
    subcontractor: subcontractorMarkupBase(readSubSheet(key, store)),
    thirdParty: 200,
    misc: 50,
  });
  assert.equal(first, 16.25);
  assert.equal(again, first);
});

test("Subcontractor is its own rail line, not inside Labor or Other Cost", () => {
  const next = estimateTotalBreakdown({
    labor: 1000,
    equipment: 200,
    subcontractor: 350,
    otherCost: 50,
    hours: 20,
  });
  assert.equal(next.lines.find((line) => line.id === "subcontractor")?.amount, 350);
  assert.equal(next.lines.find((line) => line.id === "labor")?.amount, 1000);
  assert.equal(next.lines.find((line) => line.id === "other")?.amount, 50);
  assert.equal(next.total, 1600);
});

test("labor dollars stay hidden until a crew cost is actually on the row", () => {
  assert.equal(parseDeskDollars(""), 0);
  assert.equal(parseDeskDollars("$1,250.50"), 1250.5);
  const next = estimateTotalBreakdown({ labor: 0, hours: 80, otherCost: 250 });
  assert.equal(next.lines.some((line) => line.id === "labor"), false);
  assert.equal(next.hours, 80);
  assert.deepEqual(
    moneyLines([{ id: "labor", label: "Labor", amount: 0 }]),
    [],
  );
});
