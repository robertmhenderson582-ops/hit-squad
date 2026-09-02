import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BAYWAY_LABOR } from "./shahan-bayway.ts";
import { FERNDALE_LABOR } from "./shahan-ferndale.ts";
import { MONROE_LABOR } from "./shahan-monroe.ts";
import { RODEO_LABOR, RODEO_MARKUP } from "./shahan-rodeo.ts";
import {
  lookupShahanLabor,
  SHAHAN_LABOR,
  SHAHAN_NO_BOOK_MESSAGE,
  NO_COMP_WAGE_MESSAGE,
} from "./shahan-wood-river.ts";
import { YATES_LABOR } from "./shahan-yates.ts";
import {
  COMP_EFFECTIVE,
  EAST_COAST_AMENDMENT,
  EAST_COAST_COMP,
  EAST_COAST_PCA,
  FERNDALE_EXHIBIT_REV,
  RODEO_EXHIBIT_REV,
  WAGE_BOOKS,
  WEST_COAST_AMENDMENT,
  WEST_COAST_COMP,
  WEST_COAST_PCA,
  bookForSite,
  catalogForSite,
  formatBaseWage,
  formatBilledSt,
  offerRateBookForSite,
  wageLookupLabels,
  wageLookupNote,
} from "./wage-lookup.ts";

function dollars(row: { st?: number | null; ot?: number | null; dt?: number | null; pd?: number | null; baseSt?: number | null } | null) {
  return { baseSt: row?.baseSt ?? null, st: row?.st ?? null, ot: row?.ot ?? null, dt: row?.dt ?? null, pd: row?.pd ?? null };
}

