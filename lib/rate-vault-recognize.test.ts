import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  detectRateVaultFormat,
  extractDocxText,
  extractPdfText,
  guessColumnRole,
  guessRateVaultKind,
  guessRateVaultLocal,
  guessRateVaultSite,
  parseConfirmReview,
  recognizeRateVaultSource,
  sniffSheetHeaders,
} from "./rate-vault-recognize.ts";

function pdfWithText(text: string) {
  return Buffer.from(
    `%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length ${text.length + 40} >> stream
BT /F1 12 Tf 72 720 Td (${text}) Tj ET
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF
`,
    "utf8",
  );
}

describe("Rate Vault recognition", () => {
  it("classifies path-aware kinds, sites, and locals from titles", () => {
    assert.equal(detectRateVaultFormat("book.xlsx"), "xlsx");
    assert.equal(detectRateVaultFormat("book.xlsb"), "xlsb");
    assert.equal(detectRateVaultFormat("terms.docx"), "docx");
    assert.equal(guessRateVaultKind("GPPMA-Agreement-Bookv10 (1).pdf").kind, "gppma");
    assert.equal(guessRateVaultKind("Rodeo Exhibit B-1 Bryan FINAL 08.06.26.xlsx").kind, "b1-exhibit");
    assert.equal(guessRateVaultKind("Wood River Exhibit B-1 latest (Robert 09.10.26)").kind, "b1-exhibit");
    assert.equal(guessRateVaultSite("Wood River Exhibit B-1 latest (Robert 09.10.26)"), "wood-river");
    assert.equal(guessRateVaultKind("Rate Sheet Builder Bayway 08.27.26.xlsx").kind, "rate-builder");
    assert.equal(guessRateVaultKind("PF - L 553 WRR 2025 P66 Wage Rate Sheet.pdf").kind, "local-craft-sheet");
    assert.equal(guessRateVaultKind("Work Agreement Construction Maintenance Monroe Energy.pdf").kind, "pla");
    assert.equal(guessRateVaultKind("PCA0001103-2025-2027 GMTA-Madison-Amendment 1.pdf").kind, "comp");
    assert.equal(guessRateVaultSite("PF - L 553 WRR 2025 P66 Wage Rate Sheet"), "wood-river");
    assert.equal(guessRateVaultSite("Bayway Exhibit B-1 UPDATED OE 08.20.26"), "bayway");
    assert.equal(guessRateVaultSite("Rodeo Exhibit B-1"), "rodeo");
    assert.equal(guessRateVaultSite("wage rates MONROE ENERGY"), null);
    assert.equal(guessRateVaultSite("Yates Rate builder Base Rate"), null);
    assert.equal(guessRateVaultLocal("L - 420 PIPEFITTERS"), "420");
    assert.equal(guessColumnRole("Base Wage (BW)"), "wage");
    assert.equal(guessColumnRole("H&W / Pension"), "fringe");
    assert.equal(guessColumnRole("Craft / Position"), "craft");
    assert.equal(guessColumnRole("Bill Rate"), "bill");
  });

  it("sniffs excel headers without assuming one layout", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Hall Rates");
    sheet.addRow(["Ignore this cover line"]);
    sheet.addRow(["Craft / Position", "Base Wage", "Fringe", "Burden %", "Local"]);
    sheet.addRow(["Pipefitter", 48.2, 12.1, 0.32, 553]);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const review = await recognizeRateVaultSource({
      fileName: "PF L553 WRR wage sheet.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: bytes.toString("base64"),
    });
    assert.equal("error" in review, false);
    if ("error" in review) return;
    assert.equal(review.guessedKind, "local-craft-sheet");
    assert.equal(review.guessedSiteId, "wood-river");
    assert.equal(review.guessedLocal, "553");
    assert.equal(review.needsConfirm, true);
    assert.equal(review.writesRateBook, false);
    assert.equal(review.sheets[0]?.headerRow, 2);
    assert.deepEqual(
      review.sheets[0]?.columns.map((column) => column.role),
      ["craft", "wage", "fringe", "burden", "local"],
    );
    const sniff = sniffSheetHeaders("alt", [
      ["classification", "straight time", "overtime", "hall"],
    ]);
    assert.equal(sniff.columns.some((column) => column.role === "wage"), true);
    assert.equal(sniff.columns.some((column) => column.role === "ot"), true);
  });

  it("extracts PDF and Word text and keeps confirm off the rate book", async () => {
    const pdf = pdfWithText("Wood River GPPMA agreement overtime fringe");
    assert.match(extractPdfText(pdf), /GPPMA/);
    const pdfReview = await recognizeRateVaultSource({
      fileName: "GPPMA-Agreement-Bookv10 (1).pdf",
      type: "application/pdf",
      data: pdf.toString("base64"),
    });
    assert.equal("error" in pdfReview, false);
    if ("error" in pdfReview) return;
    assert.equal(pdfReview.guessedKind, "gppma");
    assert.equal(pdfReview.guessedSiteId, "wood-river");
    assert.ok(pdfReview.confidence > 0.4);

    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document><w:body><w:p><w:r><w:t>Exhibit C Union Comp Terms Bayway</w:t></w:r></w:p></w:body></w:document>`,
    );
    const docx = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    assert.match(await extractDocxText(docx), /Union Comp Terms/);
    const wordReview = await recognizeRateVaultSource({
      fileName: "Exhibit C - Union Comp Terms V2.2.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      data: docx.toString("base64"),
    });
    assert.equal("error" in wordReview, false);
    if ("error" in wordReview) return;
    assert.equal(wordReview.guessedKind, "union-terms");
    const confirmed = parseConfirmReview(
      { sourceId: "15zFicxrF46616pD3ljvjOAduAVfi6-rH", kind: "union-terms", siteId: "east-coast" },
      wordReview,
    );
    assert.equal("error" in confirmed, false);
    if ("error" in confirmed) return;
    assert.equal(confirmed.writesRateBook, false);
    assert.equal(confirmed.kind, "union-terms");
  });

  it("classifies a linked Drive title without downloading the binary", async () => {
    const review = await recognizeRateVaultSource({
      fileName: "Bayway Exhibit B-1 UPDATED OE 08.20.26 DB.xlsb",
      driveId: "1Tl__EcHbjt4Vv5849MYJk9Yc-6q4QXgl",
      sourceId: "1Tl__EcHbjt4Vv5849MYJk9Yc-6q4QXgl",
    });
    assert.equal("error" in review, false);
    if ("error" in review) return;
    assert.equal(review.format, "xlsb");
    assert.equal(review.guessedKind, "b1-exhibit");
    assert.equal(review.guessedSiteId, "bayway");
    assert.equal(review.needsConfirm, true);
    assert.match(review.extractNote, /no binary/i);
  });
});
