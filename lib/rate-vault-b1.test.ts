import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyB1LineControlsToPreview,
  b1RatesForCraftSheet,
  craftSheetsFromFlat,
  fringeLine,
  fringeOnBucket,
  looksLikePlaceholderIllinoisComposite,
} from "./rate-vault-b1.ts";
import {
  inferRateVaultB1Controls,
  parseRateVaultB1LinePatch,
  rateVaultB1SelectOptions,
  retainRateVaultB1Option,
} from "./rate-vault-b1-options.ts";
import { loadWoodRiverB1PreviewFixture, loadWoodRiverTmB1PreviewFixture } from "./rate-vault-preview.ts";
import { woodRiverB1CraftSheets } from "./rate-vault-wood-river-b1.ts";
import { woodRiverTmB1CraftSheets } from "./rate-vault-wood-river-tm-b1.ts";

describe("Rate Vault B-1 craft-sheet math", () => {
  it("matches filled Wood River RRFF ST / OT pairs", () => {
    const sheets = woodRiverB1CraftSheets();
    const bm = sheets.find((sheet) => sheet.id === "wr-bm");
    const merit = sheets.find((sheet) => sheet.id === "wr-merit-staff");
    const bmStaff = sheets.find((sheet) => sheet.id === "wr-bm-staff");
    assert.ok(bm && merit && bmStaff);
    assert.deepEqual(b1RatesForCraftSheet(bm, 48.23), {
      wage: 48.23,
      fringe: 36.14,
      burden: 10.22,
      bill: 94.59,
      billOt: 140.21,
      billDt: 185.83,
    });
    const meritLead = b1RatesForCraftSheet(merit, 90);
    assert.equal(meritLead.wage, 90);
    assert.equal(meritLead.fringe, 11.05);
    assert.equal(merit.fringes.find((line) => line.label === "Health")?.calcOt, "Straight Time");
    assert.equal(merit.fringes.find((line) => line.label === "Health")?.rideOt, false);
    assert.equal(meritLead.billOt, 164.88);
    assert.equal(b1RatesForCraftSheet(merit, 72).bill, 93.89);
    assert.equal(b1RatesForCraftSheet(bmStaff, 71).bill, 119.07);
  });

  it("rebuilds hall cards from a flat B-1 export", () => {
    const sheets = woodRiverB1CraftSheets();
    const bm = sheets.find((sheet) => sheet.id === "wr-bm");
    assert.ok(bm);
    const payTax = bm.burden.find((line) => line.family === "pay-tax");
    assert.ok(payTax);
    const rebuilt = craftSheetsFromFlat(
      [{ ...payTax, sheet: null, craft: null, local: null }, ...bm.burden.filter((line) => line.family !== "pay-tax")],
      bm.fringes,
      [
        {
          id: "gf",
          sheet: bm.sheet,
          group: bm.group,
          craft: bm.craft,
          local: bm.local,
          position: "Boilermaker General Foreman",
          wage: 48.23,
          fringe: 36.14,
          burden: 10.22,
          billRate: 94.59,
          billOt: 140.21,
          billDt: 185.83,
          lane: "union",
          ocip: false,
          clockNote: "",
        },
      ],
    );
    assert.equal(rebuilt.length, 1);
    assert.equal(rebuilt[0]?.fringes.some((line) => line.label === "H&W" && line.amountHr === 7.07), true);
    assert.equal(rebuilt[0]?.burden.some((line) => line.label === "Pay Tax FICA-MC"), true);
  });

  it("rejects the placeholder Illinois composite and keeps Publish off live books", () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    assert.equal(looksLikePlaceholderIllinoisComposite(fixture.burden), false);
    assert.equal(fixture.writesRateBook, false);
    assert.equal(fixture.burden.some((line) => line.label === "Pay Tax SUI" && line.ratePct === 8.55), true);
    assert.equal(
      fixture.rows.some((row) => row.position === "Boilermaker General Foreman" && row.billRate === 94.59),
      true,
    );
    assert.equal(
      fixture.rows.some((row) => row.position === "Boilermaker Journeyman" && row.fringe === 36.14),
      true,
    );
  });

  it("keeps T&M Fringes Subtotal honesty and does not invent RRFF splits", () => {
    const tm = loadWoodRiverTmB1PreviewFixture();
    const sheets = woodRiverTmB1CraftSheets();
    const bm = sheets.find((sheet) => sheet.id === "wr-tm-bm");
    const pf = sheets.find((sheet) => sheet.id === "wr-tm-pf");
    assert.ok(bm && pf);
    assert.equal(bm.fringes.length, 1);
    assert.equal(bm.fringes[0]?.label, "Fringes Subtotal");
    assert.equal(bm.fringes[0]?.amountHr, 36.89);
    assert.equal(pf.fringes[0]?.amountHr, 21.5);
    const gf = b1RatesForCraftSheet(bm, 50.6);
    assert.equal(gf.wage, 50.6);
    assert.equal(gf.fringe, 36.89);
    assert.equal(looksLikePlaceholderIllinoisComposite(tm.burden), false);
    assert.equal(tm.writesRateBook, false);
    assert.equal(tm.bookFace, "tm");
    assert.equal(
      tm.rows.some((row) => row.position === "BOILERMAKER GENERAL FOREMAN" && row.fringe === 36.89 && row.wage === 50.6),
      true,
    );
  });

  it("calculates every Exhibit B-1 calc / base / rate-kind / ride choice", () => {
    const base = {
      id: "hw",
      label: "H&W",
      amountHr: 10,
      craft: "Boilermaker",
      local: "363",
      sheet: "WOODRIVER BOILERMAKER RRFF",
    };
    const worked = fringeLine({ ...base, calcOt: "Hours Worked", calcDt: "Hours Worked", rideOt: true, rideDt: true });
    assert.equal(fringeOnBucket(worked, 40, "ot"), 10);
    assert.equal(fringeOnBucket(worked, 40, "dt"), 10);

    const paid = fringeLine({ ...base, calcOt: "Hours Paid", calcDt: "Hours Paid", rideOt: true, rideDt: true });
    assert.equal(fringeOnBucket(paid, 40, "ot"), 15);
    assert.equal(fringeOnBucket(paid, 40, "dt"), 20);

    const straight = fringeLine({ ...base, calcOt: "Straight Time", calcDt: "Straight Time", rideOt: false, rideDt: false });
    assert.equal(fringeOnBucket(straight, 40, "ot"), 0);
    assert.equal(fringeOnBucket(straight, 40, "dt"), 0);

    const yes = fringeLine({ ...base, calcOt: "Y", calcDt: "Y", rideOt: true, rideDt: true });
    assert.equal(fringeOnBucket(yes, 40, "ot"), 15);
    const no = fringeLine({ ...base, calcOt: "N", calcDt: "N" });
    assert.equal(fringeOnBucket(no, 40, "ot"), 0);

    const varies = fringeLine({ ...base, calcOt: "Varies", calcDt: "Varies", mult: 0.6667, rideOt: true, rideDt: true });
    assert.equal(fringeOnBucket(varies, 40, "ot"), 6.67);

    const pctTax = fringeLine({
      ...base,
      id: "annuity",
      label: "Annuity",
      amountHr: 0,
      ratePct: 10,
      unit: "pct-taxable",
      base: "Tax BW",
      calcOt: "Hours Paid",
      calcDt: "Hours Paid",
      rideOt: true,
      rideDt: true,
    });
    assert.equal(fringeOnBucket(pctTax, 40, "ot"), 6);
    const pctBase = fringeLine({ ...pctTax, id: "annuity-bw", base: "Base Wage" });
    assert.equal(fringeOnBucket(pctBase, 40, "ot"), 6);

    const custom = fringeLine({ ...base, id: "custom", calcOt: "Book Custom Mode", rideOt: true, mult: 1.25 });
    assert.equal(custom.calcOt, "Book Custom Mode");
    assert.equal(fringeOnBucket(custom, 40, "ot"), 12.5);
    assert.equal(rateVaultB1SelectOptions("calc", "Book Custom Mode").includes("Book Custom Mode"), true);
    assert.deepEqual(retainRateVaultB1Option(["Hours Worked"], "Book Custom Mode"), ["Hours Worked", "Book Custom Mode"]);
  });

  it("maps legacy ridesOt without hiding B-1 choices, and patches change Bill OT/DT", () => {
    const rides = inferRateVaultB1Controls({ ridesOt: true, unit: "amount-hr" });
    assert.equal(rides.calcOt, "Hours Paid");
    assert.equal(rides.rideOt, true);
    const parked = inferRateVaultB1Controls({ ridesOt: false, unit: "amount-hr" });
    assert.equal(parked.calcOt, "Hours Worked");
    assert.equal(parked.rideOt, true);

    const fixture = loadWoodRiverB1PreviewFixture();
    const gf = fixture.rows.find((row) => row.position === "Boilermaker General Foreman");
    const hw = fixture.fringes.find((line) => line.label === "H&W" && line.sheet.includes("BOILERMAKER"));
    assert.ok(gf && hw);
    assert.equal(gf.billOt, 140.21);
    assert.equal(hw.calcOt, "Hours Paid");
    const next = applyB1LineControlsToPreview(fixture, hw.id, parseRateVaultB1LinePatch({ calcOt: "Straight Time", rideOt: false }));
    const patched = next.rows.find((row) => row.position === "Boilermaker General Foreman");
    const patchedLine = next.fringes.find((line) => line.id === hw.id);
    assert.equal(patchedLine?.calcOt, "Straight Time");
    assert.equal(patchedLine?.rideOt, false);
    assert.ok((patched?.billOt ?? 0) < (gf.billOt ?? 0));
    assert.equal(Math.round(((gf.billOt ?? 0) - (patched?.billOt ?? 0)) * 100) / 100, 10.61);
  });
});
