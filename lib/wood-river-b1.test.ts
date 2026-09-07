import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { isAromaticsIdentity } from "./aromatics-freeze.ts";
import {
  BOILER17_COST_NOTE,
  BOILER17_PACK_ID,
  checkMikeCppr108451,
} from "./boiler-17.ts";
import { classifyFromSheetsAndName, CLIENT_FACE_MAPPER_SPEC, shouldStageClientWorkbook } from "./client-estimate-ingest.ts";
import { crewHasRows } from "./estimate-pack.ts";
import { HIS_AROMATICS_PACK_ID, persistHisWoodRiverCards } from "./his-wood-river.ts";
import { CREW_STORE_PREFIX, isDefaultSeedSchedule, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { readStoreJson, storageKeyForPack, type StorageLike } from "./local-estimates.ts";
import { BOILER17_B1_GOLDEN } from "./wake-golden.ts";
import {
  b1LaneFor,
  boiler17B1FilledSnapshot,
  boiler17HoursFromCrew,
  checkBoiler17OfficialHours,
  checkBoiler17PackHours,
  classicB1LaborSheet,
  ingestFromFixture,
  ingestWoodRiverB1,
  loadBoiler17B1Fixture,
  WOOD_RIVER_B1_WINDOW_END,
  WOOD_RIVER_B1_WINDOW_START,
} from "./wood-river-b1.ts";

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

async function miniB1Bytes() {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Summary Page");
  summary.getCell("C8").value = 20;
  summary.getCell("C9").value = 10;
  summary.getCell("C10").value = 8;
  summary.getCell("C17").value = 12;
  summary.getCell("D15").value = 152880;

  const staff = wb.addWorksheet(" Staff");
  staff.getCell(6, 12).value = new Date(2026, 7, 10);
  staff.getCell(11, 3).value = "SR PROJECT MGR M 1";
  staff.getCell(11, 7).value = "ST";
  staff.getCell(9, 12).value = 1;
  staff.getCell(10, 12).value = 10;
  staff.getCell(14, 7).value = "PD";
  staff.getCell(14, 12).value = 1;

  const foremen = wb.addWorksheet(" Foremen");
  foremen.getCell(5, 12).value = { formula: "=' Staff'!L6", result: new Date(2026, 7, 10) };
  foremen.getCell(10, 3).value = "BOILERMAKER FOREMAN";
  foremen.getCell(10, 7).value = "ST";
  foremen.getCell(8, 12).value = 1;
  foremen.getCell(9, 12).value = 10;

  const direct = wb.addWorksheet(" Direct");
  direct.getCell(5, 12).value = { formula: "=' Staff'!L6" };
  direct.getCell(10, 3).value = "BOILERMAKER JOURNEYMAN";
  direct.getCell(10, 7).value = "ST";
  direct.getCell(8, 12).value = 2;
  direct.getCell(9, 12).value = 10;

  const support = wb.addWorksheet(" Support");
  support.getCell(5, 12).value = { formula: "=' Staff'!L6" };
  support.getCell(10, 3).value = "TEAMSTERS GRP 06";
  support.getCell(10, 7).value = "ST";
  support.getCell(8, 12).value = 1;
  support.getCell(9, 12).value = 8;

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("wood-river-b1 ingest", () => {
  it("maps classic B-1 sheets onto the five desk cards", () => {
    assert.equal(classicB1LaborSheet(" Staff"), "staff");
    assert.equal(classicB1LaborSheet(" Foremen"), "foremen");
    assert.equal(classicB1LaborSheet(" Direct"), "direct");
    assert.equal(classicB1LaborSheet(" Support"), "support");
    assert.equal(b1LaneFor("staff", "PIPEFITTER GENERAL FOREMAN"), "generalForeman");
    assert.equal(b1LaneFor("staff", "SR PROJECT MGR M 1"), "staff");
    assert.equal(b1LaneFor("foremen", "BOILERMAKER FOREMAN"), "foreman");
    assert.equal(CLIENT_FACE_MAPPER_SPEC["wood-river-b1"].ingest, "apply-hours");
    const classified = classifyFromSheetsAndName(
      ["Summary Page", " Staff", " Foremen", " Direct", " Support"],
      "Boiler 17 2026  B-1 1019 071326RH.xlsx",
    );
    assert.equal(classified.kind, "wood-river-b1");
    assert.equal(classified.staged, false);
    assert.equal(shouldStageClientWorkbook(classified), false);
  });

  it("parses a classic B-1 buffer into calendars without inventing #REF labor $", async () => {
    const ingested = await ingestWoodRiverB1(await miniB1Bytes(), "Boiler 17 2026  B-1 1019 071326RH.xlsx");
    assert.equal(ingested.crew.staff?.[0]?.position, "SR PROJECT MGR M 1");
    assert.equal(ingested.crew.foreman?.[0]?.position, "BOILERMAKER FOREMAN");
    assert.equal(ingested.crew.direct?.[0]?.position, "BOILERMAKER JOURNEYMAN");
    assert.equal(ingested.crew.support?.[0]?.position, "TEAMSTERS GRP 06");
    assert.equal(ingested.schedule.projectStart, WOOD_RIVER_B1_WINDOW_START);
    assert.ok(ingested.crew.staff?.[0]?.ranges.some((range) => range.headcount === 1 && range.hoursPerShift === 10));
    assert.equal(ingested.jobMeta.jobNumber, "108451");
  });

  it("fills Boiler 17 pack hours from the official B-1 extract and keeps the Summary face lock", () => {
    const fixture = loadBoiler17B1Fixture();
    assert.equal(checkBoiler17OfficialHours(fixture.summaryHours).ok, true);
    assert.equal(fixture.summaryHours.directHours, BOILER17_B1_GOLDEN.boiler17Hours?.directHours);
    assert.equal(fixture.summaryHours.staffHours, BOILER17_B1_GOLDEN.boiler17Hours?.staffHours);
    assert.equal(fixture.summaryHours.targetCraftHours, BOILER17_B1_GOLDEN.boiler17Hours?.targetCraftHours);

    const pack = boiler17B1FilledSnapshot();
    assert.equal(pack.packId, BOILER17_PACK_ID);
    assert.equal(isDefaultSeedSchedule(pack.schedule), false);
    assert.equal(pack.schedule && "projectStart" in pack.schedule && pack.schedule.projectStart, WOOD_RIVER_B1_WINDOW_START);
    const post = (pack.schedule as { phases?: Array<{ id: string; stop: string }> })?.phases?.find((row) => row.id === "post");
    assert.equal(post?.stop, WOOD_RIVER_B1_WINDOW_END);
    assert.equal(crewHasRows(pack.crew), true);
    assert.ok((pack.crew as { generalForeman?: unknown[] }).generalForeman?.length);
    assert.equal(checkBoiler17PackHours(pack.crew as never).ok, true);

    const hours = boiler17HoursFromCrew(pack.crew as never);
    assert.equal(Math.round(hours.foremenHours), BOILER17_B1_GOLDEN.boiler17Hours?.foremenHours);
    assert.equal(Math.round(hours.supportHours), BOILER17_B1_GOLDEN.boiler17Hours?.supportHours);
    assert.equal(Math.round(hours.foremenHours), 2134);
    assert.equal(Math.round(hours.supportHours), 2428);
    assert.equal(Math.round(hours.staffHours), fixture.typedHours.staffPlusGfHours);
    assert.equal(Math.round(hours.directHours), fixture.typedHours.directHours);
    assert.ok((pack.otherCost as { misc?: Array<{ item: string; each: number }> })?.misc?.some((row) => row.item === "Heat Induction" && row.each === 152880));
    assert.ok((pack.otherCost as { misc?: Array<{ each: number }> })?.misc?.some((row) => row.each === 8400));
  });

  it("wakes Boiler 17 crew on HIS persist and leaves Aromatics + Mike CPPR notes alone", () => {
    const store = memoryStore();
    persistHisWoodRiverCards(store);
    const key = storageKeyForPack(BOILER17_PACK_ID);
    const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
    const schedule = readStoreJson(store, `${PHASE_STORE_PREFIX}${key}`);
    assert.equal(crewHasRows(crew), true);
    assert.equal(isDefaultSeedSchedule(schedule), false);
    assert.equal(checkBoiler17PackHours(crew as never).ok, true);
    assert.equal(checkMikeCppr108451({ notes: BOILER17_COST_NOTE, statusDate: "2026-05-30" }).ok, true);
    assert.equal(isAromaticsIdentity({ packId: HIS_AROMATICS_PACK_ID, title: "2027 Aromatics Turnaround" }), true);
    assert.notEqual(BOILER17_PACK_ID, HIS_AROMATICS_PACK_ID);
  });

  it("fixture ingest matches typed hour buckets from the Drive extract", () => {
    const ingested = ingestFromFixture();
    assert.equal(checkBoiler17PackHours(ingested.crew).ok, true);
    assert.equal(ingested.fixture.typedHours.foremenHours, 2134);
    assert.equal(ingested.fixture.typedHours.supportHours, 2428);
    assert.equal(ingested.fixture.positions.some((row) => row.lane === "generalForeman"), true);
    assert.equal(ingested.fixture.positions.some((row) => row.night), true);
  });
});
