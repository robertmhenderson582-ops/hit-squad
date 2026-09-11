import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import {
  RATE_VAULT_B1_BOOK_MIX_ERROR,
  RATE_VAULT_B1_PACKAGE_SHEET,
  packageBookFace,
} from "./rate-vault.ts";
import { seedRateVaultLibrary } from "./rate-vault-library.ts";
import {
  WOOD_RIVER_B1_EXHIBIT_DRIVE_ID,
  WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID,
  WOOD_RIVER_TM_B1_EXHIBIT_TITLE,
  filterPreviewByFace,
  inferRateVaultBookFace,
  isWoodRiverRrffB1Source,
  isWoodRiverTmB1Source,
  loadWoodRiverB1PreviewFixture,
  loadWoodRiverTmB1PreviewFixture,
  mergePreviewFace,
  previewHasBookBlend,
  resolveRateVaultPreview,
} from "./rate-vault-preview.ts";
import {
  getRateVaultPackage,
  listRateVaultPackages,
  resetRateVaultStoreForTests,
  upsertRateVaultPackage,
  useRateVaultStoreForTests,
} from "./rate-vault-store.ts";
import { parseRateVaultB1Xlsx, rateVaultB1FileName, rateVaultPreviewToXlsx } from "./rate-vault-xlsx.ts";

