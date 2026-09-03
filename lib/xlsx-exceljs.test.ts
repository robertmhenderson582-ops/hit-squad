import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatForHeader } from "./xlsx-exceljs.ts";

describe("xlsx-exceljs unit formats", () => {
  it("maps headers to unmistakable dollar, hour, count, and day formats", () => {
    assert.equal(formatForHeader("ST $"), "$#,##0.00");
    assert.equal(formatForHeader("OT $"), "$#,##0.00");
    assert.equal(formatForHeader("Total"), "$#,##0.00");
    assert.equal(formatForHeader("Amount"), "$#,##0.00");
    assert.equal(formatForHeader("ST Rate"), "$#,##0.00");
    assert.equal(formatForHeader("$ / mile"), "$#,##0.00");
    assert.equal(formatForHeader("ST Hrs"), "#,##0.0");
    assert.equal(formatForHeader("Hours"), "#,##0.0");
    assert.equal(formatForHeader("PD Days"), "#,##0.0");
    assert.equal(formatForHeader("Headcount"), "#,##0");
    assert.equal(formatForHeader("Qty"), "#,##0");
    assert.equal(formatForHeader("Markup %"), "0.0%");
    assert.equal(formatForHeader("Position"), undefined);
  });
});
