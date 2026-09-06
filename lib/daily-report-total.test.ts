import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  DAILY_REPORT_DESK_FIELDS,
  DAILY_REPORT_GRAND_TOTAL,
  DAILY_REPORT_PARSE_ERROR,
  DAILY_REPORT_PHASES,
  DAILY_REPORT_TOTAL_BASELINE,
  DAILY_REPORT_TOTAL_FILE,
  DAILY_REPORT_TOTAL_KPI_COLUMNS,
  DAILY_REPORT_TOTAL_SHEETS,
  DAILY_REPORT_UPLOAD_NOTE,
  DailyReportParseError,
  dailyReportPhaseCode,
  dailyReportPhaseId,
  dailyReportPreviewLines,
  dailyReportToKpiPatch,
  normalizeDailyReportPct,
  parseDailyReportSummaryGrid,
  parseDailyReportTotalXlsx,
} from "./daily-report-total.ts";

function phaseGrid(actualPct: unknown = 0.45, planPct: unknown = 0.6): unknown[][] {
  const grid: unknown[][] = [];
  grid[33] = [];
  grid[33][2] = "Phase";
  grid[33][3] = "Target Mhr";
  grid[33][4] = "SCR Mhr";
  grid[33][5] = "Current Mhr";
  grid[33][6] = "Remain Mhr";
  grid[33][7] = "Planned Mhr";
  grid[33][8] = "Earned Mhr";
  grid[33][9] = "Plan %";
  grid[33][10] = "Actual %";
  grid[33][11] = "SCR Delta";
  grid[33][12] = "Inc Plan";
  grid[33][13] = "Inc Actual";
  grid[33][14] = "Inc Delta";
  const rows: Array<[string, number, number, number, number]> = [
    ["PRE", 40, 20, 18, 6],
    ["SD", 20, 16, 12, 4],
    ["TA", 80, 70, 60, 20],
    ["SU", 40, 40, 24, 8],
    ["POST", 20, 22, 12, 4],
  ];
  rows.forEach((row, index) => {
    const r = 34 + index;
    grid[r] = [];
    grid[r][2] = row[0];
    grid[r][3] = row[1];
    grid[r][5] = row[1];
    grid[r][7] = row[2];
    grid[r][8] = row[3];
    grid[r][9] = 0.3;
    grid[r][10] = 0.2;
    grid[r][13] = row[4];
  });
  grid[39] = [];
  grid[39][2] = "Grand Total";
  grid[39][3] = 200;
  grid[39][5] = 168;
  grid[39][7] = 168;
  grid[39][8] = 126;
  grid[39][9] = planPct;
  grid[39][10] = actualPct;
  grid[39][13] = 42;
  return grid;
}

describe("01 DailyReport_TOTAL schema", () => {
  it("names the sheets and Summary Phase KPI columns", () => {
    assert.equal(DAILY_REPORT_TOTAL_FILE, "01 DailyReport_TOTAL");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.summary, "Summary");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.companyExpense, "Company Expense");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.equip, "Equip");
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Earned Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Planned Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Target Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Plan %"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Actual %"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Inc Actual"));
    assert.equal(DAILY_REPORT_GRAND_TOTAL, "Grand Total");
    assert.deepEqual(
      DAILY_REPORT_DESK_FIELDS.map((field) => field.id),
      ["targetHours", "plannedHours", "earnedHours", "planPct", "earnedPct"],
    );
    assert.match(DAILY_REPORT_UPLOAD_NOTE, /Grand Total/);
    assert.match(DAILY_REPORT_UPLOAD_NOTE, /Slicer stays parked/);
  });

  it("maps PRE / SD / TA / SU / POST onto Hit Squad phases", () => {
    assert.equal(dailyReportPhaseId("PRE"), "pre");
    assert.equal(dailyReportPhaseId("SD"), "oil-out");
    assert.equal(dailyReportPhaseId("TA"), "mech");
    assert.equal(dailyReportPhaseId("SU"), "oil-in");
    assert.equal(dailyReportPhaseId("POST"), "post");
    assert.equal(dailyReportPhaseCode("pre"), "PRE");
    assert.equal(dailyReportPhaseCode("mech"), "TA");
    assert.deepEqual(
      DAILY_REPORT_PHASES.map((row) => row.code),
      ["PRE", "SD", "TA", "SU", "POST"],
    );
  });

  it("does not keep the P66 DailyReport_TOTAL book in the repo", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    assert.equal(existsSync(`${here}../look-samples/${DAILY_REPORT_TOTAL_BASELINE}`), false);
    assert.equal(existsSync(`${here}../look-samples/01 DailyReport_TOTAL.xlsx`), false);
    assert.match(DAILY_REPORT_TOTAL_BASELINE, /DailyReport_TOTAL/);
  });
});

