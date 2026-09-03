import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSheetXml,
  buildWorkbook,
  dosDateTime,
  excelSafeSheetName,
  xmlEscape,
} from "./xlsx-minimal.ts";

function zipText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function localStamp(bytes: Uint8Array) {
  return {
    time: bytes[10] | (bytes[11] << 8),
    date: bytes[12] | (bytes[13] << 8),
  };
}

describe("xlsx-minimal Excel-strict package", () => {
  it("keeps Excel-safe sheet names, quotes in text, and a styles relationship", () => {
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

    const bytes = buildWorkbook([
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
    const text = zipText(bytes);
    const stamp = localStamp(bytes);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.notEqual(stamp.time, 0);
    assert.notEqual(stamp.date, 0);
    const dos = dosDateTime(new Date(2026, 8, 3, 12, 0, 0));
    assert.equal(dos.time > 0, true);
    assert.equal(dos.date > 0, true);
    assert.match(text, /xl\/styles\.xml/);
    assert.match(text, /officeDocument\/2006\/relationships\/styles/);
    assert.match(text, /OM Crane Subcontractor/);
    assert.equal(/O&amp;M Crane Subcontractor/.test(text), false);
    assert.match(text, /20" clam shell/);
    assert.equal(text.includes("&quot;"), false);
    assert.match(text, /COE item &gt; flange/);
    assert.match(text, /'OM Crane Subcontractor'!H11/);
  });
});
