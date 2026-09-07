import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { estimateToXlsx } from "./estimate-xlsx.ts";
import {
  buildP66TransferFaceSheets,
  P66_TRANSFER_NOTE,
  P66_TRANSFER_SUMMARY,
  p66FaceMatchesDesk,
  p66FaceMatchesGolden,
  p66TotalsFromBuckets,
  p66TotalsFromDesk,
  readP66SummaryTotals,
  shouldAttachP66TransferFace,
} from "./p66-transfer-face.ts";
import { U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";

describe("P66-shaped transfer face", () => {
  it("fills the contractor SUMMARY from official fixtures so Robert can paste", () => {
    const u110 = p66TotalsFromBuckets(U110_CONTRACTOR_GOLDEN.buckets!, { unit: "U110" });
    const u250 = p66TotalsFromBuckets(U250_CONTRACTOR_GOLDEN.buckets!, { unit: "U250" });
    assert.equal(p66FaceMatchesGolden(u110, U110_CONTRACTOR_GOLDEN.buckets!), true);
    assert.equal(p66FaceMatchesGolden(u250, U250_CONTRACTOR_GOLDEN.buckets!), true);
    const sheets = buildP66TransferFaceSheets(u110);
    assert.deepEqual(sheets.map((row) => row.name), ["P66 SUMMARY", "P66 Direct", "P66 Indirect"]);
    const read = readP66SummaryTotals(sheets[0]!);
    assert.equal(read.grandTotal, 5_247_587);
    assert.equal(read.totalHours, 26441);
    assert.match(sheets[0]!.cells.find((cell) => cell.ref === "A2")?.type === "text" ? sheets[0]!.cells.find((cell) => cell.ref === "A2")!.value as string : "", /copy-paste/i);
    assert.match(P66_TRANSFER_NOTE, /official contractor template/i);
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
    assert.equal(rodeoWb.worksheets.some((sheet) => sheet.name === P66_TRANSFER_SUMMARY), true);
    assert.equal(woodWb.worksheets.some((sheet) => sheet.name === P66_TRANSFER_SUMMARY), false);
  });
});
