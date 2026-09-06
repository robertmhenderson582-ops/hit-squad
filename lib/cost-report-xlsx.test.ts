import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import {
  applyTurnipPaste,
  deskBudgetFromPack,
  emptyCostReportBook,
  estimateCurveFromCrew,
  saveCostSnapshot,
} from "./cost-report.ts";
import {
  COST_EXPORT_BRAND,
  COST_EXPORT_CONFIDENTIAL,
  COST_XLSX_APPENDIX_SHEETS,
  COST_XLSX_CLIENT_SHEETS,
  COST_XLSX_SHEETS,
  buildCostReportWorkbook,
  costReportToXlsx,
  costReportXlsxFilename,
  pprSheetRef,
} from "./cost-report-xlsx.ts";
import { STEEL, STEEL_DEEP } from "./xlsx-exceljs.ts";
import { S_CURVE_AMBER, S_CURVE_STEEL } from "./xlsx-s-curve-chart.ts";
import { evaluateWorkbook } from "./xlsx-eval.ts";

const WOOD = { client: "Phillips 66", site: "Wood River — Roxana, IL" };

function fixtureBook() {
  const row = blankCraftRow();
  row.position = "Pipefitter Journeyman";
  row.ranges = [
    {
      ...blankRange(),
      start: "2026-09-01",
      end: "2026-09-02",
      hoursPerShift: 10,
      headcount: 2,
      days: [false, true, true, true, true, true, false],
    },
  ];
  const budget = deskBudgetFromPack({ crew: { direct: [row] }, ...WOOD });
  let book = applyTurnipPaste(emptyCostReportBook(), "15", "Date\tHours\n09/01/2026\t16");
  book = applyTurnipPaste(book, "16", "Date\tAmount\n09/01/2026\t4800");
  book = { ...book, statusDate: "2026-09-01", notes: "Monday field report" };
  book = saveCostSnapshot(book, budget, 1);
  const curve = estimateCurveFromCrew({ direct: [row] }, WOOD.site, WOOD.client);
  return { budget, book, curve, title: "Cat 2 Pit Stop", ...WOOD };
}

function fillArgb(cell: ExcelJS.Cell) {
  return String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "").toUpperCase();
}

function steelFill(cell: ExcelJS.Cell) {
  const argb = fillArgb(cell);
  return argb === STEEL || argb === STEEL.slice(2) || argb === STEEL_DEEP || argb === STEEL_DEEP.slice(2);
}

