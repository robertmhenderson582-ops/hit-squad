import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  REQUIRED_XLSX_PARTS,
  buildSheetXml,
  buildWorkbook,
  dosDateTime,
  excelDateSerial,
  excelSafeSheetName,
  xmlEscape,
} from "./xlsx-minimal.ts";

function writeAndListZip(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-test-"));
  const file = join(dir, "book.xlsx");
  writeFileSync(file, bytes);
  const listing = execSync(`unzip -l "${file}"`, { encoding: "utf8" });
  return listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/).pop() ?? "")
    .filter((part) => part.includes(".xml") || part.includes(".rels"));
}

describe("xlsx-minimal Excel-strict package", () => {
  it("keeps Excel-safe sheet names, quotes in text, and inline XML escaping", () => {
    assert.equal(excelSafeSheetName("O&M Crane Subcontractor"), "OM Crane Subcontractor");
    assert.equal(xmlEscape('20" clam shell'), '20" clam shell');
    assert.equal(xmlEscape("pipe > 2\""), "pipe &gt; 2\"");
    assert.equal(xmlEscape("ok\u0001bad"), "okbad");
    const xml = buildSheetXml([
      { ref: "A1", type: "text", value: '20" clam shell' },
      { ref: "A2", type: "text", value: "COE item > flange" },
      { ref: "B1", type: "formula", value: "'OM Crane Subcontractor'!H11" },
    ]);
    assert.match(xml, /20" clam shell/);
    assert.equal(xml.includes("&quot;"), false);
    assert.match(xml, /COE item &gt; flange/);
    assert.match(xml, /'OM Crane Subcontractor'!H11/);
  });

  it("builds an ExcelJS package Excel 365 expects (theme, shared strings, round-trip)", async () => {
    const bytes = await buildWorkbook([
      { name: "Summary Page", cells: [{ ref: "B7", type: "formula", value: "'OM Crane Subcontractor'!H11" }] },
      {
        name: "O&M Crane Subcontractor",
        cells: [
          { ref: "A7", type: "text", value: '20" clam shell' },
          { ref: "A8", type: "text", value: "COE item > flange" },
          { ref: "H11", type: "formula", value: "SUM(H7:H10)" },
        ],
      },
    ]);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const dos = dosDateTime(new Date(2026, 8, 3, 12, 0, 0));
    assert.equal(dos.time > 0, true);
    assert.equal(dos.date > 0, true);

    const parts = writeAndListZip(bytes);
    assert.equal(parts.some((part) => part.endsWith("xl/theme/theme1.xml")), true);
    assert.equal(parts.some((part) => part.endsWith("xl/sharedStrings.xml")), true);
    for (const part of REQUIRED_XLSX_PARTS) {
      assert.equal(parts.some((item) => item.endsWith(part) || item === part), true, part);
    }
    assert.equal(excelDateSerial(new Date(2026, 8, 4)) > 40000, true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    assert.equal(wb.worksheets.length, 2);
    const sub = wb.getWorksheet("OM Crane Subcontractor");
    assert.ok(sub);
    assert.equal(String(sub.getCell("A7").value), '20" clam shell');
    assert.equal(String(sub.getCell("A8").value), "COE item > flange");
    assert.match(String((sub.getCell("H11").value as { formula?: string }).formula ?? ""), /SUM\(H7:H10\)/);
  });
});
