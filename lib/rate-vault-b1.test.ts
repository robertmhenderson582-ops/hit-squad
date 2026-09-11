import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  b1RatesForCraftSheet,
  craftSheetsFromFlat,
  looksLikePlaceholderIllinoisComposite,
} from "./rate-vault-b1.ts";
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
    assert.equal(meritLead.billOt, 169.63);
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
});
