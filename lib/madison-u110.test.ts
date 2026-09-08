import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { classifyFromSheetsAndName, CLIENT_FACE_MAPPER_SPEC, shouldStageClientWorkbook } from "./client-estimate-ingest.ts";
import { CREW_LANES } from "./crew-lanes.ts";
import { crewHasRows, mergeVaultIntoLocal, pickPack } from "./estimate-pack.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import { estimateTabIdsForSite } from "./estimate-tabs.ts";
import { applyEstimateImport, createPackFromImport, parseEstimateXlsx } from "./estimate-xlsx-import.ts";
import { ESTIMATE_XLSX_SHEETS, LABOR_BLOCK_ID_COL, LABOR_HPS_TYPE, estimateToXlsx } from "./estimate-xlsx.ts";
import { ingestMadisonU110 } from "./madison-u110-xlsx.ts";
import { CREW_STORE_PREFIX, isDefaultSeedSchedule, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { readStoreJson, storageKeyForPack, type StorageLike } from "./local-estimates.ts";
import { RODEO_U110_PACK_ID, RODEO_U250_PACK_ID, isWakeIdentityOnly, rodeoMonroeWakeCards } from "./rodeo-monroe-wake.ts";
import { U110_CONTRACTOR_GOLDEN } from "./wake-golden.ts";
import {
  checkRodeoU110OfficialHours,
  checkRodeoU110PackHours,
  ingestRodeoU110FromFixture,
  loadRodeoU110Fixture,
  madisonContractorLaborSheet,
  madisonLaneFor,
  persistRodeoU110Wake,
  RODEO_U110_CLIENT,
  RODEO_U110_HOURS_PLUG,
  RODEO_U110_SITE,
  RODEO_U110_STATUS,
  rodeoU110BucketHoursFromCrew,
  rodeoU110FilledSnapshot,
  rodeoU110HoursFromCrew,
} from "./madison-u110.ts";

function memoryStore(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
  return {
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

async function miniMadisonBytes() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("INSTRUCTIONS");
  const summary = wb.addWorksheet("SUMMARY");
  summary.getCell("B2").value = "U110";
  const direct = wb.addWorksheet("1. Direct Labor (DC.L)");
  direct.getCell("C9").value = "Boilermaker";
  direct.getCell("D9").value = 20;
  direct.getCell("E9").value = 158.89;
  direct.getCell("C10").value = "Hole Watch/Fire Watch";
  direct.getCell("D10").value = 8;
  direct.getCell("E10").value = 148.17;
  const indirect = wb.addWorksheet("2. Indirect Labor (IC.L)");
  indirect.getCell("B9").value = "Project Manager";
  indirect.getCell("C9").value = 10;
  indirect.getCell("D9").value = 220.4;
  indirect.getCell("B10").value = "General Foreman";
  indirect.getCell("C10").value = 6;
  indirect.getCell("D10").value = 238.5;
  indirect.getCell("B11").value = "Foreman";
  indirect.getCell("C11").value = 12;
  indirect.getCell("D11").value = 171.01;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("madison-u110 ingest", () => {
  it("client wake module loads the fixture as static JSON and never touches node:fs", () => {
    const src = readFileSync(fileURLToPath(new URL("./madison-u110.ts", import.meta.url)), "utf8");
    assert.match(src, /wake-golden\/rodeo-u110-crew\.json/);
    assert.doesNotMatch(src, /from ["']node:(fs|url|path)["']|from ["']exceljs["']/);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const modal = readFileSync(fileURLToPath(new URL("../components/NewEstimateModal.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /madison-u110-xlsx/);
    assert.match(modal, /madison-u110-xlsx/);
    assert.doesNotMatch(workspace, /from ["']@\/lib\/madison-u110["']/);
  });

  it("maps Madison contractor tabs onto the five desk cards", () => {
    assert.equal(madisonContractorLaborSheet("1. Direct Labor (DC.L)"), "direct");
    assert.equal(madisonContractorLaborSheet("2. Indirect Labor (IC.L)"), "indirect");
    assert.equal(madisonLaneFor("indirect", "Project Manager"), "staff");
    assert.equal(madisonLaneFor("indirect", "General Foreman"), "generalForeman");
    assert.equal(madisonLaneFor("indirect", "Foreman"), "foreman");
    assert.equal(madisonLaneFor("direct", "Boilermaker"), "direct");
    assert.equal(madisonLaneFor("direct", "Hole Watch/Fire Watch"), "support");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["madison-contractor"].ingest, "apply-hours-u110-u250");
    const classified = classifyFromSheetsAndName(
      ["INSTRUCTIONS", "SUMMARY", "1. Direct Labor (DC.L)", "2. Indirect Labor (IC.L)"],
      "MADISON U110 2026 Turnaround Contractor Estimate Template 1540 072222026R1.xlsx",
    );
    assert.equal(classified.kind, "madison-contractor");
    assert.equal(classified.packId, RODEO_U110_PACK_ID);
    assert.equal(shouldStageClientWorkbook(classified), false);
    const u250 = classifyFromSheetsAndName(
      ["INSTRUCTIONS", "SUMMARY", "1", "2", "3", "4", "5"],
      "MADISON U250 2026 Turnaround Contractor Estimate Template R2.xlsx",
    );
    assert.equal(u250.packId, RODEO_U250_PACK_ID);
    assert.equal(shouldStageClientWorkbook(u250), false);
  });

  it("parses a Madison contractor buffer without inventing a calendar or #REF labor $", async () => {
    const ingested = await ingestMadisonU110(await miniMadisonBytes(), "MADISON U110 2026 Turnaround Contractor Estimate Template 1540 072222026R1.xlsx");
    assert.equal(ingested.crew.staff?.[0]?.position, "Project Manager");
    assert.equal(ingested.crew.generalForeman?.[0]?.position, "General Foreman");
    assert.equal(ingested.crew.foreman?.[0]?.position, "Foreman");
    assert.equal(ingested.crew.direct?.[0]?.position, "Boilermaker");
    assert.equal(ingested.crew.support?.[0]?.position, "Hole Watch/Fire Watch");
    assert.equal(ingested.schedule.projectStart, RODEO_U110_HOURS_PLUG);
    assert.ok(ingested.crew.direct?.[0]?.ranges.some((range) => range.headcount === 1 && range.hoursPerShift === 20));
    assert.equal(ingested.jobMeta.staffPerDiemRate, 155);
    assert.equal(ingested.jobMeta.craftPerDiemRate, 145);
  });

  it("fills U110 pack hours from Madison R1 and keeps the SUMMARY face lock", () => {
    const fixture = loadRodeoU110Fixture();
    assert.equal(checkRodeoU110OfficialHours(fixture.summaryBuckets).ok, true);
    assert.equal(fixture.summaryBuckets.directHours, U110_CONTRACTOR_GOLDEN.buckets?.directHours);
    assert.equal(fixture.summaryBuckets.indirectHours, U110_CONTRACTOR_GOLDEN.buckets?.indirectHours);
    assert.equal(fixture.summaryBuckets.grandTotal, U110_CONTRACTOR_GOLDEN.buckets?.grandTotal);
    assert.equal(fixture.positions.length, 15);
    assert.equal(fixture.positions.filter((row) => row.lane === "staff").length, 5);
    assert.equal(fixture.positions.filter((row) => row.lane === "generalForeman").length, 1);
    assert.equal(fixture.positions.filter((row) => row.lane === "foreman").length, 2);
    assert.equal(fixture.positions.filter((row) => row.lane === "direct").length, 6);
    assert.equal(fixture.positions.filter((row) => row.lane === "support").length, 1);
    assert.ok(fixture.findings.some((row) => /#REF/i.test(row)));

    const pack = rodeoU110FilledSnapshot();
    assert.equal(pack.packId, RODEO_U110_PACK_ID);
    assert.equal(pack.status, RODEO_U110_STATUS);
    assert.notEqual(pack.status, "Locked");
    assert.notEqual(pack.status, "Awarded");
    assert.equal(isDefaultSeedSchedule(pack.schedule), false);
    assert.equal(crewHasRows(pack.crew), true);
    assert.equal(checkRodeoU110PackHours(pack.crew as never).ok, true);
    const hours = rodeoU110HoursFromCrew(pack.crew as never);
    assert.equal(Math.round(hours.staffHours), fixture.typedHours.staffHours);
    assert.equal(Math.round(hours.directHours), fixture.typedHours.directHours);
    assert.equal(Math.round(hours.supportHours), 1480);
    const buckets = rodeoU110BucketHoursFromCrew(pack.crew as never);
    assert.equal(Math.round(buckets.directHours), 16730);
    assert.equal(Math.round(buckets.indirectHours), 9711);
    assert.ok((pack.otherCost as { misc?: Array<{ item: string; each: number }> })?.misc?.some((row) => row.item === "Extractor Equipment" && row.each === 125000));
    assert.ok((pack.otherCost as { misc?: Array<{ item: string }> })?.misc?.some((row) => row.item === "Per Diem (Direct)"));
  });

  it("wakes U110 crew on persist and prefers filled seed over an empty vault identity", () => {
    const store = memoryStore();
    persistRodeoU110Wake(store);
    const key = storageKeyForPack(RODEO_U110_PACK_ID);
    const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
    const schedule = readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`);
    assert.equal(crewHasRows(crew), true);
    assert.equal(isDefaultSeedSchedule(schedule), false);
    assert.equal(checkRodeoU110PackHours(crew as never).ok, true);

    const local = rodeoU110FilledSnapshot({ createdAt: 1, updatedAt: 2 });
    const vault = {
      packId: RODEO_U110_PACK_ID,
      key: `new:${RODEO_U110_PACK_ID}`,
      title: "Rodeo U110 2026 TA",
      client: RODEO_U110_CLIENT,
      site: RODEO_U110_SITE,
      siteId: "site-rodeo",
      createdAt: 1,
      updatedAt: 1,
      ownerEmail: "",
      crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    };
    const winner = pickPack(local, vault);
    assert.equal(crewHasRows(winner?.crew), true);
    assert.equal(checkRodeoU110PackHours(winner?.crew as never).ok, true);
    mergeVaultIntoLocal(store, vault);
    assert.equal(checkRodeoU110PackHours(readStoreJson(store, `${CREW_STORE_PREFIX}${key}`) as never).ok, true);
  });

  it("stays on the Wood River five-card desk — Rodeo tab is additive", () => {
    const pack = rodeoU110FilledSnapshot();
    const rodeo = estimateTabIdsForSite(RODEO_U110_SITE, RODEO_U110_CLIENT);
    const wood = estimateTabIdsForSite("Wood River — Roxana, IL", "Phillips 66");
    assert.equal(rodeo.includes("crew"), true);
    assert.equal(rodeo.includes("rodeo"), true);
    assert.equal(wood.includes("rodeo"), false);
    assert.deepEqual(
      CREW_LANES.map((lane) => lane.id),
      ["staff", "general-foreman", "foreman", "direct", "support"],
    );
    const crew = pack.crew as {
      staff: unknown[];
      generalForeman: unknown[];
      foreman: unknown[];
      direct: unknown[];
      support: unknown[];
    };
    assert.ok(crew.staff.length && crew.generalForeman.length && crew.foreman.length && crew.direct.length && crew.support.length);
    const card = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U110_PACK_ID)!;
    assert.equal(isWakeIdentityOnly(card), true);
    const ingested = ingestRodeoU110FromFixture();
    assert.equal(ingested.fixture.positions.some((row) => row.position === "Boilermaker" && row.hours === 7108), true);
    assert.equal(ingested.fixture.positions.filter((row) => row.position === "Foreman").length, 2);
  });

  it("UP→DOWN Hit Squad export/import keeps U110 hours and Hours/shift", async () => {
    const pack = rodeoU110FilledSnapshot();
    const input = packSnapshotToXlsxInput(pack);
    const before = rodeoU110HoursFromCrew(input.crew);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as never);
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    let hps = false;
    staff.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? "") === LABOR_HPS_TYPE) hps = true;
      });
    });
    assert.equal(hps, true);
    assert.equal(staff.getColumn(LABOR_BLOCK_ID_COL).hidden, true);

    const imported = await parseEstimateXlsx(bytes);
    assert.ok(imported.blocks.some((block) => block.id.startsWith("u110-")));
    const up = applyEstimateImport(pack, imported);
    const down = createPackFromImport(imported);
    const upBuckets = rodeoU110BucketHoursFromCrew(up.crew as never);
    const downBuckets = rodeoU110BucketHoursFromCrew(down.crew as never);
    assert.equal(Math.round(upBuckets.directHours), Math.round(before.directBucketHours));
    assert.equal(Math.round(upBuckets.indirectHours), 9711);
    assert.equal(Math.round(downBuckets.directHours), 16730);
    assert.equal(Math.round(downBuckets.indirectHours), 9711);
    assert.ok((up.crew.staff?.length ?? 0) && (up.crew.generalForeman?.length ?? 0) && (up.crew.foreman?.length ?? 0));
    assert.ok((up.crew.direct?.length ?? 0) && (up.crew.support?.length ?? 0));
    assert.equal(Math.round(rodeoU110HoursFromCrew(up.crew).supportHours), 1480);
  });
});
