import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { classifyFromSheetsAndName, CLIENT_FACE_MAPPER_SPEC, shouldStageClientWorkbook } from "./client-estimate-ingest.ts";
import { CREW_LANES } from "./crew-lanes.ts";
import { crewHasRows, estimateFileName, mergeVaultIntoLocal, pickPack } from "./estimate-pack.ts";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import { estimateTabIdsForSite } from "./estimate-tabs.ts";
import { applyEstimateImport, createPackFromImport, parseEstimateXlsx } from "./estimate-xlsx-import.ts";
import {
  ESTIMATE_XLSX_SHEETS,
  LABOR_BLOCK_ID_COL,
  LABOR_HPS_TYPE,
  estimateToXlsx,
  laborCalendarDates,
  laborDayPlug,
} from "./estimate-xlsx.ts";
import { ingestMadisonU250 } from "./madison-u250-xlsx.ts";
import { CREW_STORE_PREFIX, isDefaultSeedSchedule, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { listLocalPacks, readStoreJson, storageKeyForPack, type StorageLike } from "./local-estimates.ts";
import { RODEO_U250_PACK_ID, isWakeIdentityOnly, oneLivePackPerWakeJob, rodeoMonroeWakeCards } from "./rodeo-monroe-wake.ts";
import { moneyEqual, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";
import {
  checkRodeoU250OfficialHours,
  checkRodeoU250PackHours,
  ingestRodeoU250FromFixture,
  loadRodeoU250Fixture,
  persistRodeoU250Wake,
  shouldFillRodeoU250Crew,
  u250CrewDayGridCollapsed,
  liveU250WorkDates,
  RODEO_U250_CLIENT,
  RODEO_U250_VAULT_FILE,
  RODEO_U250_HOURS_PLUG,
  RODEO_U250_SCHEDULE_START,
  RODEO_U250_SCHEDULE_STOP,
  RODEO_U250_SITE,
  RODEO_U250_STATUS,
  rodeoU250BucketHoursFromCrew,
  rodeoU250FilledSnapshot,
  rodeoU250HoursFromCrew,
} from "./madison-u250.ts";
import { madisonLaneFor } from "./madison-u110.ts";

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
  summary.getCell("B2").value = "U250";
  const direct = wb.addWorksheet("1. Direct Labor (DC.L)");
  direct.getCell("C9").value = "Boilermaker";
  direct.getCell("D9").value = 20;
  direct.getCell("E9").value = 167.74;
  direct.getCell("C10").value = "Hole Watch/Fire Watch";
  direct.getCell("D10").value = 8;
  direct.getCell("E10").value = 146.25;
  const indirect = wb.addWorksheet("2. Indirect Labor (IC.L)");
  indirect.getCell("B9").value = "QA/QC";
  indirect.getCell("C9").value = 10;
  indirect.getCell("D9").value = 150.17;
  indirect.getCell("B10").value = "Foreman";
  indirect.getCell("C10").value = 12;
  indirect.getCell("D10").value = 177.69;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("madison-u250 ingest", () => {
  it("client wake module loads the fixture as static JSON and never touches node:fs", () => {
    const src = readFileSync(fileURLToPath(new URL("./madison-u250.ts", import.meta.url)), "utf8");
    assert.match(src, /wake-golden\/rodeo-u250-crew\.json/);
    assert.doesNotMatch(src, /from ["']node:(fs|url|path)["']|from ["']exceljs["']/);
    assert.match(src, /EST-MTN9RM/);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const modal = readFileSync(fileURLToPath(new URL("../components/NewEstimateModal.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /madison-u250-xlsx/);
    assert.match(modal, /madison-u250-xlsx/);
    assert.doesNotMatch(workspace, /from ["']@\/lib\/madison-u250["']/);
  });

  it("maps Madison contractor U250 onto the reserved EST-U25026 pack and does not stage it", () => {
    assert.equal(madisonLaneFor("direct", "Hole Watch/Fire Watch"), "support");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["madison-contractor"].ingest, "apply-hours-u110-u250");
    const classified = classifyFromSheetsAndName(
      ["INSTRUCTIONS", "SUMMARY", "1. Direct Labor (DC.L)", "2. Indirect Labor (IC.L)"],
      "MADISON U250 2026 Turnaround Contractor Estimate Template R2_08_17_2026_RH.xlsx",
    );
    assert.equal(classified.kind, "madison-contractor");
    assert.equal(classified.packId, RODEO_U250_PACK_ID);
    assert.equal(shouldStageClientWorkbook(classified), false);
    const familyB = classifyFromSheetsAndName(
      ["Index"],
      "Copy of P66 RODEO ESTIMATE WORKBOOK  U-250  07.23.25 JB.xlsx",
    );
    assert.equal(familyB.kind, "p66-rodeo-workbook");
    assert.equal(familyB.packId, RODEO_U250_PACK_ID);
    assert.equal(shouldStageClientWorkbook(familyB), true);
  });

  it("parses a Madison contractor buffer without inventing a GF seat or #REF labor $", async () => {
    const ingested = await ingestMadisonU250(
      await miniMadisonBytes(),
      "MADISON U250 2026 Turnaround Contractor Estimate Template R2_08_17_2026_RH.xlsx",
    );
    assert.equal(ingested.crew.staff?.[0]?.position, "QA/QC");
    assert.equal(ingested.crew.generalForeman?.length ?? 0, 0);
    assert.equal(ingested.crew.foreman?.[0]?.position, "Foreman");
    assert.equal(ingested.crew.direct?.[0]?.position, "Boilermaker");
    assert.equal(ingested.crew.support?.[0]?.position, "Hole Watch/Fire Watch");
    assert.equal(ingested.schedule.projectStart, RODEO_U250_SCHEDULE_START);
    assert.ok(ingested.schedule.phases.some((phase) => phase.on && phase.stop > phase.start));
    assert.equal(u250CrewDayGridCollapsed(ingested.crew), false);
    assert.equal(Math.round(rodeoU250HoursFromCrew(ingested.crew).directHours), 20);
    assert.ok((liveU250WorkDates(ingested.crew.direct?.[0]).length ?? 0) > 1);
    assert.equal(ingested.jobMeta.staffPerDiemRate, 155);
    assert.equal(ingested.jobMeta.craftPerDiemRate, 145);
  });

  it("fills U250 pack hours from JB 09.10.26 and keeps the SUMMARY face lock", () => {
    const fixture = loadRodeoU250Fixture();
    assert.equal(checkRodeoU250OfficialHours(fixture.summaryBuckets).ok, true);
    assert.equal(fixture.summaryBuckets.directHours, U250_CONTRACTOR_GOLDEN.buckets?.directHours);
    assert.equal(fixture.summaryBuckets.indirectHours, U250_CONTRACTOR_GOLDEN.buckets?.indirectHours);
    assert.equal(fixture.summaryBuckets.grandTotal, U250_CONTRACTOR_GOLDEN.buckets?.grandTotal);
    assert.equal(fixture.summaryBuckets.grandTotal, 2_351_438.99);
    assert.equal(fixture.positions.length, 22);
    assert.equal(fixture.positions.filter((row) => row.lane === "staff").length, 9);
    assert.equal(fixture.positions.filter((row) => row.lane === "generalForeman").length, 0);
    assert.equal(fixture.positions.filter((row) => row.lane === "foreman").length, 4);
    assert.equal(fixture.positions.filter((row) => row.lane === "direct").length, 9);
    assert.equal(fixture.positions.filter((row) => row.lane === "support").length, 0);
    assert.ok(fixture.findings.some((row) => /#REF/i.test(row)));
    assert.ok(fixture.findings.some((row) => /Tool Room/i.test(row)));
    assert.ok(fixture.findings.some((row) => /EST-MTN9RM/i.test(row)));
    assert.ok(fixture.findings.some((row) => /Water Walls/i.test(row)));
    assert.equal(
      fixture.positions.find((row) => row.position === "Boilermaker Journeyman (Days)" && row.hours === 2104)?.bookAmount,
      342594.08,
    );

    const pack = rodeoU250FilledSnapshot();
    assert.equal(pack.packId, RODEO_U250_PACK_ID);
    assert.equal(pack.status, RODEO_U250_STATUS);
    assert.notEqual(pack.status, "Locked");
    assert.notEqual(pack.status, "Awarded");
    assert.equal(isDefaultSeedSchedule(pack.schedule), false);
    assert.equal(crewHasRows(pack.crew), true);
    assert.equal(checkRodeoU250PackHours(pack.crew as never).ok, true);
    const hours = rodeoU250HoursFromCrew(pack.crew as never);
    assert.equal(Math.round(hours.staffHours), fixture.typedHours.staffHours);
    assert.equal(Math.round(hours.generalForemanHours), 0);
    assert.equal(Math.round(hours.directHours), fixture.typedHours.directHours);
    assert.equal(Math.round(hours.supportHours), 0);
    const buckets = rodeoU250BucketHoursFromCrew(pack.crew as never);
    assert.equal(Math.round(buckets.directHours), 6934);
    assert.equal(Math.round(buckets.indirectHours), 5067);
    assert.equal(Math.round(buckets.totalHours), 12001);
    const misc = (pack.otherCost as { misc?: Array<{ item: string; each: number; qty: number }> })?.misc ?? [];
    assert.ok(misc.some((row) => row.item === "Alloy Welding Rod" && row.qty === 1 && row.each === 5000));
    assert.ok(misc.some((row) => row.item === "Craft Mileage" && row.each === 75000));
    assert.ok(misc.some((row) => row.item === "Direct craft per diem (@$145)" && row.qty === 654 && row.each === 145));
    assert.ok(misc.some((row) => row.item === "Markup 6% (MISC & General Rental)" && row.each === 1200));
    assert.equal(misc.some((row) => /extractor/i.test(row.item)), false);
    assert.ok(
      Number(
        (pack.crew as { direct: Array<{ position: string; bookRate?: number }> }).direct.find(
          (row) => row.position === "Boilermaker Journeyman (Days)",
        )?.bookRate,
      ) > 160,
    );
    const desk = deskPackageTotal(packSnapshotToXlsxInput(pack));
    assert.equal(moneyEqual(desk, U250_CONTRACTOR_GOLDEN.buckets!.grandTotal), true);
    assert.equal(estimateFileName({ site: RODEO_U250_SITE, title: pack.title }), RODEO_U250_VAULT_FILE);
  });

  it("wakes U250 crew on persist and prefers filled seed over an empty vault identity", () => {
    const store = memoryStore();
    persistRodeoU250Wake(store);
    const key = storageKeyForPack(RODEO_U250_PACK_ID);
    const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
    const schedule = readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`);
    assert.equal(crewHasRows(crew), true);
    assert.equal(isDefaultSeedSchedule(schedule), false);
    assert.equal(checkRodeoU250PackHours(crew as never).ok, true);

    const local = rodeoU250FilledSnapshot({ createdAt: 1, updatedAt: 2 });
    const vault = {
      packId: RODEO_U250_PACK_ID,
      key: `new:${RODEO_U250_PACK_ID}`,
      title: "Rodeo U250 Fall 2026",
      client: RODEO_U250_CLIENT,
      site: RODEO_U250_SITE,
      siteId: "site-rodeo",
      createdAt: 1,
      updatedAt: 1,
      ownerEmail: "",
      crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    };
    const winner = pickPack(local, vault);
    assert.equal(crewHasRows(winner?.crew), true);
    assert.equal(checkRodeoU250PackHours(winner?.crew as never).ok, true);
    mergeVaultIntoLocal(store, vault);
    assert.equal(checkRodeoU250PackHours(readStoreJson(store, `${CREW_STORE_PREFIX}${key}`) as never).ok, true);

    const stale = {
      packId: RODEO_U250_PACK_ID,
      crew: {
        staff: [],
        generalForeman: [],
        foreman: [],
        direct: [{ id: "stale-bm", position: "Boilermaker", bookRate: 167.74, ranges: [{ hoursPerShift: 3714, headcount: 1 }] }],
        support: [],
      },
    };
    assert.equal(shouldFillRodeoU250Crew(stale), true);
    assert.equal(shouldFillRodeoU250Crew(rodeoU250FilledSnapshot()), false);

    const lumpRange = {
      id: "lump",
      start: RODEO_U250_HOURS_PLUG,
      end: RODEO_U250_HOURS_PLUG,
      headcount: 1,
      nightHeadcount: 0,
      hoursPerShift: 2104,
      perDiemPeople: 0,
      days: [true, true, true, true, true, true, true],
    };
    const collapsedCrew = {
      staff: [{ id: "s", position: "QA/QC (Lead QA-QC Days)", ranges: [lumpRange] }],
      generalForeman: [],
      foreman: [{ id: "f", position: "Foreman (Boilermaker Days)", ranges: [lumpRange] }],
      direct: [{ id: "d", position: "Boilermaker Journeyman (Days)", ranges: [lumpRange] }],
      support: [],
    };
    assert.equal(u250CrewDayGridCollapsed(collapsedCrew), true);
    assert.equal(shouldFillRodeoU250Crew({ packId: RODEO_U250_PACK_ID, crew: collapsedCrew }), true);
  });

  it("stays on the Wood River five-card desk — empty GF is official, not invented", () => {
    const pack = rodeoU250FilledSnapshot();
    const rodeo = estimateTabIdsForSite(RODEO_U250_SITE, RODEO_U250_CLIENT);
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
    assert.ok(crew.staff.length && crew.foreman.length && crew.direct.length);
    assert.equal(crew.support.length, 0);
    assert.equal(crew.generalForeman.length, 0);
    const card = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U250_PACK_ID)!;
    assert.equal(isWakeIdentityOnly(card), true);
    const ingested = ingestRodeoU250FromFixture();
    assert.equal(
      ingested.fixture.positions.some((row) => row.position === "Boilermaker Journeyman (Days)" && row.hours === 2104),
      true,
    );
    assert.equal(ingested.fixture.positions.filter((row) => /\bforeman\b/i.test(row.position)).length, 4);
    assert.equal(ingested.fixture.positions.some((row) => /general\s*foreman/i.test(row.position)), false);
    assert.equal(oneLivePackPerWakeJob([pack]), true);
    assert.equal(
      oneLivePackPerWakeJob([
        pack,
        { packId: "new-mtn9rm-draft", title: "P66 Rodeo Estimate Workbook U-250", client: "", site: "", siteId: "", createdAt: 2, updatedAt: 2, key: "new:new-mtn9rm-draft" },
      ]),
      true,
    );
  });

  it("does not seed a second U250 pack such as EST-MTN9RM leftover", () => {
    const src = readFileSync(fileURLToPath(new URL("./madison-u250.ts", import.meta.url)), "utf8");
    assert.match(src, /RODEO_U250_PACK_ID/);
    assert.doesNotMatch(src, /new-mtn9rm|EST-MTN9RM["']/);
    const store = memoryStore();
    persistRodeoU250Wake(store);
    const packs = listLocalPacks(store);
    const u250 = packs.filter((row) => /u250|U-250|rodeo estimate workbook/i.test(`${row.packId} ${row.title}`));
    assert.equal(u250.length, 1);
    assert.equal(u250[0]?.packId, RODEO_U250_PACK_ID);
    assert.equal(u250.some((row) => /MTN9RM/i.test(row.packId)), false);
  });

  it("UP→DOWN Hit Squad export/import keeps U250 hours and Hours/shift", async () => {
    const pack = rodeoU250FilledSnapshot();
    const input = packSnapshotToXlsxInput(pack);
    const before = rodeoU250HoursFromCrew(input.crew);
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
    assert.ok(imported.blocks.some((block) => block.id.startsWith("u250-")));
    const up = applyEstimateImport(pack, imported);
    const down = createPackFromImport(imported);
    const upBuckets = rodeoU250BucketHoursFromCrew(up.crew as never);
    const downBuckets = rodeoU250BucketHoursFromCrew(down.crew as never);
    assert.equal(Math.round(upBuckets.directHours), Math.round(before.directBucketHours));
    assert.equal(Math.round(upBuckets.indirectHours), 5067);
    assert.equal(Math.round(downBuckets.directHours), 6934);
    assert.equal(Math.round(downBuckets.indirectHours), 5067);
    assert.ok((up.crew.staff?.length ?? 0) && (up.crew.foreman?.length ?? 0));
    assert.equal(up.crew.generalForeman?.length ?? 0, 0);
    assert.ok((up.crew.direct?.length ?? 0) > 0);
    assert.equal(up.crew.support?.length ?? 0, 0);
    assert.equal(Math.round(rodeoU250HoursFromCrew(up.crew).supportHours), 0);
  });

  it("export day-grid spreads U250 hours across the staffing calendar, not one date", async () => {
    const pack = rodeoU250FilledSnapshot();
    const input = packSnapshotToXlsxInput(pack);
    const dates = laborCalendarDates(input);
    assert.equal(dates[0], RODEO_U250_SCHEDULE_START);
    assert.equal(dates[dates.length - 1], RODEO_U250_SCHEDULE_STOP);
    assert.ok(dates.length > 1);
    assert.equal(u250CrewDayGridCollapsed(input.crew), false);

    const seats = [
      ...((input.crew.staff ?? []).map((row) => ({ row, night: /night/i.test(row.position) }))),
      ...((input.crew.foreman ?? []).map((row) => ({ row, night: /night/i.test(row.position) }))),
      ...((input.crew.direct ?? []).map((row) => ({ row, night: /night/i.test(row.position) }))),
    ].filter((item) => item.row.position.trim());
    const dateCounts = seats.map(({ row, night }) => {
      const work = dates.filter((ymd) => {
        const plug = laborDayPlug(row, ymd, night);
        return plug.hc > 0 && plug.hps > 0;
      });
      return { position: row.position, dates: work };
    });
    assert.equal(
      dateCounts.every((row) => row.dates.length <= 1),
      false,
      "every U250 position dumped day-grid hours onto a single date",
    );
    const bmDays = dateCounts.find((row) => row.position === "Boilermaker Journeyman (Days)");
    assert.ok((bmDays?.dates.length ?? 0) > 1);
    assert.ok(dateCounts.filter((row) => row.dates.length > 1).length >= 10);

    const buckets = rodeoU250BucketHoursFromCrew(input.crew);
    assert.equal(Math.round(buckets.directHours), 6934);
    assert.equal(Math.round(buckets.indirectHours), 5067);
    assert.equal(Math.round(buckets.totalHours), 12001);
    const desk = deskPackageTotal(input);
    assert.equal(moneyEqual(desk, U250_CONTRACTOR_GOLDEN.buckets!.grandTotal), true);

    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as never);
    const direct = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(direct);
    const dateHeader = direct.getRow(6);
    let dateCols = 0;
    dateHeader.eachCell((cell, col) => {
      if (col >= 10 && cell.value != null && cell.value !== "") dateCols += 1;
    });
    assert.ok(dateCols > 1);
  });
});