describe("Rate Vault Wood River book switch", { concurrency: 1 }, () => {
  afterEach(() => {
    resetRateVaultStoreForTests();
  });

  it("keeps RRFF as the default Wood River package", () => {
    const rrff = loadWoodRiverB1PreviewFixture();
    assert.equal(packageBookFace(rrff), "rrff");
    assert.equal(rrff.bookFace, "rrff");
    assert.ok(rrff.rows.length >= 8);
    assert.equal(
      rrff.rows.some((row) => /boilermaker journeyman/i.test(row.position) && row.local === "363"),
      true,
    );
    assert.equal(resolveRateVaultPreview({ siteId: "wood-river" })?.bookFace, "rrff");
    assert.equal(resolveRateVaultPreview({ siteId: "wood-river", bookFace: "rrff" })?.sourceId, WOOD_RIVER_B1_EXHIBIT_DRIVE_ID);
    assert.doesNotMatch(JSON.stringify(rrff), /shahan/i);
  });

  it("loads a separate filled T&M package and does not bleed RRFF rows", () => {
    const rrff = loadWoodRiverB1PreviewFixture();
    const tm = loadWoodRiverTmB1PreviewFixture();
    assert.equal(tm.bookFace, "tm");
    assert.equal(tm.title, WOOD_RIVER_TM_B1_EXHIBIT_TITLE);
    assert.equal(tm.sourceId, WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID);
    assert.equal(tm.writesRateBook, false);
    assert.ok(tm.rows.length >= 8);
    assert.equal(tm.rows.length, 183);
    assert.equal(tm.craftSheets.length, 8);
    assert.match(tm.note, /Fringes Subtotal/i);
    assert.match(tm.note, /Union_TM/i);
    assert.match(tm.note, /not invented RRFF splits/i);
    assert.doesNotMatch(tm.note, /shahan/i);
    const lead = tm.rows.find((row) => row.position === "LEAD SITE BOILERMAKER 01");
    const pfJw = tm.rows.find((row) => row.position === "PIPEFITTER JOURNEYMAN" && row.sheet.includes("PIPEFITTER") && row.local === "553");
    const bmGf = tm.rows.find((row) => row.position === "BOILERMAKER GENERAL FOREMAN");
    assert.ok(lead && pfJw && bmGf);
    assert.equal(lead.wage, 71);
    assert.ok(Math.abs(lead.billRate - 141.9) <= 0.03);
    assert.equal(pfJw.wage, 49.03);
    assert.equal(pfJw.fringe, 21.5);
    assert.equal(bmGf.wage, 50.6);
    assert.equal(bmGf.fringe, 36.89);
    assert.equal(
      tm.craftSheets
        .filter((sheet) => sheet.lane === "union")
        .every((sheet) => sheet.fringes.length === 1 && sheet.fringes[0]?.label === "Fringes Subtotal"),
      true,
    );
    assert.equal(
      tm.craftSheets.some((sheet) => sheet.lane === "merit" && sheet.fringes.some((line) => line.label === "401K")),
      true,
    );
    assert.equal(
      resolveRateVaultPreview({ siteId: "wood-river", bookFace: "tm" })?.id,
      tm.id,
    );
    assert.equal(
      resolveRateVaultPreview({
        source: seedRateVaultLibrary().find((row) => row.driveId === WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID) ?? null,
      })?.bookFace,
      "tm",
    );
    assert.equal(
      rrff.rows.some((row) => tm.rows.some((item) => item.id === row.id)),
      false,
    );
    assert.equal(previewHasBookBlend(rrff, tm), true);
    const merged = mergePreviewFace(rrff, tm, "both");
    assert.equal(merged.bookFace, "tm");
    assert.ok(merged.rows.length >= 8);
    assert.equal(merged.rows.some((row) => row.position === "Boilermaker Journeyman"), false);
    assert.equal(merged.rows.some((row) => row.position === "LEAD SITE BOILERMAKER 01"), true);
    const rrffAfterSwitch = resolveRateVaultPreview({ siteId: "wood-river", bookFace: "rrff" });
    assert.equal(rrffAfterSwitch?.bookFace, "rrff");
    assert.equal(
      rrffAfterSwitch?.rows.some((row) => row.position === "Boilermaker Journeyman" && row.wage === 45.6),
      true,
    );
  });

  it("infers RRFF vs T&M from Drive id and title without mixing", () => {
    assert.equal(inferRateVaultBookFace({ driveId: WOOD_RIVER_B1_EXHIBIT_DRIVE_ID }), "rrff");
    assert.equal(inferRateVaultBookFace({ driveId: WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID }), "tm");
    assert.equal(inferRateVaultBookFace({ title: "Union_TM Labor Burden Buildup_WOOD RIVER" }), "tm");
    assert.equal(inferRateVaultBookFace({ title: "Wood River Exhibit B-1 RRFF Labor Burden Buildup" }), "rrff");
    assert.equal(isWoodRiverTmB1Source({ title: "01 Exhibit B-1 Union_TM Labor Burden Buildup" }), true);
    assert.equal(isWoodRiverRrffB1Source({ driveId: WOOD_RIVER_B1_EXHIBIT_DRIVE_ID }), true);
    assert.equal(isWoodRiverRrffB1Source({ driveId: WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID }), false);
    const seed = seedRateVaultLibrary();
    assert.equal(
      seed.filter((row) => row.kind === "b1-exhibit" && row.siteId === "wood-river" && row.primary).length,
      2,
    );
  });

  it("keeps OCIP filtering inside one book", () => {
    const rrff = loadWoodRiverB1PreviewFixture();
    const ocip = filterPreviewByFace(rrff, "ocip");
    assert.equal(ocip.bookFace, "rrff");
    assert.equal(ocip.rows.every((row) => row.ocip), true);
    assert.ok(ocip.rows.length < rrff.rows.length);
    const tm = loadWoodRiverTmB1PreviewFixture();
    const tmOcip = filterPreviewByFace(tm, "ocip");
    assert.equal(tmOcip.bookFace, "tm");
    assert.equal(tmOcip.rows.every((row) => row.ocip), true);
    assert.ok(tmOcip.rows.length > 0);
    assert.ok(tmOcip.rows.length < tm.rows.length);
  });

  it("tags export with the selected book and refuses a silent mix on import", async () => {
    const rrff = loadWoodRiverB1PreviewFixture();
    const tm = loadWoodRiverTmB1PreviewFixture();
    const rrffXlsx = await rateVaultPreviewToXlsx(rrff);
    const tmXlsx = await rateVaultPreviewToXlsx(tm);
    assert.equal(rateVaultB1FileName(rrff), "Wood-River-B1-Rate-Vault.xlsx");
    assert.equal(rateVaultB1FileName(tm), "Wood-River-B1-TM-Rate-Vault.xlsx");
    assert.equal(rrffXlsx.fileName, "Wood-River-B1-Rate-Vault.xlsx");
    assert.equal(tmXlsx.fileName, "Wood-River-B1-TM-Rate-Vault.xlsx");

    const ExcelJS = (await import("exceljs")).default;
    const rrffBook = new ExcelJS.Workbook();
    await rrffBook.xlsx.load(rrffXlsx.bytes as unknown as ArrayBuffer);
    const rrffPack = rrffBook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.equal(String(rrffPack?.getCell("B15").value || ""), "rrff");

    const tmBook = new ExcelJS.Workbook();
    await tmBook.xlsx.load(tmXlsx.bytes as unknown as ArrayBuffer);
    const tmPack = tmBook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.equal(String(tmPack?.getCell("B15").value || ""), "tm");

    const importedRrff = await parseRateVaultB1Xlsx({ fileName: rrffXlsx.fileName, bytes: rrffXlsx.bytes });
    assert.equal(importedRrff.ok, true);
    if (!importedRrff.ok) return;
    assert.equal(importedRrff.preview.bookFace, "rrff");
    assert.ok(importedRrff.preview.rows.length >= 8);

    const importedTm = await parseRateVaultB1Xlsx({ fileName: tmXlsx.fileName, bytes: tmXlsx.bytes });
    assert.equal(importedTm.ok, true);
    if (!importedTm.ok) return;
    assert.equal(importedTm.preview.bookFace, "tm");
    assert.ok(importedTm.preview.rows.length >= 8);
    assert.equal(
      importedTm.preview.rows.some((row) => row.position === "LEAD SITE BOILERMAKER 01" && row.wage === 71),
      true,
    );
    assert.match(RATE_VAULT_B1_BOOK_MIX_ERROR, /RRFF/);
    assert.match(RATE_VAULT_B1_BOOK_MIX_ERROR, /T&M/);
    assert.equal(importedRrff.preview.bookFace === importedTm.preview.bookFace, false);
  });

  it("stores RRFF and T&M as separate packages so an import cannot drop the other book", async () => {
    useRateVaultStoreForTests(memoryDrive());
    const rrff = loadWoodRiverB1PreviewFixture();
    const journeyman = rrff.rows.find((row) => row.position === "Boilermaker Journeyman");
    assert.ok(journeyman);
    const savedRrff = await upsertRateVaultPackage({
      ...rrff,
      fixture: false,
      extractedFrom: "vault-xlsx-import",
      rows: rrff.rows.map((row) =>
        row.id === journeyman?.id ? { ...row, wage: 77.77, billRate: 77.77 + row.fringe + row.burden } : row,
      ),
    });
    assert.equal(savedRrff.ok, true);
    const tm = loadWoodRiverTmB1PreviewFixture();
    const lead = tm.rows.find((row) => row.position === "LEAD SITE BOILERMAKER 01");
    assert.ok(lead);
    const savedTm = await upsertRateVaultPackage({
      ...tm,
      fixture: false,
      extractedFrom: "vault-xlsx-import",
      note: "Imported T&M Union_TM package.",
      rows: tm.rows.map((row) =>
        row.id === lead?.id ? { ...row, wage: 88.88, billRate: 88.88 + row.fringe + row.burden } : row,
      ),
    });
    assert.equal(savedTm.ok, true);
    const listed = await listRateVaultPackages();
    assert.equal(listed.length, 2);
    const loadedRrff = await getRateVaultPackage("wood-river", "rrff");
    const loadedTm = await getRateVaultPackage("wood-river", "tm");
    assert.equal(loadedRrff?.rows.find((row) => row.id === journeyman?.id)?.wage, 77.77);
    assert.equal(loadedTm?.rows.find((row) => row.id === lead?.id)?.wage, 88.88);
    assert.ok((loadedTm?.rows.length ?? 0) >= 8);
    assert.equal(loadedTm?.bookFace, "tm");
    assert.equal(loadedRrff?.bookFace, "rrff");
    assert.doesNotMatch(JSON.stringify(loadedTm), /Boilermaker Journeyman/);
  });
});
