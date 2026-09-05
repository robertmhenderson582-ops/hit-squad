import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXCEL_UNIT_FORMATS,
  formatForHeader,
  HEADER_META_LINE_HEIGHT,
  HEADER_META_WRAP_HEIGHT,
  headerMetaHeight,
  LABOR_COL_WIDTHS,
  LABOR_DATE_NUM_FMT,
  LABOR_DAY_WASH,
  STEEL,
  LABOR_INSTRUMENT_OUTLINE_LEVEL,
  LABOR_SHEET_PROTECT_OPTIONS,
  SHEET_PROTECT_OPTIONS,
  summaryLineFormat,
} from "./xlsx-exceljs.ts";

describe("xlsx-exceljs unit formats", () => {
  it("maps headers to unmistakable dollar, hour, count, and day formats", () => {
    assert.equal(formatForHeader("ST $"), "$#,##0.00");
    assert.equal(formatForHeader("OT $"), "$#,##0.00");
    assert.equal(formatForHeader("Total $"), "$#,##0.00");
    assert.equal(formatForHeader("Amount $"), "$#,##0.00");
    assert.equal(formatForHeader("ST Rate"), "$#,##0.00");
    assert.equal(formatForHeader("PD Rate"), "$#,##0.00");
    assert.equal(formatForHeader("COMP BW $"), "$#,##0.00");
    assert.equal(formatForHeader("ST Bill $"), "$#,##0.00");
    assert.equal(formatForHeader("Rate $"), "$#,##0.00");
    assert.equal(formatForHeader("Daily $"), "$#,##0.00");
    assert.equal(formatForHeader("Weekly $"), "$#,##0.00");
    assert.equal(formatForHeader("Monthly $"), "$#,##0.00");
    assert.equal(formatForHeader("Freight $"), "$#,##0.00");
    assert.equal(formatForHeader("Cost $"), "$#,##0.00");
    assert.equal(formatForHeader("Each $"), "$#,##0.00");
    assert.equal(formatForHeader("Markup $"), "$#,##0.00");
    assert.equal(formatForHeader("$ / mile"), "$#,##0.00");
    assert.equal(formatForHeader("Total Billable"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("Billable"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("ST Hrs"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("Hours"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("Man-hours (MH)"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("MH"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("PD Days"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("PD"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("PD #"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(formatForHeader("PD count"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(EXCEL_UNIT_FORMATS.hours, "#,##0");
    assert.equal(LABOR_DAY_WASH, STEEL);
    assert.equal(LABOR_DAY_WASH.includes("F2F6"), false);
    assert.equal(LABOR_DATE_NUM_FMT, "d-mmm");
    assert.equal(EXCEL_UNIT_FORMATS.hours.includes("."), false);
    assert.equal(EXCEL_UNIT_FORMATS.hours.includes(".##"), false);
    assert.equal(formatForHeader("Headcount"), "#,##0");
    assert.equal(formatForHeader("Qty"), "#,##0");
    assert.equal(formatForHeader("Periods"), "#,##0");
    assert.equal(formatForHeader("Miles"), "#,##0");
    assert.equal(formatForHeader("Markup %"), "0.0%");
    assert.equal(formatForHeader("Position"), undefined);
    assert.equal(formatForHeader("ST Hrs") === formatForHeader("ST $"), false);
    assert.equal(LABOR_INSTRUMENT_OUTLINE_LEVEL, 1);
    assert.equal(LABOR_COL_WIDTHS.A, 11);
    assert.equal(LABOR_COL_WIDTHS.C, 16);
    assert.equal(LABOR_COL_WIDTHS.J, undefined);
    assert.equal(SHEET_PROTECT_OPTIONS.formatColumns, false);
    assert.equal(LABOR_SHEET_PROTECT_OPTIONS.formatColumns, true);
  });

  it("formats summary rollup lines by the unit in column A", () => {
    assert.equal(summaryLineFormat("Labor $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Per diem $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Staff travel $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Travel $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Hours"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(summaryLineFormat("Man-hours"), EXCEL_UNIT_FORMATS.hours);
    assert.equal(summaryLineFormat("Labor contingency"), "$#,##0.00");
    assert.equal(summaryLineFormat("6.5% markup"), "$#,##0.00");
    assert.equal(summaryLineFormat("ESTIMATE TOTAL $"), "$#,##0.00");
  });

  it("grows wrapped header subtitle rows only when the merged band is too narrow", () => {
    const job = "2027 Aromatics Turnaround  ·  Phillips 66  ·  Wood River — Roxana, IL  ·  East Coast (PCA0001103)";
    const produced = "Produced by Hit Squad Project Controls  ·  Confidential estimate package  ·  Produced Sep 4, 2026";
    const summaryWidth = 28 + 14 + 12;
    const laborWidth =
      LABOR_COL_WIDTHS.A +
      LABOR_COL_WIDTHS.B +
      LABOR_COL_WIDTHS.C +
      LABOR_COL_WIDTHS.D +
      LABOR_COL_WIDTHS.E +
      LABOR_COL_WIDTHS.F +
      LABOR_COL_WIDTHS.G +
      LABOR_COL_WIDTHS.H +
      LABOR_COL_WIDTHS.I;
    assert.equal(headerMetaHeight("HIT SQUAD", summaryWidth), HEADER_META_LINE_HEIGHT);
    assert.equal(headerMetaHeight(job, summaryWidth), HEADER_META_WRAP_HEIGHT);
    assert.equal(headerMetaHeight(produced, summaryWidth), HEADER_META_WRAP_HEIGHT);
    assert.equal(headerMetaHeight(job, laborWidth), HEADER_META_LINE_HEIGHT);
    assert.equal(headerMetaHeight(produced, laborWidth), HEADER_META_LINE_HEIGHT);
  });
});