describe("cost report Excel export", () => {
  it("builds a client PPR package with live budget and visible formulas", () => {
    const input = fixtureBook();
    const sheets = buildCostReportWorkbook({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
      preparedBy: "Mike",
      status: "In progress",
      curve: input.curve.map((point) => ({
        ...point,
        actHours: point.date === "2026-09-01" ? 16 : 0,
        actHeadcount: point.date === "2026-09-01" ? 2 : 0,
        cumEstHours: point.estHours,
        cumActHours: point.date === "2026-09-01" ? 16 : 0,
      })),
    });
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(names, [...COST_XLSX_CLIENT_SHEETS, ...COST_XLSX_APPENDIX_SHEETS]);
    assert.deepEqual(names.slice(0, 4), [
      COST_XLSX_SHEETS.cover,
      COST_XLSX_SHEETS.ppr,
      COST_XLSX_SHEETS.curve,
      COST_XLSX_SHEETS.log,
    ]);
    assert.deepEqual(names.slice(4), [COST_XLSX_SHEETS.export15, COST_XLSX_SHEETS.export16]);
    const cover = sheets[0]!;
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === COST_EXPORT_BRAND));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Cat 2 Pit Stop"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Phillips 66"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && /Wood River/.test(cell.value)));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "In progress"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Mike"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Monday field report"));
    const coverBudget = cover.cells.find((cell) => cell.ref === "E7");
    assert.equal(coverBudget?.type, "formula");
    assert.equal(coverBudget && "value" in coverBudget ? coverBudget.value : "", pprSheetRef("B7"));
    const coverVar = cover.cells.find((cell) => cell.ref === "E9");
    assert.equal(coverVar?.type, "formula");
    assert.equal(coverVar && "value" in coverVar ? coverVar.value : "", "E7-E8");
    const ppr = sheets[1]!;
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === COST_EXPORT_BRAND));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && /live estimate pack/i.test(cell.value)));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && /Prepared by: Mike/.test(cell.value)));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && /Status: In progress/.test(cell.value)));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value.includes(COST_EXPORT_CONFIDENTIAL)));
    const variance = ppr.cells.find((cell) => cell.ref === "D7");
    assert.equal(variance?.type, "formula");
    assert.equal(variance && "value" in variance ? variance.value : "", "B7-C7");
    const remaining = ppr.cells.find((cell) => cell.ref === "E7");
    assert.equal(remaining?.type, "formula");
    assert.equal(remaining && "value" in remaining ? remaining.value : "", "B7-C7");
    const spent = ppr.cells.find((cell) => cell.ref === "F7");
    assert.equal(spent?.type, "formula");
    assert.match(String(spent && "value" in spent ? spent.value : ""), /C7\/B7/);
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Monday field report"));
    const { evalAt } = evaluateWorkbook(sheets);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "B7"), input.budget.total);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "C7"), 4800);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "D7"), input.budget.total - 4800);
    assert.equal(evalAt(COST_XLSX_SHEETS.cover, "E7"), input.budget.total);
    assert.equal(evalAt(COST_XLSX_SHEETS.cover, "E8"), 4800);
    assert.equal(evalAt(COST_XLSX_SHEETS.cover, "E9"), input.budget.total - 4800);
    const log = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.log);
    assert.ok(log?.cells.some((cell) => cell.type === "text" && cell.value === "2026-09-01"));
    assert.ok(log?.cells.some((cell) => cell.type === "text" && cell.value === "Monday field report"));
    const appendix = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.export15);
    assert.ok(appendix?.cells.some((cell) => cell.type === "text" && /Appendix/.test(cell.value)));
  });

  it("writes a real xlsx Mike can open with Hit Squad chrome and does not leak field-trial copy", async () => {
    const input = fixtureBook();
    const bytes = await costReportToXlsx({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
      curve: input.curve.map((point) => ({
        ...point,
        actHours: point.date === "2026-09-01" ? 16 : 0,
        actHeadcount: point.date === "2026-09-01" ? 2 : 0,
        cumEstHours: point.estHours,
        cumActHours: point.date === "2026-09-01" ? 16 : 0,
      })),
      preparedBy: "Robert Henderson",
      status: "Budgetary",
    });
    assert.ok(bytes.byteLength > 2000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    assert.deepEqual(
      wb.worksheets.map((sheet) => sheet.name),
      [...COST_XLSX_CLIENT_SHEETS, ...COST_XLSX_APPENDIX_SHEETS],
    );
    const cover = wb.getWorksheet(COST_XLSX_SHEETS.cover)!;
    const ppr = wb.getWorksheet(COST_XLSX_SHEETS.ppr)!;
    const curve = wb.getWorksheet(COST_XLSX_SHEETS.curve)!;
    assert.equal(cover.getCell("A1").value, COST_EXPORT_BRAND);
    assert.equal(ppr.getCell("A1").value, COST_EXPORT_BRAND);
    assert.ok(steelFill(cover.getCell("A1")));
    assert.ok(steelFill(ppr.getCell("A1")));
    assert.ok(steelFill(curve.getCell("A1")));
    assert.ok(steelFill(ppr.getCell("A6")));
    assert.equal((ppr.getCell("D7").value as { formula?: string } | null)?.formula, "B7-C7");
    assert.match(String(ppr.getCell("A3").value ?? ""), /Prepared by: Robert Henderson/);
    assert.match(String(ppr.getCell("A3").value ?? ""), /Status: Budgetary/);
    assert.match(
      costReportXlsxFilename({ site: input.site, title: input.title, statusDate: "2026-09-01" }),
      /hit-squad-wood-river-cat-2-pit-stop-ppr-2026-09-01\.xlsx$/,
    );
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file("xl/charts/chart1.xml"));
    assert.ok(zip.file("xl/drawings/drawing1.xml"));
    const chartXml = await zip.file("xl/charts/chart1.xml")!.async("string");
    assert.match(chartXml, new RegExp(S_CURVE_STEEL));
    assert.match(chartXml, new RegExp(S_CURVE_AMBER));
    assert.match(chartXml, /Hrs S-curve/);
    assert.match(chartXml, /\$D\$6/);
    assert.match(chartXml, /\$E\$6/);
    const source = readFileSync(fileURLToPath(new URL("./cost-report-xlsx.ts", import.meta.url)), "utf8");
    assert.equal(/field trial|forgebook|not a release/i.test(source), false);
    assert.match(source, /companyLogo/);
    assert.match(source, /buildWorkbook\(sheets, \{ companyLogo/);
    const desk = readFileSync(fileURLToPath(new URL("../components/CostReportDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, /costReportToXlsx/);
    assert.match(desk, /downloadXlsx/);
    assert.match(desk, /company-logo/);
    assert.match(desk, /companyLogo:/);
    assert.match(desk, /status: pack\.status/);
  });
});
