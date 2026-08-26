import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILDERS_RISK_YATES,
  buildersRiskPct,
  estimateTotalBreakdown,
  moneyLines,
  parseDeskDollars,
} from "./estimate-total.ts";

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

test("markup is its own line only when the 6% third-party markup has dollars", () => {
  const hidden = estimateTotalBreakdown({ equipment: 400, markup: 0 });
  assert.equal(hidden.lines.some((line) => line.id === "markup"), false);
  const shown = estimateTotalBreakdown({ equipment: 400, markup: 24 });
  assert.equal(shown.lines.find((line) => line.id === "markup")?.amount, 24);
  assert.equal(shown.total, 424);
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
