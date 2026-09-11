import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  RATE_VAULT_B1_BURDEN_SHEET,
  RATE_VAULT_B1_EXPORT_MAX_BYTES,
  RATE_VAULT_B1_IMPORT_ERROR,
  RATE_VAULT_B1_KIND,
  RATE_VAULT_B1_MARKER,
  RATE_VAULT_B1_PACKAGE_SHEET,
  RATE_VAULT_B1_RATE_SHEET,
  RATE_VAULT_B1_REQUIRED_SHEETS,
} from "./rate-vault.ts";
import { hallBurdenSubtotal, hallFringeSubtotal } from "./rate-vault-b1.ts";
import { loadWoodRiverB1PreviewFixture, loadWoodRiverTmB1PreviewFixture, mergePreviewFace, rateVaultImportMergeFace } from "./rate-vault-preview.ts";
import {
  RATE_VAULT_B1_RATE_HEADERS,
  isRateVaultBurdenRippleFormula,
  isRateVaultFringeRippleFormula,
  parseRateVaultB1Xlsx,
  rateVaultB1FileName,
  rateVaultPreviewToXlsx,
} from "./rate-vault-xlsx.ts";

async function loadWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
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
    assert.ok(names.includes(RATE_VAULT_B1_PACKAGE_SHEET));
    assert.ok(names.includes(RATE_VAULT_B1_RATE_SHEET));
    assert.ok(names.includes(RATE_VAULT_B1_BURDEN_SHEET));
    assert.ok(names.includes("COMP Check"));
    assert.ok(names.includes("Fringes"));
    assert.ok(names.includes("CBA PLA"));
    assert.ok(names.includes("State law"));

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
    assert.equal(rates.getColumn(15).hidden, true);
    const firstId = String(rates.getCell("O2").value || "");
    assert.ok(firstId);
    const bill = rates.getCell("I2");
    const formula = bill.formula || (bill.value && typeof bill.value === "object" && "formula" in bill.value ? String((bill.value as { formula: string }).formula) : "");
    assert.equal(formula, "F2+G2+H2");
    const fringeFormula = rates.getCell("G2").formula || "";
    const burdenFormula = rates.getCell("H2").formula || "";
    assert.equal(isRateVaultFringeRippleFormula(fringeFormula, 2), true);
    assert.equal(isRateVaultBurdenRippleFormula(burdenFormula, 2), true);
    assert.deepEqual(names, [...RATE_VAULT_B1_REQUIRED_SHEETS]);
    assert.ok(exported.bytes.byteLength < RATE_VAULT_B1_EXPORT_MAX_BYTES);
    assert.match(String(pack?.getCell("A18").value || ""), /Lean Rate Vault B-1 face/);
    const journeymanRow = fixture.rows.findIndex((row) => row.position === "Boilermaker Journeyman") + 2;
    assert.ok(journeymanRow >= 2);
    assert.equal(rates.getCell(`A${journeymanRow}`).value, "Boilermaker Journeyman");

    const burden = workbook.getWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    assert.equal(burden?.getColumn(16).hidden, true);
    assert.equal(burden?.getColumn(17).hidden, true);
    assert.equal(burden?.getCell("A1").value, "Family");
    assert.equal(burden?.getCell("B1").value, "Item");
    assert.equal(burden?.getCell("F1").value, "Rate $/%/Varies");
    assert.equal(burden?.getCell("H1").value, "ST Calc");
    assert.equal(burden?.getCell("I1").value, "OT Calc");
    assert.equal(String(burden?.getCell("F2").value || ""), "%");
    assert.equal(String(burden?.getCell("G2").value || ""), "Tax BW (P)");
    const totalRow = (fixture.burden.length || 0) + 2;
    const totalFormula =
      burden?.getCell(`C${totalRow}`).formula ||
      (burden?.getCell(`C${totalRow}`).value &&
      typeof burden.getCell(`C${totalRow}`).value === "object" &&
      "formula" in (burden.getCell(`C${totalRow}`).value as object)
        ? String((burden.getCell(`C${totalRow}`).value as { formula: string }).formula)
        : "");
    assert.match(String(totalFormula), /SUMIF\(A2:A/);
    assert.equal(String(burden?.getCell(`A${totalRow}`).value || ""), "total");
    assert.equal(String(burden?.getCell(`B${totalRow}`).value || ""), "Pay Tax Subtotal");
    const fringes = workbook.getWorksheet("Fringes");
    assert.ok(fringes);
    assert.equal(fringes.getCell("D1").value, "Fringe");
    assert.equal(fringes.getCell("G1").value, "Rate $/%/Varies");
    assert.equal(fringes.getCell("I1").value, "ST Calc");
    assert.equal(fringes.getColumn(17).hidden, true);
    assert.equal(fringes.getColumn(18).hidden, true);
    const comp = workbook.getWorksheet("COMP Check");
    assert.ok(comp);
    assert.match(String(comp.getCell("A1").value || ""), /COMP check/i);
    assert.ok(String(comp.getCell("B3").value && typeof comp.getCell("B3").value === "object" ? (comp.getCell("B3").value as { formula?: string }).formula : comp.getCell("B3").formula || "").includes("COUNTA"));
  });

  it("keeps Excel pay-tax SUMIF equal to the desk stack after recalc", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const burden = workbook.getWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    assert.ok(burden);
    let excelPayTax = 0;
    burden.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (String(row.getCell(1).value || "") !== "pay-tax") return;
      const raw = row.getCell(3).value;
      const pct =
        typeof raw === "number"
          ? raw
          : raw && typeof raw === "object" && "result" in raw && typeof (raw as { result: unknown }).result === "number"
            ? (raw as { result: number }).result
            : 0;
      excelPayTax += pct;
    });
    const deskPayTax = fixture.burden.filter((line) => line.family === "pay-tax").reduce((sum, line) => sum + line.ratePct, 0);
    assert.equal(Math.round(excelPayTax * 100) / 100, Math.round(deskPayTax * 100) / 100);
    assert.equal(Math.round(excelPayTax * 100) / 100, 16.8);
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
    const expectedFringe = hallFringeSubtotal(imported.preview.fringes, journeyman?.sheet || "", nextWage);
    const expectedBurden = hallBurdenSubtotal(imported.preview.burden, journeyman?.sheet || "", nextWage);
    assert.equal(row?.fringe, expectedFringe);
    assert.equal(row?.burden, expectedBurden);
    assert.equal(row?.billRate, nextWage + expectedFringe + expectedBurden);
  });

  it("ripples offline fringe, tax, and O/H edits onto the live Rate Vault package", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const journeyman = fixture.rows.find((row) => row.position === "Boilermaker Journeyman");
    assert.ok(journeyman);
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const fringes = workbook.getWorksheet("Fringes");
    const burden = workbook.getWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    assert.ok(fringes && burden);
    fringes.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(1).value) === journeyman?.sheet && String(row.getCell(4).value) === "H&W") {
        row.getCell(5).value = 8.07;
      }
    });
    burden.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(2).value) === "Pay Tax SUI") row.getCell(3).value = 9.55;
      if (rowNumber > 1 && String(row.getCell(2).value) === "O/H" && String(row.getCell(5).value) === journeyman?.sheet) {
        row.getCell(4).value = 1.25;
      }
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(imported.preview.writesRateBook, false);
    assert.equal(imported.preview.extractedFrom, "vault-xlsx-import");
    assert.equal(imported.preview.fringes.some((line) => line.sheet === journeyman?.sheet && line.label === "H&W" && line.amountHr === 8.07), true);
    assert.equal(imported.preview.burden.some((line) => line.label === "Pay Tax SUI" && line.ratePct === 9.55), true);
    assert.equal(
      imported.preview.craftSheets.some((sheet) => sheet.sheet === journeyman?.sheet && sheet.fringes.some((line) => line.label === "H&W" && line.amountHr === 8.07)),
      true,
    );
    const row = imported.preview.rows.find((item) => item.position === "Boilermaker Journeyman");
    const expectedFringe = hallFringeSubtotal(imported.preview.fringes, journeyman?.sheet || "", journeyman?.wage ?? 0);
    const expectedBurden = hallBurdenSubtotal(imported.preview.burden, journeyman?.sheet || "", journeyman?.wage ?? 0);
    assert.equal(row?.fringe, expectedFringe);
    assert.equal(row?.burden, expectedBurden);
    assert.equal(row?.billRate, Math.round(((journeyman?.wage ?? 0) + expectedFringe + expectedBurden) * 100) / 100);
    assert.ok((row?.fringe ?? 0) > (journeyman?.fringe ?? 0));
    assert.ok((row?.burden ?? 0) > (journeyman?.burden ?? 0));
  });

  it("re-import of a both-faces book updates stored non-OCIP wages and hall ripple", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const journeyman = fixture.rows.find((row) => row.position === "Boilermaker Journeyman");
    assert.ok(journeyman);
    assert.equal(journeyman?.ocip, false);
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    const fringes = workbook.getWorksheet("Fringes");
    assert.ok(rates && fringes);
    rates.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(1).value) === "Boilermaker Journeyman") row.getCell(6).value = 88.88;
    });
    fringes.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(1).value) === journeyman?.sheet && String(row.getCell(4).value) === "H&W") {
        row.getCell(5).value = 8.07;
      }
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(rateVaultImportMergeFace(imported.preview), "both");
    const dropped = mergePreviewFace(fixture, imported.preview, "ocip");
    assert.equal(dropped.rows.find((row) => row.position === "Boilermaker Journeyman")?.wage, journeyman?.wage);
    const merged = mergePreviewFace(fixture, imported.preview, rateVaultImportMergeFace(imported.preview));
    const row = merged.rows.find((item) => item.position === "Boilermaker Journeyman");
    assert.equal(row?.wage, 88.88);
    const expectedFringe = hallFringeSubtotal(merged.fringes, journeyman?.sheet || "", 88.88);
    assert.equal(row?.fringe, expectedFringe);
    assert.ok((row?.fringe ?? 0) > (journeyman?.fringe ?? 0));
    assert.equal(merged.craftSheets.some((sheet) => sheet.fringes.some((line) => line.label === "H&W" && line.amountHr === 8.07)), true);
  });

  it("keeps a typed Fringe override on one row when other rows still ripple", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const journeyman = fixture.rows.find((row) => row.position === "Boilermaker Journeyman");
    const gf = fixture.rows.find((row) => row.position === "Boilermaker General Foreman");
    assert.ok(journeyman && gf);
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    rates.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(1).value) === "Boilermaker Journeyman") row.getCell(7).value = 12.34;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(imported.preview.rows.find((row) => row.position === "Boilermaker Journeyman")?.fringe, 12.34);
    assert.equal(
      imported.preview.rows.find((row) => row.position === "Boilermaker General Foreman")?.fringe,
      hallFringeSubtotal(imported.preview.fringes, gf?.sheet || "", gf?.wage ?? 0),
    );
  });

  it("refuses broken Fringe / Burden ripple guts", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    rates.getCell("G2").value = { formula: "A1*99", result: 1 };
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "invalid");
    assert.match(imported.error, /formula guts/i);
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

  it("refuses a renamed Rate Summary when requiredSheets is present", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    rates.name = "Rates Renamed";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "invalid");
    assert.match(imported.error, /renamed or removed/);
  });

  it("refuses broken Bill ST formula guts", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    rates.getCell("I2").value = { formula: "A1*99", result: 1 };
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, false);
    if (imported.ok) return;
    assert.equal(imported.code, "invalid");
    assert.match(imported.error, /formula guts/i);
  });

  it("round-trips B-1 pay tax, hall fringes, and rebuilt craft sheets", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: exported.bytes,
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.equal(
      imported.preview.burden.some((line) => line.label === "Pay Tax SUI" && line.ratePct === 8.55),
      true,
    );
    assert.equal(
      imported.preview.fringes.some((line) => line.label === "H&W" && line.amountHr === 7.07),
      true,
    );
    assert.equal(
      imported.preview.craftSheets.some(
        (sheet) => /BOILERMAKER/i.test(sheet.sheet) && sheet.fringes.some((line) => line.label === "H&W"),
      ),
      true,
    );
    assert.equal(
      imported.preview.burden.some((line) => /suta|illinois composite|overhead & fee/i.test(line.label)),
      false,
    );
  });

  it("still reads the prior Item / Rate % / Note burden layout", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const prior = workbook.getWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    assert.ok(prior);
    workbook.removeWorksheet(prior.id);
    const burden = workbook.addWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
    burden.getCell("A1").value = "Item";
    burden.getCell("B1").value = "Rate %";
    burden.getCell("C1").value = "Note";
    burden.getCell("D1").value = "_id";
    burden.getCell("A2").value = "Pay Tax SUI";
    burden.getCell("B2").value = 8.55;
    burden.getCell("C2").value = "legacy column layout";
    burden.getCell("D2").value = "legacy-sui";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    const sui = imported.preview.burden.find((line) => line.label === "Pay Tax SUI");
    assert.equal(sui?.ratePct, 8.55);
    assert.equal(sui?.family, "pay-tax");
    assert.equal(sui?.id, "legacy-sui");
  });

  it("exports an OCIP-only face and keeps union / merit lanes on the rate sheet", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture, { ocipFace: "ocip" });
    const workbook = await loadWorkbook(exported.bytes);
    const pack = workbook.getWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
    assert.equal(String(pack?.getCell("B14").value || ""), "ocip");
    const rates = workbook.getWorksheet(RATE_VAULT_B1_RATE_SHEET);
    assert.ok(rates);
    const lanes = new Set<string>();
    const faces = new Set<string>();
    rates.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const position = String(row.getCell(1).value || "");
      if (!position) return;
      lanes.add(String(row.getCell(12).value || ""));
      faces.add(String(row.getCell(13).value || ""));
    });
    assert.equal(faces.has("non-OCIP"), false);
    assert.equal(faces.has("OCIP"), true);
    assert.equal(lanes.has("union") || lanes.has("merit"), true);
  });

  it("round-trips Exhibit B-1 calc / ride / Mult strings, including unknown book options", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const hw = fixture.fringes.find((line) => line.label === "H&W" && line.sheet.includes("BOILERMAKER"));
    assert.ok(hw);
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const fringes = workbook.getWorksheet("Fringes");
    assert.ok(fringes);
    let target = 0;
    fringes.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(4).value) === "H&W" && String(row.getCell(1).value || "").includes("BOILERMAKER")) {
        target = rowNumber;
      }
    });
    assert.ok(target);
    assert.equal(String(fringes.getCell(target, 7).value || ""), "$");
    assert.equal(String(fringes.getCell(target, 9).value || ""), "ST");
    assert.equal(String(fringes.getCell(target, 10).value || ""), "OT");
    fringes.getCell(target, 10).value = "Book Custom Mode";
    fringes.getCell(target, 12).value = 1.25;
    fringes.getCell(target, 14).value = "Y";
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    const line = imported.preview.fringes.find((item) => item.id === hw.id);
    assert.equal(line?.calcOt, "Book Custom Mode");
    assert.equal(line?.mult, 1.25);
    assert.equal(line?.rideOt, true);
    const gf = imported.preview.rows.find((row) => row.position === "Boilermaker General Foreman");
    assert.ok(gf?.billOt != null);
    assert.notEqual(gf?.billOt, 140.21);
  });

  it("infers Calc from hidden _ridesOt when ST/OT/DT Calc cells are blank", async () => {
    const fixture = loadWoodRiverB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    const workbook = await loadWorkbook(exported.bytes);
    const fringes = workbook.getWorksheet("Fringes");
    assert.ok(fringes);
    fringes.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(9).value = null;
      row.getCell(10).value = null;
      row.getCell(11).value = null;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const imported = await parseRateVaultB1Xlsx({
      fileName: exported.fileName,
      bytes: new Uint8Array(buffer),
    });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    const hw = imported.preview.fringes.find((line) => line.label === "H&W" && line.sheet.includes("BOILERMAKER"));
    const labor = imported.preview.fringes.find((line) => line.label === "Health & Welfare" && /LABORER/i.test(line.sheet));
    assert.equal(hw?.calcOt, "OT");
    assert.equal(hw?.calcDt, "DT");
    assert.equal(hw?.rideOt, true);
    assert.equal(labor?.calcOt, "ST");
    assert.equal(labor?.rideOt, true);
  });

  it("keeps a T&M export under the lean-face byte cap", async () => {
    const fixture = loadWoodRiverTmB1PreviewFixture();
    const exported = await rateVaultPreviewToXlsx(fixture);
    assert.ok(exported.bytes.byteLength < RATE_VAULT_B1_EXPORT_MAX_BYTES);
    assert.match(exported.fileName, /TM/);
  });
});
