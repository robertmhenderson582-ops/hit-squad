import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyFromSheetsAndName, CLIENT_FACE_MAPPER_SPEC } from "./client-estimate-ingest.ts";
import { isWakeIdentityOnly, rodeoMonroeWakeCards, RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";
import {
  bucketSum,
  checkHydratedWakeGolden,
  familyBWorkbookFixtures,
  goldenForPackId,
  MONROE_541V_GOLDEN,
  RODEO_WORKBOOK_BLANK_GOLDEN,
  U110_CONTRACTOR_GOLDEN,
  U110_RODEO_WORKBOOK_GOLDEN,
  U250_CONTRACTOR_GOLDEN,
  U250_RODEO_WORKBOOK_GOLDEN,
  wakeGoldenFixtures,
} from "./wake-golden.ts";
import {
  OFFICIAL_MONROE_541V_REVISION_ID,
  OFFICIAL_U110_REVISION_ID,
  OFFICIAL_U250_REVISION_ID,
  RODEO_WORKBOOK_BLANK_ID,
  RODEO_WORKBOOK_U110_ID,
  RODEO_WORKBOOK_U250_ID,
} from "./work-folder.ts";

describe("Rodeo / Monroe golden fixtures", () => {
  it("locks official contractor SUMMARY totals and does not invent Monroe dollars", () => {
    const u110 = U110_CONTRACTOR_GOLDEN.buckets!;
    const u250 = U250_CONTRACTOR_GOLDEN.buckets!;
    assert.equal(bucketSum(u110), u110.grandTotal);
    assert.equal(bucketSum(u250), u250.grandTotal);
    assert.equal(u110.directHours + u110.indirectHours, u110.totalHours);
    assert.equal(u250.directHours + u250.indirectHours, u250.totalHours);
    assert.equal(u110.grandTotal, 5_247_587);
    assert.equal(u250.grandTotal, 2_470_680);
    assert.equal(U110_CONTRACTOR_GOLDEN.family, "madison-contractor");
    assert.equal(U250_CONTRACTOR_GOLDEN.family, "madison-contractor");
    assert.equal(MONROE_541V_GOLDEN.dollarsStatus, "formula-unavailable");
    assert.equal(MONROE_541V_GOLDEN.buckets, null);
    assert.equal(MONROE_541V_GOLDEN.monroeHours?.totalLabor, 8483);
    assert.match(CLIENT_FACE_MAPPER_SPEC["madison-contractor"].exportAs, /pastes into official file/);
    assert.notEqual(
      CLIENT_FACE_MAPPER_SPEC["p66-rodeo-workbook"].family,
      CLIENT_FACE_MAPPER_SPEC["madison-contractor"].family,
    );
  });

  it("keeps family B workbook fixtures as a separate face and does not invent those totals", () => {
    const familyB = familyBWorkbookFixtures();
    assert.equal(familyB.every((row) => row.family === "p66-rodeo-workbook"), true);
    assert.equal(familyB.every((row) => row.buckets === null), true);
    assert.equal(familyB.every((row) => row.dollarsStatus === "pending-workbook-eval"), true);
    assert.equal(U110_RODEO_WORKBOOK_GOLDEN.officialRevisionId, RODEO_WORKBOOK_U110_ID);
    assert.equal(U250_RODEO_WORKBOOK_GOLDEN.officialRevisionId, RODEO_WORKBOOK_U250_ID);
    assert.equal(RODEO_WORKBOOK_BLANK_GOLDEN.officialRevisionId, RODEO_WORKBOOK_BLANK_ID);
    assert.notEqual(U110_RODEO_WORKBOOK_GOLDEN.officialRevisionId, U110_CONTRACTOR_GOLDEN.officialRevisionId);
    assert.notEqual(U250_RODEO_WORKBOOK_GOLDEN.officialRevisionId, U250_CONTRACTOR_GOLDEN.officialRevisionId);
    assert.equal(goldenForPackId(RODEO_U110_PACK_ID)?.family, "madison-contractor");
    assert.equal(goldenForPackId(RODEO_U250_PACK_ID)?.family, "madison-contractor");

    const familyA = classifyFromSheetsAndName(
      ["INSTRUCTIONS", "SUMMARY", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      U110_CONTRACTOR_GOLDEN.officialRevisionName,
    );
    const familyBClass = classifyFromSheetsAndName(["Index"], U110_RODEO_WORKBOOK_GOLDEN.officialRevisionName);
    assert.equal(familyA.kind, "madison-contractor");
    assert.equal(familyBClass.kind, "p66-rodeo-workbook");
    assert.notEqual(familyA.kind, familyBClass.kind);
  });

  it("reads committed JSON fixtures and matches the official Drive ids", () => {
    const raw = JSON.parse(
      readFileSync(fileURLToPath(new URL("./wake-golden/fixtures.json", import.meta.url)), "utf8"),
    ) as {
      u110Contractor: { officialRevisionId: string; buckets: { grandTotal: number } };
      u250Contractor: { officialRevisionId: string; buckets: { grandTotal: number } };
      monroe541v: { officialRevisionId: string; dollarsStatus: string };
      u110RodeoWorkbook: { officialRevisionId: string; family: string; buckets: null };
      u250RodeoWorkbook: { officialRevisionId: string; family: string; buckets: null };
      rodeoWorkbookBlank: { officialRevisionId: string };
      boiler17B1: { officialRevisionId: string; dollarsStatus: string; boiler17Hours: { targetCraftHours: number } };
      mikeCppr108451: { jobNumber: string; mayLaborPdTravel: number; mayWithThirdAndCoe: number };
    };
    assert.equal(raw.u110Contractor.officialRevisionId, OFFICIAL_U110_REVISION_ID);
    assert.equal(raw.u250Contractor.officialRevisionId, OFFICIAL_U250_REVISION_ID);
    assert.equal(raw.monroe541v.officialRevisionId, OFFICIAL_MONROE_541V_REVISION_ID);
    assert.equal(raw.u110Contractor.buckets.grandTotal, U110_CONTRACTOR_GOLDEN.buckets?.grandTotal);
    assert.equal(raw.u250Contractor.buckets.grandTotal, U250_CONTRACTOR_GOLDEN.buckets?.grandTotal);
    assert.equal(raw.monroe541v.dollarsStatus, "formula-unavailable");
    assert.equal(raw.u110RodeoWorkbook.family, "p66-rodeo-workbook");
    assert.equal(raw.u110RodeoWorkbook.buckets, null);
    assert.equal(raw.u250RodeoWorkbook.officialRevisionId, RODEO_WORKBOOK_U250_ID);
    assert.equal(raw.rodeoWorkbookBlank.officialRevisionId, RODEO_WORKBOOK_BLANK_ID);
    assert.equal(raw.boiler17B1.officialRevisionId, "1sMay67BNvtkW6fFLygPtymnIkFqrvvHT");
    assert.equal(raw.boiler17B1.dollarsStatus, "formula-unavailable");
    assert.equal(raw.boiler17B1.boiler17Hours.targetCraftHours, 21422);
    assert.equal(raw.mikeCppr108451.jobNumber, "108451");
    assert.equal(raw.mikeCppr108451.mayLaborPdTravel, 191802);
    assert.equal(raw.mikeCppr108451.mayWithThirdAndCoe, 225256);
  });

  it("skips identity-only shells and fails a hydrated pack that drifts from the official lock", () => {
    const card = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U110_PACK_ID)!;
    assert.equal(isWakeIdentityOnly(card), true);
    assert.equal(checkHydratedWakeGolden(card, { grandTotal: 0 }).skipped, "identity-only");
    assert.equal(checkHydratedWakeGolden(card, { grandTotal: 0 }).ok, true);

    const live = { ...card, createdAt: 9_000, updatedAt: 9_001 };
    const lock = U110_CONTRACTOR_GOLDEN.buckets!;
    assert.equal(isWakeIdentityOnly(live), false);
    assert.equal(
      checkHydratedWakeGolden(live, {
        grandTotal: lock.grandTotal,
        totalHours: lock.totalHours,
        directHours: lock.directHours,
        indirectHours: lock.indirectHours,
        directDollars: lock.directDollars,
        indirectDollars: lock.indirectDollars,
      }).ok,
      true,
    );
    assert.equal(checkHydratedWakeGolden(live, { grandTotal: 1 }).ok, false);
    assert.equal(checkHydratedWakeGolden(live, { grandTotal: lock.grandTotal, totalHours: 10 }).ok, false);
    assert.equal(
      checkHydratedWakeGolden(live, { grandTotal: lock.grandTotal, totalHours: lock.totalHours, directHours: 1 }).ok,
      false,
    );
    assert.equal(goldenForPackId(RODEO_U110_PACK_ID)?.officialRevisionId, U110_CONTRACTOR_GOLDEN.officialRevisionId);
    assert.equal(wakeGoldenFixtures().length, 3);
  });
});
