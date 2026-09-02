import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EAST_COAST_OT_NOTE,
  FRINGE_METHODS,
  LABOR_SHEET_COLUMNS,
  LABOR_SHEET_FRINGE,
  RATE_OT_MULTIPLIER,
  craftBillingRates,
  compositeRates,
  newBuiltCraft,
  newFringeRow,
  parseRateBuilderSheet,
} from "./rate-builder.ts";

describe("rate builder fringe stack", () => {
  it("keeps every fringe method open and computes a mixed stack", () => {
    assert.deepEqual(FRINGE_METHODS, [
      "hour-worked",
      "hour-paid",
      "pct-taxable",
      "pct-gross",
      "pct-st-only",
      "weekly-cap-40",
      "per-shift",
      "included-in-wage",
    ]);
    const craft = newBuiltCraft({
      craft: "Pipefitter Journeyman",
      local: "Local 597",
      baseSt: 50,
      fringes: [
        newFringeRow({ name: "H&W", method: "hour-worked", amount: 8, ridesOt: true }),
        newFringeRow({ name: "Pension", method: "pct-taxable", amount: 10, ridesOt: true }),
        newFringeRow({ name: "Vacation", method: "pct-st-only", amount: 5, ridesOt: false }),
        newFringeRow({ name: "Training", method: "weekly-cap-40", amount: 20, ridesOt: false }),
        newFringeRow({ name: "Travel", method: "per-shift", amount: 40, ridesOt: false }),
        newFringeRow({ name: "401k", method: "pct-gross", amount: 3, ridesOt: true }),
        newFringeRow({ name: "Dues", method: "included-in-wage", amount: 1, ridesOt: false }),
        newFringeRow({ name: "SUTA", method: "hour-paid", amount: 2, ridesOt: true }),
      ],
    });
    const next = compositeRates(craft);
    // ST: 50 + 8 + 2 + 20 + 5 + 10%*50 + 5%*50 + 3%*(50+8+2+20+5) = 50+8+2+20+5+5+2.5+2.55
    assert.equal(next.st, 95.05);
    // OT wage 75; H&W 8; SUTA 3; pension 7.5; 401k 3%*(75+8+3)=2.58
    assert.equal(next.ot, 96.08);
    // DT wage 100; H&W 8; SUTA 4; pension 10; 401k 3%*(100+8+4)=3.36
    assert.equal(next.dt, 125.36);
    assert.notEqual(next.st, next.ot);
    assert.ok(next.dt > next.ot);
  });

  it("does not add included-in-wage or a fringe that does not ride OT", () => {
    const next = compositeRates({
      baseSt: 40,
      fringes: [
        newFringeRow({ name: "Dues", method: "included-in-wage", amount: 12, ridesOt: true }),
        newFringeRow({ name: "H&W", method: "hour-worked", amount: 6, ridesOt: false }),
      ],
    });
    assert.equal(next.st, 46);
    assert.equal(next.ot, 60);
    assert.equal(next.dt, 80);
  });
});

describe("Yates-style labor sheet", () => {
  it("keeps East Coast OT 1.5 and maps a sheet without treating billed ST as BW", () => {
    assert.equal(RATE_OT_MULTIPLIER, 1.5);
    assert.match(EAST_COAST_OT_NOTE, /OT 1\.5/);
    assert.match(EAST_COAST_OT_NOTE, /Not DT after 12/);
    assert.deepEqual(LABOR_SHEET_COLUMNS, [
      "CRAFT / POSITION",
      "BASE WAGE (BW)",
      "BILLED ST",
      "BILLED OT",
      "BILLED DT",
      "PD",
    ]);
    const rows = parseRateBuilderSheet(
      [
        "Craft / Position,Base Rate,ST Billable,Billed OT,Billed DT,PD",
        "Pipefitter Journeyman,48.50,108.38,152.65,196.12,130",
      ].join("\n"),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].craft, "Pipefitter Journeyman");
    assert.equal(rows[0].baseSt, 48.5);
    assert.equal(rows[0].billedSt, 108.38);
    assert.equal(rows[0].billedOt, 152.65);
    assert.equal(rows[0].billedDt, 196.12);
    assert.equal(rows[0].fringes[0]?.name, LABOR_SHEET_FRINGE);
    assert.equal(rows[0].fringes[0]?.amount, 130);
    const billed = craftBillingRates(rows[0]);
    assert.equal(billed.st, 108.38);
    assert.notEqual(rows[0].baseSt, rows[0].billedSt);
    assert.equal(parseRateBuilderSheet("ST Billable,Craft\n99,Helper")[0]?.baseSt, 0);
    assert.equal(parseRateBuilderSheet("ST Billable,Craft\n99,Helper")[0]?.billedSt, 99);
  });
});