describe("01 DailyReport_TOTAL Summary parser", () => {
  it("fills job KPIs from Phase Grand Total", () => {
    const parsed = parseDailyReportSummaryGrid(phaseGrid());
    assert.equal(parsed.grandTotal.earnedMhr, 126);
    assert.equal(parsed.grandTotal.plannedMhr, 168);
    assert.equal(parsed.grandTotal.targetMhr, 200);
    assert.equal(parsed.grandTotal.incActual, 42);
    assert.equal(parsed.phases.map((row) => row.code).join("/"), "PRE/SD/TA/SU/POST");
    const patch = dailyReportToKpiPatch(parsed);
    assert.equal(patch.earnedHours, 126);
    assert.equal(patch.plannedHours, 168);
    assert.equal(patch.targetHours, 200);
    assert.equal(patch.incEarned, 42);
    assert.equal(patch.earnedPct, 0.45);
    assert.equal(patch.planPct, 0.6);
    assert.match(dailyReportPreviewLines(parsed).join("\n"), /Earned Mhr 126/);
  });

  it("normalizes percent 0–1 vs 100", () => {
    assert.equal(normalizeDailyReportPct(0.45), 0.45);
    assert.equal(normalizeDailyReportPct(1), 1);
    assert.equal(normalizeDailyReportPct(100), 1);
    assert.equal(normalizeDailyReportPct("45%"), 0.45);
    const asFraction = parseDailyReportSummaryGrid(phaseGrid(1, 1));
    assert.equal(asFraction.grandTotal.actualPct, 1);
    assert.equal(asFraction.grandTotal.planPct, 1);
    const asHundred = parseDailyReportSummaryGrid(phaseGrid(100, 60));
    assert.equal(asHundred.grandTotal.actualPct, 1);
    assert.equal(asHundred.grandTotal.planPct, 0.6);
  });

  it("rejects a file without a recognizable Phase block", () => {
    const empty: unknown[][] = [];
    empty[2] = [];
    empty[2][1] = "Hello";
    empty[2][2] = "World";
    assert.throws(() => parseDailyReportSummaryGrid(empty), DailyReportParseError);
    try {
      parseDailyReportSummaryGrid(empty);
    } catch (error) {
      assert.equal((error as Error).message, DAILY_REPORT_PARSE_ERROR);
    }
  });

  it("reads a tiny synthetic Summary xlsx", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Summary");
    wb.addWorksheet("Company Expense");
    const grid = phaseGrid(45, 60);
    grid.forEach((line, row) => {
      (line ?? []).forEach((value, col) => {
        if (value != null) ws.getCell(row, col).value = value as string | number;
      });
    });
    const bytes = await wb.xlsx.writeBuffer();
    const parsed = await parseDailyReportTotalXlsx(new Uint8Array(bytes));
    assert.equal(parsed.sheet, "Summary");
    assert.equal(parsed.grandTotal.earnedMhr, 126);
    assert.equal(parsed.grandTotal.actualPct, 0.45);
    assert.equal(parsed.grandTotal.planPct, 0.6);
  });
});
