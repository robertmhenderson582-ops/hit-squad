import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import {
  applyTurnipPaste,
  deskBudgetFromPack,
  emptyCostReportBook,
  estimateCurveFromCrew,
  saveCostSnapshot,
} from "./cost-report.ts";
import {
  COST_XLSX_SHEETS,
  buildCostReportWorkbook,
  costReportToXlsx,
  costReportXlsxFilename,
} from "./cost-report-xlsx.ts";
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
      curve: input.curve.map((point) => ({
        ...point,
        actHours: point.date === "2026-09-01" ? 16 : 0,
        actHeadcount: point.date === "2026-09-01" ? 2 : 0,
        cumEstHours: point.estHours,
        cumActHours: point.date === "2026-09-01" ? 16 : 0,
      })),
    });
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(names, [
      COST_XLSX_SHEETS.ppr,
      COST_XLSX_SHEETS.curve,
      COST_XLSX_SHEETS.export15,
      COST_XLSX_SHEETS.export16,
      COST_XLSX_SHEETS.log,
    ]);
    const ppr = sheets[0]!;
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "HIT SQUAD / PROJECT CONTROLS"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && /live estimate pack/i.test(cell.value)));
    const variance = ppr.cells.find((cell) => cell.ref === "D7");
    assert.equal(variance?.type, "formula");
    assert.equal(variance && "value" in variance ? variance.value : "", "B7-C7");
    const spent = ppr.cells.find((cell) => cell.ref === "F7");
    assert.equal(spent?.type, "formula");
    assert.match(String(spent && "value" in spent ? spent.value : ""), /C7\/B7/);
    const { evalAt } = evaluateWorkbook(sheets);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "B7"), input.budget.total);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "C7"), 4800);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, "D7"), input.budget.total - 4800);
    const log = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.log);
    assert.ok(log?.cells.some((cell) => cell.type === "text" && cell.value === "2026-09-01"));
    assert.ok(log?.cells.some((cell) => cell.type === "text" && cell.value === "Monday field report"));
  });

  it("writes a real xlsx Mike can open and does not leak field-trial chrome", async () => {
    const input = fixtureBook();
    const bytes = await costReportToXlsx({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
    });
    assert.ok(bytes.byteLength > 2000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    assert.ok(wb.getWorksheet(COST_XLSX_SHEETS.ppr));
    assert.ok(wb.getWorksheet(COST_XLSX_SHEETS.curve));
    const ppr = wb.getWorksheet(COST_XLSX_SHEETS.ppr)!;
    assert.equal(ppr.getCell("A1").value, "HIT SQUAD / PROJECT CONTROLS");
    assert.equal((ppr.getCell("D7").value as { formula?: string } | null)?.formula, "B7-C7");
    assert.match(costReportXlsxFilename({ site: input.site, title: input.title, statusDate: "2026-09-01" }), /cost-ppr-2026-09-01\.xlsx$/);
    const source = readFileSync(fileURLToPath(new URL("./cost-report-xlsx.ts", import.meta.url)), "utf8");
    assert.equal(/field trial|forgebook|not a release/i.test(source), false);
  });
});
