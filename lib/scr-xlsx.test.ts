import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  addClaimLine,
  addCraftLine,
  addLogRow,
  emptyFcrPacket,
  fcrSummary,
} from "./change-order-packet.ts";
import {
  ESTIMATE_EXPORT_CONFIDENTIAL,
  ESTIMATE_PREPARED_BY_LABEL,
  ESTIMATE_STATUS_LABEL,
  estimateExportBrand,
  estimateExportProducer,
} from "./estimate-xlsx.ts";
import {
  SCR_COST_LABEL,
  SCR_DOCUMENT_TITLE,
  SCR_ESTIMATE_TITLE,
  SCR_EXPORT_CONFIDENTIAL,
  SCR_EXPORT_ERROR,
  SCR_HOURS_LABEL,
  SCR_TOTAL_LABEL,
  SCR_XLSX_SHEETS,
  buildScrWorkbook,
  scrToXlsx,
  scrWorkbookTotal,
  scrXlsxFilename,
} from "./scr-xlsx.ts";
import { evaluateWorkbook } from "./xlsx-eval.ts";

const WOOD = { client: "Phillips 66", site: "Wood River — Roxana, IL", title: "Cat 2 Pit Stop" };
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixturePacket() {
  let packet = addLogRow(emptyFcrPacket(), {
    id: "scr-1",
    scr: "SCR-4",
    requestDate: "2026-09-17",
    requestedBy: "Madison",
    scope: "Extra weld on exchanger",
    scopeHours: 99,
    scopeCost: 9,
  });
  packet = {
    ...packet,
    scr: { ...packet.scr, taRm: "TA-9", moc: "MOC-2", sap: "SAP-11", costNote: "Alloy rod + NDE" },
  };
  packet = addCraftLine(packet, "scr-1", {
    id: "c1",
    craft: "Pipefitter Journeyman",
    stHours: 10,
    otHours: 2,
    dtHours: 0,
    stRate: 80,
    otRate: 120,
    dtRate: 160,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl1",
    type: "Subcontractor",
    description: "NDE truck",
    amount: 1500,
    hours: 6,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl2",
    type: "Third-party rental",
    description: "40-ton crane",
    amount: 2400,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl3",
    type: "Material",
    description: "Alloy rod",
    amount: 375,
  });
  return packet;
}

