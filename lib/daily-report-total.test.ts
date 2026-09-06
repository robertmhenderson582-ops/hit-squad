import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DAILY_REPORT_DESK_FIELDS,
  DAILY_REPORT_GRAND_TOTAL,
  DAILY_REPORT_PHASES,
  DAILY_REPORT_TOTAL_BASELINE,
  DAILY_REPORT_TOTAL_FILE,
  DAILY_REPORT_TOTAL_KPI_COLUMNS,
  DAILY_REPORT_TOTAL_SHEETS,
  DAILY_REPORT_UPLOAD_NOTE,
  dailyReportPhaseCode,
  dailyReportPhaseId,
} from "./daily-report-total.ts";

describe("01 DailyReport_TOTAL schema", () => {
  it("names the three sheets and Summary Phase KPI columns", () => {
    assert.equal(DAILY_REPORT_TOTAL_FILE, "01 DailyReport_TOTAL");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.summary, "Summary");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.companyExpense, "Company Expense");
    assert.equal(DAILY_REPORT_TOTAL_SHEETS.equip, "Equip");
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Earned Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Planned Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Target Mhr"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Plan %"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Earned % / Actual %"));
    assert.ok(DAILY_REPORT_TOTAL_KPI_COLUMNS.includes("Inc Earned"));
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