describe("wage lookup plants", () => {
  it("keeps Wood River billed dollars and uses COMP BW for verified wages", () => {
    assert.equal(SHAHAN_LABOR.length, 159);
    const journeyman = lookupShahanLabor("Boilermaker Journeyman");
    assert.deepEqual(dollars(journeyman), { baseSt: 45.6, st: 108.38, ot: 152.78, dt: 197.19, pd: 130 });
    const leadBm = lookupShahanLabor("Lead Site Boilermaker 01");
    assert.deepEqual(dollars(leadBm), { baseSt: 71, st: 141.9, ot: 201.14, dt: 260.38, pd: 140 });
    const leadMerit = lookupShahanLabor("Lead Site 01");
    assert.equal(leadMerit?.baseSt, 90);
    assert.equal(leadMerit?.st, 139.09);
    assert.equal(journeyman?.baseSt !== journeyman?.st, true);
    const wood = bookForSite("Wood River — Roxana, IL");
    assert.equal(wood?.wageCoast, "east");
    assert.equal(formatBaseWage(journeyman!, wood!), "$45.60");
    assert.equal(formatBilledSt(journeyman!), "$108.38");
  });

  it("loads exact Shahan bill rows for Yates, Monroe, Bayway, and Rodeo", () => {
    assert.equal(YATES_LABOR.length, 34);
    assert.equal(MONROE_LABOR.length, 58);
    assert.equal(BAYWAY_LABOR.length, 110);
    assert.equal(RODEO_LABOR.length, 238);
    assert.equal(FERNDALE_LABOR.length, 2);

    const yatesPm = YATES_LABOR[0];
    assert.equal(yatesPm.craftName, "Sr. Project Manager (Merit)");
    assert.deepEqual(dollars(yatesPm), { baseSt: 95, st: 162.18, ot: 222.14, dt: 282.11, pd: 150 });

    const monroeBm = MONROE_LABOR.find((row) => row.craftName === "BOILERMAKER, JOURNEYMAN");
    assert.deepEqual(dollars(monroeBm!), { baseSt: null, st: 126.05, ot: 174.15, dt: 222.25, pd: 150 });
    assert.equal(MONROE_LABOR[0].baseSt, 68);
    assert.equal(MONROE_LABOR[0].st, 140.47);
    assert.equal(MONROE_LABOR[0].group.endsWith(" "), true);

    const baywayFirst = BAYWAY_LABOR[0];
    assert.equal(baywayFirst.craftName, "Site Lead 01");
    assert.deepEqual(dollars(baywayFirst), { baseSt: null, st: 148.59, ot: 206.54, dt: 264.49, pd: 150 });
    const baywayComp = BAYWAY_LABOR.find((row) => row.craftName === "Site Lead 01" && row.st === 138.07);
    assert.equal(baywayComp?.baseSt, 90);
    const baywayBm = BAYWAY_LABOR.find((row) => row.craftName === "Boilermaker Journeyman 01");
    assert.equal(baywayBm?.baseSt, 48.7);
    assert.equal(baywayBm?.st, 125.3);
    assert.equal(BAYWAY_LABOR.at(-1)?.craftName, "Laborer Union Rep");

    assert.equal(RODEO_MARKUP, 0.06);
    const rodeoLead = RODEO_LABOR[0];
    assert.deepEqual(dollars(rodeoLead), { baseSt: 104, st: 184.94, ot: 258.15, dt: 331.36, pd: 155 });
    assert.equal(RODEO_LABOR.filter((row) => /^N {1,2}/.test(row.craftName)).length, 119);
    assert.equal(RODEO_LABOR.some((row) => /IRONWORKER/.test(row.craftName)), true);
    assert.deepEqual(
      RODEO_LABOR.filter((row) => row.st === 0 && /DISCONTINUED/.test(row.craftName)).map((row) => row.craftName),
      [
        "BM APPRENTICE 95% (DISCONTINUED)",
        "BM APPRENTICE 70% (DISCONTINUED)",
        "N BM APPRENTICE 95% (DISCONTINUED)",
        "N BM APPRENTICE 70% (DISCONTINUED)",
      ],
    );
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "BM LEAD QA-QC 01  ")?.st, 148.35);
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "IRONWORKER JOURNEYMAN ")?.st, 124.06);
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "N  SUBCONTRACT 01")?.st, 97.6);
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "N PF  PLANNER ESTIMATOR 01")?.st, 163.9);
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "PIPEFITER GENERAL FOREMAN 01")?.group, "Direct Craft");
    assert.equal(RODEO_LABOR.find((row) => row.craftName === "N PIPEFITER GENERAL FOREMAN 01")?.group, "Management");
    assert.deepEqual(dollars(RODEO_LABOR.find((row) => row.craftName === "N IRONWORKER GENERAL FOREMAN")!), {
      baseSt: null,
      st: 142.31,
      ot: 183.11,
      dt: 123.91,
      pd: 155,
    });
    assert.deepEqual(dollars(RODEO_LABOR.at(-1)!), { baseSt: null, st: 141.18, ot: 178.11, dt: 215.04, pd: 145 });
    const billedTsv = RODEO_LABOR.map((row) => [row.craftName, row.group, row.st, row.ot, row.dt, row.pd].join("\t")).join("\n") + "\n";
    assert.equal(createHash("sha256").update(billedTsv).digest("hex"), "0293d4156f3551cd90f6076924e9d4fa0e63c69348d19ca19936076f63059f36");
    assert.equal(SHAHAN_LABOR[0].craftName, "Lead Site Boilermaker 01");
    assert.equal(SHAHAN_LABOR[0].st, 141.9);
    assert.equal(SHAHAN_LABOR.at(-1)?.craftName, "COORDINATOR QA-QC 2");
    assert.equal(SHAHAN_LABOR.at(-1)?.st, 96.78);

    const ferndaleLead = FERNDALE_LABOR[0];
    assert.deepEqual(dollars(ferndaleLead), { baseSt: 80, st: 120.17, ot: null, dt: null, pd: null });
    assert.equal(FERNDALE_LABOR[1].baseSt, 49.51);
    assert.equal(FERNDALE_LABOR[1].st, 107.53);
  });

  it("routes Wage lookup by Job setup site and leaves Billings empty", () => {
    assert.equal(offerRateBookForSite("Rodeo").ok, true);
    assert.equal(offerRateBookForSite("Bayway").ok, true);
    assert.equal(offerRateBookForSite("Yates — Newnan, GA").ok, true);
    assert.equal(offerRateBookForSite("Monroe Energy").ok, true);
    assert.equal(offerRateBookForSite("Ferndale").ok, true);
    assert.equal(offerRateBookForSite("Wood River — Roxana, IL").ok, true);
    const billings = offerRateBookForSite("Billings");
    assert.equal(billings.ok, false);
    assert.equal(billings.ok ? "" : billings.message, SHAHAN_NO_BOOK_MESSAGE);
    assert.equal(catalogForSite("Billings")?.length, 0);
    assert.equal(bookForSite("Rodeo")?.wageCoast, "west");
    assert.equal(bookForSite("Bayway")?.wageCoast, "east");
    assert.equal(bookForSite("Ferndale")?.wageCoast, "west");
    assert.equal(bookForSite("Yates")?.wageCoast, null);
    assert.equal(formatBaseWage(MONROE_LABOR[3], bookForSite("Monroe Energy")!), NO_COMP_WAGE_MESSAGE);
    assert.equal(formatBaseWage(BAYWAY_LABOR[0], bookForSite("Bayway")!), "");
    assert.equal(bookForSite("Rodeo")?.pca, WEST_COAST_PCA);
    assert.equal(bookForSite("Ferndale")?.pca, WEST_COAST_PCA);
    assert.equal(bookForSite("Bayway")?.pca, EAST_COAST_PCA);
    assert.equal(bookForSite("Wood River")?.pca, EAST_COAST_PCA);
    assert.equal(bookForSite("Yates")?.pca, null);
    assert.equal(bookForSite("Monroe Energy")?.pca, null);
  });

  it("keeps East Coast PCA0001103 and West Coast PCA0001100 on separate books", () => {
    const east = WAGE_BOOKS.filter((book) => book.wageCoast === "east");
    const west = WAGE_BOOKS.filter((book) => book.wageCoast === "west");
    const none = WAGE_BOOKS.filter((book) => book.wageCoast === null);
    assert.deepEqual(east.map((book) => book.plant).sort(), ["Bayway", "Wood River"]);
    assert.deepEqual(west.map((book) => book.plant).sort(), ["Ferndale", "Rodeo"]);
    assert.deepEqual(none.map((book) => book.plant).sort(), ["Monroe Energy", "Yates"]);
    for (const book of east) {
      assert.equal(book.pca, EAST_COAST_PCA);
      assert.equal(book.amendment, EAST_COAST_AMENDMENT);
      assert.equal(book.effective, COMP_EFFECTIVE);
      assert.equal(book.pca === WEST_COAST_PCA, false);
      assert.match(wageLookupNote(book), /PCA0001103/);
      assert.doesNotMatch(wageLookupNote(book), /PCA0001100/);
    }
    for (const book of west) {
      assert.equal(book.pca, WEST_COAST_PCA);
      assert.equal(book.amendment, WEST_COAST_AMENDMENT);
      assert.equal(book.effective, COMP_EFFECTIVE);
      assert.equal(book.pca === EAST_COAST_PCA, false);
      assert.match(wageLookupNote(book), /PCA0001100/);
      assert.doesNotMatch(wageLookupNote(book), /PCA0001103/);
    }
    const rodeo = bookForSite("Rodeo")!;
    const ferndale = bookForSite("Ferndale")!;
    assert.equal(rodeo.exhibitRev, RODEO_EXHIBIT_REV);
    assert.equal(ferndale.exhibitRev, FERNDALE_EXHIBIT_REV);
    assert.match(wageLookupNote(rodeo), /Rodeo \(Rev 7-1-26\) only/);
    assert.match(wageLookupNote(ferndale), /Ferndale \(Rev 6-1-26\) only/);
    assert.match(EAST_COAST_COMP, /PCA0001103/);
    assert.match(WEST_COAST_COMP, /PCA0001100/);
    assert.equal(rodeo.catalog.filter((row) => row.wageSource === "comp").length, 1);
    assert.equal(rodeo.catalog[0].baseSt, 104);
    assert.equal(rodeo.catalog[0].baseSt === 110, false);
    assert.equal(ferndale.catalog.length, 2);
    assert.deepEqual(
      ferndale.catalog.map((row) => row.baseSt),
      [80, 49.51],
    );
  });

  it("disambiguates duplicate Bayway titles without rewriting Crew", () => {
    const labels = wageLookupLabels(BAYWAY_LABOR);
    const leads = labels.filter((item) => item.row.craftName === "Site Lead 01");
    assert.equal(leads.length, 2);
    assert.equal(leads[0].label, "Site Lead 01 (1)");
    assert.equal(leads[1].label, "Site Lead 01 (2)");
    assert.equal(leads[0].row.st, 148.59);
    assert.equal(leads[1].row.st, 138.07);
    const crew = readFileSync(fileURLToPath(new URL("../components/RateBuilder.tsx", import.meta.url)), "utf8");
    assert.match(crew, /BASE WAGE/);
    assert.match(crew, /BILLED ST/);
    assert.doesNotMatch(crew, /setCrew|rematchCrewToShahan/);
    assert.equal(/\[\"CRAFT\", \"ST\", \"OT\", \"DT\", \"PD\"\]/.test(crew), false);
  });
});