describe("SCR Excel export", () => {
  it("builds the Estimate-family chrome and formula total without throwing", async () => {
    const packet = fixturePacket();
    const input = {
      ...WOOD,
      packet,
      preparedBy: "Robert Henderson",
      status: "Draft",
      companyLogo: PIXEL,
    };
    const sheets = buildScrWorkbook(input, new Date("2026-09-17T06:00:00Z"));
    assert.deepEqual(
      sheets.map((sheet) => sheet.name),
      [SCR_XLSX_SHEETS.cover, SCR_XLSX_SHEETS.estimate, SCR_XLSX_SHEETS.log],
    );
    assert.equal(sheets[0]?.chrome, "cover");
    assert.equal(sheets[1]?.chrome, "instrument");
    const cover = sheets[0]!;
    const estimate = sheets[1]!;
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === estimateExportBrand("Madison")));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === SCR_DOCUMENT_TITLE));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === ESTIMATE_PREPARED_BY_LABEL));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Robert Henderson"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Draft"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && /Confidential/.test(cell.value)));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === SCR_ESTIMATE_TITLE));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === SCR_HOURS_LABEL));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === SCR_COST_LABEL));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === "Pipefitter Journeyman"));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === "Material"));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === "Subcontractor"));
    assert.ok(estimate.cells.some((cell) => cell.type === "text" && cell.value === "Third-party rental"));
    assert.ok(
      estimate.cells.some(
        (cell) =>
          cell.type === "formula" &&
          /N\(B\d+\)\*N\(E\d+\)\+N\(C\d+\)\*N\(F\d+\)\+N\(D\d+\)\*N\(G\d+\)/.test(cell.value),
      ),
    );
    const desk = fcrSummary(packet).scrCost;
    assert.equal(desk, 5315);
    assert.equal(scrWorkbookTotal(sheets), desk);
    const book = evaluateWorkbook(sheets);
    const hoursLabel = estimate.cells.find((cell) => cell.type === "text" && cell.value === SCR_HOURS_LABEL);
    assert.ok(hoursLabel);
    assert.equal(book.evalAt(estimate.name, `B${hoursLabel.ref.slice(1)}`), 18);
    const bytes = await scrToXlsx(input);
    assert.ok(bytes.byteLength > 0);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file("[Content_Types].xml"));
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith("xl/worksheets/")));
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith("xl/media/")));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    assert.deepEqual(
      wb.worksheets.map((sheet) => sheet.name),
      [SCR_XLSX_SHEETS.cover, SCR_XLSX_SHEETS.estimate, SCR_XLSX_SHEETS.log],
    );
    assert.equal(wb.getWorksheet(SCR_XLSX_SHEETS.cover)?.getCell("A5").value, SCR_DOCUMENT_TITLE);
    assert.match(
      String(wb.getWorksheet(SCR_XLSX_SHEETS.cover)?.getCell("A3").value || ""),
      new RegExp(`${ESTIMATE_STATUS_LABEL}: Draft`),
    );
    assert.match(
      String(wb.getWorksheet(SCR_XLSX_SHEETS.cover)?.getCell("A3").value || ""),
      new RegExp(`${ESTIMATE_PREPARED_BY_LABEL}: Robert Henderson`),
    );
    assert.match(scrXlsxFilename(WOOD), /scr\.xlsx$/);
    assert.match(scrXlsxFilename(WOOD), /cat-2-pit-stop/);
  });

  it("empty packet still builds a client workbook and matches desk $0", async () => {
    const sheets = buildScrWorkbook({ ...WOOD, packet: emptyFcrPacket() });
    assert.equal(scrWorkbookTotal(sheets), 0);
    const bytes = await scrToXlsx({ ...WOOD, packet: emptyFcrPacket() });
    assert.ok(bytes.byteLength > 0);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file("xl/workbook.xml"));
  });

  it("typed scope hours and money roll into SCR TOTAL $ when there are no lines", () => {
    const packet = addLogRow(emptyFcrPacket(), {
      id: "typed",
      scr: "SCR-2",
      scope: "Night hydrotest",
      scopeHours: 12,
      scopeCost: 1800,
    });
    const sheets = buildScrWorkbook({ ...WOOD, packet });
    assert.equal(fcrSummary(packet).scrCost, 1800);
    assert.equal(scrWorkbookTotal(sheets), 1800);
    const estimate = sheets.find((sheet) => sheet.name === SCR_XLSX_SHEETS.estimate)!;
    assert.ok(estimate.cells.some((cell) => cell.type === "number" && cell.value === 12));
    assert.ok(estimate.cells.some((cell) => cell.type === "number" && cell.value === 1800));
  });

  it("rolls two SCRs — craft + claims plus a typed row — to the desk total", () => {
    let packet = fixturePacket();
    packet = addLogRow(packet, { id: "typed", scr: "SCR-5", scope: "Standby", scopeHours: 4, scopeCost: 500 });
    const sheets = buildScrWorkbook({ ...WOOD, packet });
    assert.equal(fcrSummary(packet).scrCost, 5815);
    assert.equal(scrWorkbookTotal(sheets), 5815);
  });

  it("reuses Estimate export chrome and wires the SCR tab Export Excel path", () => {
    const source = readFileSync(fileURLToPath(new URL("./scr-xlsx.ts", import.meta.url)), "utf8");
    assert.match(source, /estimateExportBrand/);
    assert.match(source, /estimateExportProducer/);
    assert.match(source, /ESTIMATE_PREPARED_BY_LABEL/);
    assert.match(source, /ESTIMATE_EXPORT_CONFIDENTIAL/);
    assert.match(source, /companyLogo/);
    assert.match(source, /buildWorkbook/);
    assert.match(source, /scr-total-mismatch/);
    assert.equal(SCR_EXPORT_CONFIDENTIAL.includes("Confidential"), true);
    assert.equal(SCR_EXPORT_ERROR.includes("SCR"), true);
    assert.match(estimateExportProducer("Madison"), /Produced by Madison/);
    assert.match(ESTIMATE_EXPORT_CONFIDENTIAL, /Confidential/);
    const desk = readFileSync(fileURLToPath(new URL("../components/ChangeOrderPacket.tsx", import.meta.url)), "utf8");
    assert.match(desk, /scrToXlsx/);
    assert.match(desk, /downloadXlsx/);
    assert.match(desk, /BuildingFileModal/);
    assert.match(desk, /Export Excel/);
    assert.match(desk, /company-logo/);
    assert.match(desk, /exporterDisplayName/);
    assert.match(desk, /status: pack\.status/);
  });
});
