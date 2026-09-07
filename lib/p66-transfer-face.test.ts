import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { ESTIMATE_XLSX_SHEETS, estimateToXlsx } from "./estimate-xlsx.ts";
import {
  buildP66TransferFaceSheets,
  P66_OFFICIAL_SUMMARY_COLUMNS,
  P66_TRANSFER_NOTE,
  P66_TRANSFER_PASTE_MAP,
  P66_TRANSFER_SUMMARY,
  P66_V1_EXPORT_LINE,
  WAKE_DOES_NOT_CLONE_OFFICIAL_XLSX,
  p66FaceMatchesDesk,
  p66FaceMatchesGolden,
  p66PasteMapRows,
  p66TotalsFromBuckets,
  p66TotalsFromDesk,
  p66TransferSheetNames,
  readP66PasteMapValue,
  readP66SummaryTotals,
  rodeoFacesLock,
  shouldAttachP66TransferFace,
} from "./p66-transfer-face.ts";
import { isWakeIdentityOnly, rodeoMonroeWakeCards, RODEO_U110_PACK_ID } from "./rodeo-monroe-wake.ts";
import { U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";

describe("estimate fills P66-shaped export for paste", () => {
  it("fills official-shaped SUMMARY from the Hit Squad source and matches Work Folder goldens", () => {
    const u110 = p66TotalsFromBuckets(U110_CONTRACTOR_GOLDEN.buckets!, { unit: "U110" });
    const u250 = p66TotalsFromBuckets(U250_CONTRACTOR_GOLDEN.buckets!, { unit: "U250" });
    assert.equal(p66FaceMatchesGolden(u110, U110_CONTRACTOR_GOLDEN.buckets!), true);
    assert.equal(p66FaceMatchesGolden(u250, U250_CONTRACTOR_GOLDEN.buckets!), true);
    const sheets = buildP66TransferFaceSheets(u110);
    assert.deepEqual(sheets.map((row) => row.name), p66TransferSheetNames());
    assert.equal(sheets[0]?.name, P66_TRANSFER_PASTE_MAP);
    assert.equal(rodeoFacesLock({ face: u110, golden: U110_CONTRACTOR_GOLDEN.buckets! }), true);
    const summary = sheets.find((row) => row.name === P66_TRANSFER_SUMMARY)!;
    const read = readP66SummaryTotals(summary);
    assert.equal(read.grandTotal, 5_247_587);
    assert.equal(read.totalHours, 26441);
    assert.equal(read.directHours, 16730);
    assert.equal(read.indirectHours, 9711);
    assert.equal(read.materialsDirect, 40000);
    assert.equal(read.materialsIndirect, 10000);
    for (const col of P66_OFFICIAL_SUMMARY_COLUMNS) {
      const header = summary.cells.find((cell) => cell.ref === `${col.col}7`);
      assert.equal(header?.type === "text" ? header.value : "", col.header);
    }
    assert.equal(readP66PasteMapValue(sheets[0]!, "TOTALS TOTAL $"), 5_247_587);
    assert.equal(readP66PasteMapValue(sheets[0]!, "TOTALS TOTAL HRS"), 26441);
    assert.equal(p66PasteMapRows(u110).some((row) => row.officialTab === "1" && row.officialField === "TOTALS CRAFT AMT"), true);
    assert.match(P66_TRANSFER_NOTE, /Copy these values into the official P66 file/i);
    assert.match(P66_V1_EXPORT_LINE, /estimate fills P66-shaped export → Robert pastes into official file/);
    assert.equal(WAKE_DOES_NOT_CLONE_OFFICIAL_XLSX, true);
  });

  it("keeps Hit Squad desk totals ↔ P66 face ↔ official U110 / U250 fixtures", () => {
    const u110Face = p66TotalsFromBuckets(U110_CONTRACTOR_GOLDEN.buckets!, { unit: "U110" });
    const u250Face = p66TotalsFromBuckets(U250_CONTRACTOR_GOLDEN.buckets!, { unit: "U250" });
    const u110Read = readP66SummaryTotals(buildP66TransferFaceSheets(u110Face)[1]!);
    const u250Read = readP66SummaryTotals(buildP66TransferFaceSheets(u250Face)[1]!);
    assert.equal(u110Read.grandTotal, U110_CONTRACTOR_GOLDEN.buckets!.grandTotal);
    assert.equal(u110Read.totalHours, U110_CONTRACTOR_GOLDEN.buckets!.totalHours);
    assert.equal(u250Read.grandTotal, U250_CONTRACTOR_GOLDEN.buckets!.grandTotal);
    assert.equal(u250Read.totalHours, U250_CONTRACTOR_GOLDEN.buckets!.totalHours);
    assert.equal(p66FaceMatchesGolden(u110Face, U110_CONTRACTOR_GOLDEN.buckets!), true);
    assert.equal(p66FaceMatchesGolden(u250Face, U250_CONTRACTOR_GOLDEN.buckets!), true);
  });

  it("keeps transfer grand equal to the Hit Squad desk rail on a live Rodeo pack", () => {
    const input = {
      title: "Rodeo U110 2026 TA",
      client: "Phillips 66",
      site: "Rodeo — Rodeo, CA",
      crew: {
        direct: [
          {
            id: "bm-1",
            position: "BOILERMAKER JOURNEYMAN",
            ranges: [{ start: "2026-09-08", end: "2026-09-08", hoursPerShift: 10, headcount: 2, nightHeadcount: 0, perDiemPeople: 0, days: [true] }],
          },
        ],
        otAfter8: true,
      },
      jobMeta: { staffPerDiemRate: 155, craftPerDiemRate: 145 },
      equipment: { largeTools: [], thirdParty: [] },
      otherCost: { perDiemRate: 0, travel: [], misc: [] },
    };
    assert.equal(shouldAttachP66TransferFace(input.site, input.client), true);
    assert.equal(shouldAttachP66TransferFace("Wood River — Roxana, IL", "Phillips 66"), false);
    const face = p66TotalsFromDesk(input);
    assert.equal(p66FaceMatchesDesk(face, input), true);
    assert.equal(rodeoFacesLock({ face, desk: input }), true);
    assert.equal(face.grandTotal, deskPackageTotal(input));
    const summary = buildP66TransferFaceSheets(face).find((row) => row.name === P66_TRANSFER_SUMMARY)!;
    assert.equal(readP66SummaryTotals(summary).grandTotal, deskPackageTotal(input));
  });

  it("attaches the transfer face on Rodeo export and leaves Wood River sheets alone", async () => {
    const rodeo = await estimateToXlsx({
      title: "Rodeo U110 2026 TA",
      client: "Phillips 66",
      site: "Rodeo — Rodeo, CA",
      crew: { direct: [], otAfter8: true },
    });
    const wood = await estimateToXlsx({
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
    });
    const rodeoWb = new ExcelJS.Workbook();
    await rodeoWb.xlsx.load(rodeo as unknown as ArrayBuffer);
    const woodWb = new ExcelJS.Workbook();
    await woodWb.xlsx.load(wood as unknown as ArrayBuffer);
    assert.equal(rodeoWb.worksheets.some((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.summary), true);
    assert.equal(rodeoWb.worksheets.some((sheet) => sheet.name === P66_TRANSFER_SUMMARY), true);
    assert.equal(rodeoWb.worksheets.some((sheet) => sheet.name === P66_TRANSFER_PASTE_MAP), true);
    assert.equal(
      p66TransferSheetNames().every((name) => rodeoWb.worksheets.some((sheet) => sheet.name === name)),
      true,
    );
    assert.equal(woodWb.worksheets.some((sheet) => sheet.name === P66_TRANSFER_SUMMARY), false);
    assert.equal(shouldAttachP66TransferFace("Bayway — Linden, NJ", "Phillips 66"), false);
    const faceSheet = rodeoWb.getWorksheet(P66_TRANSFER_SUMMARY);
    assert.ok(faceSheet);
    const input = {
      title: "Rodeo U110 2026 TA",
      client: "Phillips 66",
      site: "Rodeo — Rodeo, CA",
      crew: { direct: [], otAfter8: true },
    };
    assert.equal(Number(faceSheet.getCell("N18").value || 0), deskPackageTotal(input));
    assert.equal(String(faceSheet.getCell("B8").value || ""), "DIRECT LABOR (DC.L)");
  });

  it("does not require a cloned official xlsx binary for reserved wake shells", () => {
    const card = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U110_PACK_ID)!;
    assert.equal(isWakeIdentityOnly(card), true);
    assert.equal(WAKE_DOES_NOT_CLONE_OFFICIAL_XLSX, true);
  });
});
