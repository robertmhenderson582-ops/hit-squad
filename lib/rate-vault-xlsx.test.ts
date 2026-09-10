import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  RATE_VAULT_B1_BURDEN_SHEET,
  RATE_VAULT_B1_IMPORT_ERROR,
  RATE_VAULT_B1_KIND,
  RATE_VAULT_B1_MARKER,
  RATE_VAULT_B1_PACKAGE_SHEET,
  RATE_VAULT_B1_RATE_SHEET,
} from "./rate-vault.ts";
import { loadWoodRiverB1PreviewFixture } from "./rate-vault-preview.ts";
import {
  RATE_VAULT_B1_RATE_HEADERS,
  parseRateVaultB1Xlsx,
  rateVaultB1FileName,
  rateVaultPreviewToXlsx,
} from "./rate-vault-xlsx.ts";

async function loadWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook;
}

async function workbookBytes(build: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

describe("Rate Vault B-1 Excel export / import", () => {
  it("exports Rate Summary formulas, hidden ids, and the package marker", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    assert.equal(exported.fileName, "Wood-River-B1-Rate-Vault.xlsx");
    assert.equal(rateVaultB1FileName(fixture), exported.fileName);

    const workbook = await loadWorkbook(exported.bytes);
    const names = workbook.worksheets.map((sheet) => sheet.name);
    assert.deepEqual(names, [RATE_VAULT_B1_PACKAGE_SHEET, RATE_VAULT_B1_RATE_SHEET, RATE_VAULT_B1_BURDEN_SHEET]);

    const pack = workbook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.equal(pack?.getCell("A1").value, RATE_VAULT_B1_MARKER);
    assert.equal(pack?.getCell("B2").value, RATE_VAULT_B1_KIND);
    assert.equal(pack?.getCell("B3").value, "wood-river");
    assert.equal(String(pack?.getCell("B7").value), "false");

    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    RATE_VAULT_B1_RATE_HEADERS.forEach((header, index) => {
      assert.equal(rates.getCell(1, index + 1).value, header);
    });
    assert.equal(rates.getColumn(12).hidden, true);
    const firstId = String(rates.getCell("L2").value || "");
    assert.ok(firstId);
    const bill = rates.getCell("I2");
    const formula = bill.formula || (bill.value && typeof bill.value === "object" && "formula" in bill.value ? String((bill.value as { formula: string }).formula) : "");
    assert.equal(formula, "F2+G2+H2");
    const journeymanRow = fixture.rows.findIndex((row) => row.position === "Boilermaker Journeyman") + 2;
    assert.ok(journeymanRow >= 2);
    assert.equal(rates.getCell(`A${journeymanRow}`).value, "Boilermaker Journeyman");

    const burden = workbook.getWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    assert.equal(burden?.getColumn(4).hidden, true);
    const totalRow = (fixture.burden.length || 0) + 2;
    const totalFormula =
      burden?.getCell(`B${totalRow}`).formula ||
      (burden?.getCell(`B${totalRow}`).value &&
      typeof burden.getCell(`B${totalRow}`).value === "object" &&
      "formula" in (burden.getCell(`B${totalRow}`).value as object)
        ? String((burden.getCell(`B${totalRow}`).value as { formula: string }).formula)
        : "");
    assert.match(String(totalFormula), /^SUM\(B2:B/);
  });

  it("round-trips an edited wage into the vault preview bill", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const journeyman = fixture.rows.find((row) => row.position === "Boilermaker Journeyman");
    assert.ok(journeyman);
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    let target = 0;
    rates.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(1).value) === "Boilermaker Journeyman") target = rowNumber;
    });
    assert.ok(target);
    const nextWage = 88.88;
    rates.getCell(`F${target}`).value = nextWage;
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(imported.preview.fixture, false);
    assert.equal(imported.preview.extractedFrom, "vault-xlsx-import");
    assert.equal(imported.preview.writesRateBook, false);
    const row = imported.preview.rows.find((item) => item.position === "Boilermaker Journeyman");
    assert.ok(row);
    assert.equal(row?.wage, nextWage);
    assert.equal(row?.fringe, journeyman?.fringe);
    assert.equal(row?.burden, journeyman?.burden);
    assert.equal(row?.billRate, nextWage + (journeyman?.fringe ?? 0) + (journeyman?.burden ?? 0));
  });

  it("refuses a random workbook as not-vault-b1", async () => {
    const bytes = await workbookBytes((workbook) => {
      const sheet = workbook.addWorksheet("Sheet1");
      sheet.getCell("A1").value = "Hello";
    });
    const imported = await parseRateVaultB1Xlsx({ fileName: "random.xlsx", bytes });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "not-vault-b1");
    assert.equal(imported.error, RATE_VAULT_B1_IMPORT_ERROR);
  });

  it("refuses a Monroe-titled vault book as poison", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const monroePack = workbook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.ok(monroePack);
    monroePack.getCell("B4").value = "Monroe Energy Trainer B-1";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: "Monroe-Energy-B-1.xlsx",
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "poison");
    assert.match(imported.error, /Monroe/);
  });

  it("refuses a forged site that is not P66", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const forged = workbook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.ok(forged);
    forged.getCell("B3").value = "beaumont";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "poison");
    assert.match(imported.error, /not in this vault/i);
  });

  it("refuses a marker book with no Rate Summary", async () => {
    const bytes = await workbookBytes((workbook) => {
      const pack = workbook.addWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
      pack.getCell("A1").value = RATE_VAULT_B1_MARKER;
      pack.getCell("A2").value = "kind";
      pack.getCell("B2").value = RATE_VAULT_B1_KIND;
      pack.getCell("A3").value = "siteId";
      pack.getCell("B3").value = "wood-river";
    });
    const imported = await parseRateVaultB1Xlsx({ fileName: "Wood-River-B1-Rate-Vault.xlsx", bytes });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "invalid");
    assert.match(imported.error, /Rate Summary/);
  });

  it("refuses a NaN wage instead of importing zero", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    rates.getCell("F2").value = "n/a";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "invalid");
    assert.match(imported.error, /not a valid number/);
  });
});
