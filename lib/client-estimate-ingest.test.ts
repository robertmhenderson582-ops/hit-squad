import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { ESTIMATE_XLSX_SHEETS } from "./estimate-xlsx.ts";
import {
  classifyEstimateWorkbook,
  classifyFromSheetsAndName,
  CLIENT_FACE_MAPPER_SPEC,
  CLIENT_TEMPLATE_STAGED,
  looksLikeFerndaleGep,
  looksLikeHitSquadPack,
  looksLikeMadisonContractorTemplate,
  looksLikeP66RodeoWorkbook,
  seedMetadataForClass,
  shouldStageClientWorkbook,
} from "./client-estimate-ingest.ts";
import { RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";

async function workbookBytes(names: string[]) {
  const wb = new ExcelJS.Workbook();
  for (const name of names) wb.addWorksheet(name);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("client estimate ingest (staged)", () => {
  it("keeps Rodeo families A / B / C separate and does not smash Hit Squad packs", () => {
    assert.equal(CLIENT_FACE_MAPPER_SPEC["madison-contractor"].family, "A");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["p66-rodeo-workbook"].family, "B");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["client-estimate-form"].family, "C");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["wood-river-b1"].ingest, "apply-hours");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["madison-contractor"].ingest, "apply-hours-u110-u250");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["p66-rodeo-workbook"].ingest, "stage-metadata");

    assert.equal(
      looksLikeMadisonContractorTemplate(["INSTRUCTIONS", "SUMMARY", "1", "2", "3", "4", "5", "6"], ""),
      true,
    );
    assert.equal(
      looksLikeP66RodeoWorkbook(["Cover"], "P66 RODEO ESTIMATE WORKBOOK Blank Needs Rates updated.xlsx"),
      true,
    );
    assert.equal(
      looksLikeMadisonContractorTemplate(
        ["INSTRUCTIONS", "SUMMARY"],
        "P66 RODEO ESTIMATE WORKBOOK Unit 110  1508 07222026 RH.xlsx",
      ),
      false,
    );
    assert.equal(
      looksLikeHitSquadPack([ESTIMATE_XLSX_SHEETS.summary, ESTIMATE_XLSX_SHEETS.jobSetup, ESTIMATE_XLSX_SHEETS.direct]),
      true,
    );

    const familyA = classifyFromSheetsAndName(
      ["INSTRUCTIONS", "SUMMARY", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      "MADISON U110 2026 Turnaround Contractor Estimate Template 1540 072222026R1.xlsx",
    );
    assert.equal(familyA.kind, "madison-contractor");
    assert.equal(familyA.staged, true);
    assert.equal(familyA.packId, RODEO_U110_PACK_ID);
    assert.equal(shouldStageClientWorkbook(familyA), false);

    const familyB = classifyFromSheetsAndName(
      ["Index"],
      "Copy of P66 RODEO ESTIMATE WORKBOOK  U-250  07.23.25 JB.xlsx",
    );
    assert.equal(familyB.kind, "p66-rodeo-workbook");
    assert.equal(familyB.packId, RODEO_U250_PACK_ID);
    assert.notEqual(familyA.label, familyB.label);

    const familyC = classifyFromSheetsAndName(["Form"], "Client Estimate Form U240.xlsx");
    assert.equal(familyC.kind, "client-estimate-form");

    const monroe = classifyFromSheetsAndName(
      ["Cover"],
      "Monroe Energy U541 VAC  Estimate Workbook POST REVIEW 1204 06162026.xlsx",
    );
    assert.equal(monroe.kind, "monroe-workbook");

    assert.equal(looksLikeFerndaleGep(["Cover"], "Ferndale Estimate Workbook.xlsx"), true);
    assert.equal(
      looksLikeFerndaleGep(["Cover"], "FRN GM 2028 Reformer RFX0000267 EST Workbook Phase Response.xlsx"),
      true,
    );
    assert.equal(looksLikeFerndaleGep(["Cover"], "P66 RODEO ESTIMATE WORKBOOK Blank Needs Rates updated.xlsx"), false);
    const ferndale = classifyFromSheetsAndName(["Cover"], "Ferndale Estimate Workbook.xlsx");
    assert.equal(ferndale.kind, "ferndale-gep");
    assert.equal(ferndale.staged, true);
    assert.equal(ferndale.packId, undefined);
    assert.match(ferndale.note, /Not a Rodeo clone/);
    assert.equal(CLIENT_FACE_MAPPER_SPEC["ferndale-gep"].family, "ferndale");

    const native = classifyFromSheetsAndName(
      [ESTIMATE_XLSX_SHEETS.summary, ESTIMATE_XLSX_SHEETS.jobSetup, ESTIMATE_XLSX_SHEETS.direct],
      "wood-river-2027-aromatics-turnaround.xlsx",
    );
    assert.equal(native.kind, "hitsquad-live-pack");
    assert.equal(shouldStageClientWorkbook(native), false);

    const seed = seedMetadataForClass(familyA);
    assert.ok(seed);
    assert.deepEqual(seed.crewRanges, {});
    assert.equal(seed.totalsLockedBy, "official-revision");
    assert.match(CLIENT_TEMPLATE_STAGED, /not applied to the live pack/i);
  });

  it("classifies a real xlsx buffer from sheet names without inventing hours", async () => {
    const bytes = await workbookBytes(["INSTRUCTIONS", "SUMMARY", "Direct", "Indirect", "1", "2", "3", "4", "5"]);
    const classified = await classifyEstimateWorkbook(bytes, "MADISON U250 2026 Turnaround Contractor Estimate Template R2.xlsx");
    assert.equal(classified.kind, "madison-contractor");
    assert.equal(classified.packId, RODEO_U250_PACK_ID);
    assert.equal(classified.staged, true);
    assert.equal(shouldStageClientWorkbook(classified), false);
  });
});
