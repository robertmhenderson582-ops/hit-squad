import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatForHeader, summaryLineFormat } from "./xlsx-exceljs.ts";

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
    assert.equal(formatForHeader("Cost $"), "$#,##0.00");
    assert.equal(formatForHeader("Each $"), "$#,##0.00");
    assert.equal(formatForHeader("Markup $"), "$#,##0.00");
    assert.equal(formatForHeader("$ / mile"), "$#,##0.00");
    assert.equal(formatForHeader("ST Hrs"), "#,##0.0");
    assert.equal(formatForHeader("Hours"), "#,##0.0");
    assert.equal(formatForHeader("Man-hours (MH)"), "#,##0.0");
    assert.equal(formatForHeader("MH"), "#,##0.0");
    assert.equal(formatForHeader("PD Days"), "#,##0.0");
    assert.equal(formatForHeader("Headcount"), "#,##0");
    assert.equal(formatForHeader("Qty"), "#,##0");
    assert.equal(formatForHeader("Periods"), "#,##0");
    assert.equal(formatForHeader("Miles"), "#,##0");
    assert.equal(formatForHeader("Markup %"), "0.0%");
    assert.equal(formatForHeader("Position"), undefined);
    assert.equal(formatForHeader("ST Hrs") === formatForHeader("ST $"), false);
  });

  it("formats summary rollup lines by the unit in column A", () => {
    assert.equal(summaryLineFormat("Labor $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Per diem $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Staff travel $"), "$#,##0.00");
    assert.equal(summaryLineFormat("Hours"), "#,##0.0");
    assert.equal(summaryLineFormat("Man-hours"), "#,##0.0");
    assert.equal(summaryLineFormat("Labor contingency"), "$#,##0.00");
    assert.equal(summaryLineFormat("6.5% markup"), "$#,##0.00");
    assert.equal(summaryLineFormat("ESTIMATE TOTAL $"), "$#,##0.00");
  });
});
