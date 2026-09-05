import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { syncCraftRows } from "./craft-labor.ts";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import {
  applyEstimateImport,
  createPackFromImport,
  diffEstimateImport,
  ESTIMATE_IMPORT_ERROR,
  parseEstimateXlsx,
} from "./estimate-xlsx-import.ts";
import {
  estimateJsonToXlsxInput,
  deskEstimateTotal,
  estimateWorkbookSummaryTotal,
} from "./estimate-pack-xlsx.ts";
import type { SubSheet } from "./subcontractor.ts";
import {
  ESTIMATE_XLSX_SHEETS,
  JOB_SETUP_CBA_DATE_CELL,
  JOB_SETUP_CBA_ON_CELL,
  JOB_SETUP_CRAFT_MILE_CELL,
  JOB_SETUP_CRAFT_PD_CELL,
  JOB_SETUP_LABOR_CONT_CELL,
  JOB_SETUP_MORE_CELL,
  JOB_SETUP_STAFF_MILE_CELL,
  JOB_SETUP_STAFF_PD_CELL,
  LABOR_DATE_START_COL,
  LABOR_DT_OFFSET,
  LABOR_HC_OFFSET,
  LABOR_HPS_OFFSET,
  LABOR_OT_OFFSET,
  LABOR_PD_OFFSET,
  LABOR_ST_OFFSET,
  estimateToXlsx,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import type { MiscLine } from "./other-cost.ts";
import { billedPeriodCount, type LargeToolLine, type ThirdPartyLine } from "./equipment-sheet.ts";
import { colLetter } from "./xlsx-minimal.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import type { CraftRow } from "./craft-labor.ts";
import { defaultPhases, type PhaseScheduleState } from "./phase-schedule.ts";

function craft(
  id: string,
  position: string,
  extra: Partial<CraftRow> & { billedAs?: string; start?: string; end?: string; otAfter8?: boolean; perDiemPeople?: number } = {},
): CraftRow {
  return {
    id,
    position,
    shift: "Days",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    clockOverride: "auto",
    laborClassOverride: null,
    ranges: [
      {
        id: `${id}-rg`,
        start: extra.start ?? "2026-09-01",
        end: extra.end ?? "2026-09-01",
        headcount: 1,
        nightHeadcount: 0,
        hoursPerShift: 10,
        perDiemPeople: extra.perDiemPeople ?? 1,
        days: [false, true, true, true, true, true, false],
        otAfter8: extra.otAfter8,
        phaseId: "mech",
        shift: "Days",
      },
    ],
    ...("billedAs" in extra ? { billedAs: extra.billedAs } : {}),
  };
}

function fixture(): EstimateXlsxInput {
  return {
    title: "Unit 3 mechanical T&M",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: {
      staff: [craft("st-1", "Superintendent 01", { otAfter8: false })],
      direct: [craft("dr-1", "Boilermaker Journeyman", { otAfter8: true })],
      support: [craft("su-1", "Fire Watch", { billedAs: "Boilermaker Journeyman", otAfter8: true })],
      otAfter8: true,
    },
    schedule: {
      projectStart: "2026-09-01",
      multiUnits: false,
      units: [],
      phases: defaultPhases().map((phase) =>
        phase.id === "mech"
          ? { ...phase, on: true, start: "2026-09-01", stop: "2026-09-01", daysPerWeek: 5, hoursPerDay: 10, otAfter8: true }
          : { ...phase, on: false },
      ),
    },
    jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
  };
}

function asPack(input: EstimateXlsxInput): EstimatePackSnapshot {
  return {
    packId: "new-mtimport-pack01",
    key: "new:new-mtimport-pack01",
    title: input.title || "Estimate",
    client: input.client || "",
    site: input.site || "",
    siteId: "site-madison",
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: "tester@example.com",
    schedule: input.schedule,
    crew: input.crew,
    jobMeta: input.jobMeta,
    equipment: input.equipment,
    otherCost: input.otherCost,
    subcontractor: input.subcontractor,
  };
}

function livePackMoney(applied: ReturnType<typeof applyEstimateImport>) {
  const view = {
    title: applied.title,
    client: applied.client,
    site: applied.site,
    crew: applied.crew,
    schedule: applied.schedule,
    jobMeta: applied.jobMeta,
    equipment: applied.equipment,
    otherCost: applied.otherCost,
    subcontractor: applied.subcontractor,
  };
  return { desk: deskPackageTotal(view), summary: estimateWorkbookSummaryTotal(view) };
}

function dayCol(index = 0) {
  return colLetter(LABOR_DATE_START_COL + index);
}

describe("estimate excel import", () => {
  it("round-trips a desk pack with no edits and keeps money", async () => {
    const input = fixture();
    const before = deskPackageTotal(input);
    const imported = await parseEstimateXlsx(await estimateToXlsx(input));
    assert.equal(imported.title, input.title);
    const stamped = await parseEstimateXlsx(await estimateToXlsx({ ...input, preparedBy: "Nathan Boyte" }));
    assert.equal(stamped.title, input.title);
    assert.equal("preparedBy" in stamped, false);
    assert.equal("status" in stamped, false);
    const kept = applyEstimateImport({ ...asPack(input), status: "Awarded" }, stamped);
    assert.equal(kept.status, "Awarded");
    assert.equal(imported.crew.staff?.[0]?.position, "Superintendent 01");
    assert.equal(imported.crew.support?.[0] && "billedAs" in imported.crew.support[0], true);
    assert.equal((imported.crew.support?.[0] as { billedAs?: string })?.billedAs, "Boilermaker Journeyman");
    const applied = applyEstimateImport(asPack(input), imported);
    const money = livePackMoney(applied);
    assert.equal(money.desk, before);
    assert.equal(money.summary, before);
    const staff = (applied.crew as { staff: CraftRow[] }).staff[0];
    const synced = syncCraftRows([staff], (applied.schedule as PhaseScheduleState).phases);
    assert.equal(synced[0].ranges[0].headcount, 1);
    assert.equal(synced[0].ranges[0].perDiemPeople, 1);
  });

  it("imports HC, PD, Job setup, Position, and Bill as edits", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const support = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.support);
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(staff && support && setup);
    staff.getCell(`${dayCol()}8`).value = 3;
    staff.getCell(`${dayCol()}13`).value = 2;
    staff.getCell("B7").value = "Lead Safety 01";
    staff.getCell("E7").value = "COMP clock";
    support.getCell("B11").value = "Pipefitter Journeyman";
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = new Date(2026, 8, 1);
    setup.getCell("D7").value = new Date(2026, 8, 1);
    setup.getCell("E7").value = 6;
    setup.getCell("F7").value = 12;
    setup.getCell("G7").value = "YES";
    const out = await wb.xlsx.writeBuffer();
    const imported = await parseEstimateXlsx(new Uint8Array(out));
    const applied = applyEstimateImport(asPack(input), imported);
    const crew = applied.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Lead Safety 01");
    assert.equal(crew.staff[0].clockOverride, "comp");
    assert.equal(crew.staff[0].ranges.some((range) => range.headcount === 3), true);
    assert.equal(crew.staff[0].ranges.some((range) => range.perDiemPeople === 2), true);
    assert.equal(crew.support[0].billedAs, "Pipefitter Journeyman");
    const pre = (applied.schedule as PhaseScheduleState).phases.find((row) => row.id === "pre");
    assert.equal(pre?.on, true);
    assert.equal(pre?.start, "2026-09-01");
    assert.equal(pre?.daysPerWeek, 6);
    assert.equal(pre?.hoursPerDay, 12);
    assert.equal(pre?.otAfter8, true);
    const diff = diffEstimateImport(asPack(input), imported);
    assert.equal(diff.createsNew, false);
    assert.equal(diff.lines.some((line) => /Lead Safety|headcount|Bill as|Pre/i.test(line)), true);
  });

  it("imports HPS yellow edits onto hoursPerShift", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    staff.getCell(`${dayCol()}9`).value = 12;
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const row = (applied.crew as { staff: CraftRow[] }).staff[0];
    assert.equal(row.ranges.some((range) => range.hoursPerShift === 12), true);
  });

  it("imports Job setup money drivers onto jobMeta", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B15").value = 155;
    setup.getCell("B16").value = 145;
    setup.getCell("B17").value = 0.85;
    setup.getCell("B18").value = 0.62;
    setup.getCell("B19").value = 8;
    setup.getCell("B20").value = 5;
    setup.getCell("B21").value = 4;
    setup.getCell("B22").value = "YES";
    setup.getCell("B23").value = new Date(2026, 0, 1);
    setup.getCell("B24").value = 3;
    setup.getCell("B25").value = 2;
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    assert.equal(imported.jobMeta?.staffPerDiemRate, 155);
    assert.equal(imported.jobMeta?.craftPerDiemRate, 145);
    assert.equal(imported.jobMeta?.staffMileageRate, 0.85);
    assert.equal(imported.jobMeta?.craftMileageRate, 0.62);
    assert.equal(imported.jobMeta?.laborContingencyPct, 8);
    assert.equal(imported.jobMeta?.equipmentContingencyPct, 5);
    assert.equal(imported.jobMeta?.subsContingencyPct, 4);
    assert.equal(imported.jobMeta?.cbaIncreaseOn, true);
    assert.equal(imported.jobMeta?.cbaIncreaseDate, "2026-01-01");
    assert.equal(imported.jobMeta?.cbaIncreasePct, 3);
    assert.equal(imported.jobMeta?.moreFundPerHour, 2);
    const applied = applyEstimateImport(asPack(input), imported);
    const meta = applied.jobMeta as {
      staffPerDiemRate?: number;
      staffMileageRate?: number;
      laborContingencyPct?: number;
      equipmentContingencyPct?: number;
      subsContingencyPct?: number;
      moreFundPerHour?: number | null;
    };
    assert.equal(meta.staffPerDiemRate, 155);
    assert.equal(meta.staffMileageRate, 0.85);
    assert.equal(meta.laborContingencyPct, 8);
    assert.equal(meta.equipmentContingencyPct, 5);
    assert.equal(meta.subsContingencyPct, 4);
    assert.equal(meta.moreFundPerHour, 2);
  });

  it("cascades illegal back-in-time ON dates on import", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = new Date(2026, 8, 1);
    setup.getCell("D7").value = new Date(2026, 7, 15);
    setup.getCell("B9").value = "ON";
    setup.getCell("C9").value = new Date(2026, 7, 1);
    setup.getCell("D9").value = new Date(2026, 7, 10);
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const pre = imported.schedule.phases.find((row) => row.id === "pre");
    const mech = imported.schedule.phases.find((row) => row.id === "mech");
    assert.equal(pre?.start, "2026-09-01");
    assert.equal(pre?.stop, "2026-09-01");
    assert.equal(mech?.start > (pre?.stop ?? ""), true);
  });

  it("creates a new pack from a filled workbook", async () => {
    const input = fixture();
    const imported = await parseEstimateXlsx(await estimateToXlsx(input));
    const pack = createPackFromImport(imported, "nathan@example.com");
    assert.match(pack.packId, /^new-/);
    assert.equal(pack.title, input.title);
    assert.equal((pack.crew as { staff: CraftRow[] }).staff[0].position, "Superintendent 01");
    assert.equal(diffEstimateImport(null, imported).createsNew, true);
    const money = livePackMoney(pack);
    assert.equal(money.desk, deskPackageTotal(input));
    assert.equal(money.desk, money.summary);
  });

  it("imports filled spare rows on COE, Misc, Equipment Rental, Travel, and Subs", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-1",
            item: "450amp diesel welder",
            period: "daily",
            rate: 134,
            freight: 100,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
          { id: "travel-craft", kind: "craft", source: "crew", headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sb-1", vendor: "ACME", scope: "Scaffold", qty: 2, unit: "LS" as const, rate: 500, affiliate: false }],
        cards: [],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
    const sub = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.sub);
    assert.ok(misc && rental && coe && travel && sub);
    assert.equal(String(travel.getCell("A8").value ?? ""), "Craft");
    assert.notEqual(String(misc.getCell("A7").value ?? ""), "Craft travel");
    misc.getCell("A8").value = "Gasket";
    misc.getCell("B8").value = "Bolt-up";
    misc.getCell("C8").value = 3;
    misc.getCell("D8").value = 12;
    rental.getCell("A8").value = "Light tower";
    rental.getCell("B8").value = "weekly";
    rental.getCell("C8").value = 2;
    rental.getCell("E8").value = 80;
    rental.getCell("F8").value = 10;
    coe.getCell("A8").value = "air-mover";
    coe.getCell("B8").value = "daily";
    coe.getCell("C8").value = 1;
    coe.getCell("E8").value = 50;
    travel.getCell("A9").value = "Staff";
    travel.getCell("B9").value = 1;
    travel.getCell("C9").value = 10;
    travel.getCell("D9").value = 0.7;
    sub.getCell("A8").value = "Bolt-up LLC";
    sub.getCell("B8").value = "flange work";
    sub.getCell("C8").value = 1;
    sub.getCell("D8").value = 800;
    sub.getCell("E8").value = "NO";
    const out = await wb.xlsx.writeBuffer();
    const imported = await parseEstimateXlsx(new Uint8Array(out));
    assert.equal(imported.misc?.length, 2);
    assert.equal(imported.rental?.length, 2);
    assert.equal(imported.coe?.length, 2);
    assert.equal(imported.travel?.some((line) => line.kind === "craft"), true);
    const applied = applyEstimateImport(asPack(input), imported);
    const miscLines = (applied.otherCost as { misc: MiscLine[] }).misc;
    const rentals = (applied.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty;
    const travelLines = (applied.otherCost as { travel: Array<{ kind: string; miles: number }> }).travel;
    const subs = applied.subcontractor as SubSheet;
    assert.equal(imported.misc?.length, 2);
    assert.equal(imported.rental?.length, 2);
    assert.equal(imported.coe?.length, 2);
    assert.equal(imported.subs?.length, 2);
    assert.equal(imported.travel?.some((line) => line.kind === "craft"), true);
    assert.equal(imported.travel?.some((line) => line.miles === 10), true);
    assert.equal(miscLines.length, 2);
    assert.equal(miscLines[1]?.item, "Gasket");
    assert.equal(miscLines[1]?.qty, 3);
    assert.equal(rentals.some((line) => line.item === "Light tower" && line.qty === 2), true);
    assert.equal((applied.equipment as { largeTools: Array<{ itemId: string }> }).largeTools.length, 2);
    assert.equal(miscLines.some((line) => /craft travel/i.test(line.item)), false);
    assert.equal(travelLines.some((line) => line.kind === "staff" && line.miles === 10), true);
    assert.equal(subs.lines.some((line) => line.vendor === "Bolt-up LLC" && line.rate === 800), true);
    const money = livePackMoney(applied);
    assert.equal(money.desk, money.summary);
    assert.equal(money.desk > deskPackageTotal(input), true);
  });

  it("remaps a Period that has no catalog rate on import", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "weekly",
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-ln",
            item: "LN 25 Mig guns",
            period: "monthly",
            rate: 225,
            freight: 50,
            qty: 1,
            ...weekday,
          },
        ],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    assert.ok(rental && coe);
    rental.getCell("B7").value = "daily";
    coe.getCell("B7").value = "hourly";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(
      { ...asPack(input), equipment: input.equipment, otherCost: input.otherCost },
      imported,
    );
    const rentals = (applied.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty;
    const tools = (applied.equipment as { largeTools: LargeToolLine[] }).largeTools;
    const guns = rentals.find((line) => line.item === "LN 25 Mig guns");
    assert.equal(guns?.period, "monthly");
    assert.equal(guns?.rate, 225);
    assert.equal(tools[0]?.period, "monthly");
  });

  it("rejects a workbook that is not a Hit Squad export", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Nope").getCell("A1").value = "hello";
    const bytes = await wb.xlsx.writeBuffer();
    await assert.rejects(() => parseEstimateXlsx(new Uint8Array(bytes)), { message: ESTIMATE_IMPORT_ERROR });
  });

  it("round-trips Aromatics and CAT 2 vault packs with locked desk totals", async () => {
    const vaults = [
      { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", total: 25324671.97 },
      { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", total: 1435365.66 },
    ];
    for (const { file, total } of vaults) {
      if (!existsSync(file)) continue;
      const { pack, input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
      assert.equal(deskEstimateTotal(input), total, file);
      const imported = await parseEstimateXlsx(await estimateToXlsx(input));
      const applied = applyEstimateImport(pack, imported);
      const money = livePackMoney(applied);
      assert.equal(money.desk, total, `${file} after import`);
      assert.equal(money.summary, total, `${file} Summary after import`);
      assert.equal(deskEstimateTotal({ ...input, crew: applied.crew, schedule: applied.schedule }), total, `${file} crew+schedule`);
    }
  });

  it("keeps deskPackageTotal and Summary ESTIMATE TOTAL locked after export→mutate→import", async () => {
    const vaults = [
      { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", total: 25324671.97 },
      { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", total: 1435365.66 },
    ];
    const loaded = vaults.filter((row) => existsSync(row.file));
    const cases = loaded.length
      ? loaded.map((row) => {
          const { pack, input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(row.file, "utf8")));
          return { label: row.file, pack, input, lock: row.total };
        })
      : [
          {
            label: "wood-river-style",
            pack: asPack({
              ...fixture(),
              equipment: {
                largeTools: [],
                thirdParty: [
                  {
                    id: "tp-1",
                    item: "450amp diesel welder",
                    period: "daily" as const,
                    rate: 134,
                    freight: 100,
                    qty: 1,
                    start: "2026-09-01",
                    end: "2026-09-01",
                  },
                ],
              },
              otherCost: {
                perDiemRate: 0,
                travel: [
                  { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
                  { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
                ],
                misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
              },
              jobMeta: {
                ...fixture().jobMeta,
                laborContingencyPct: 2,
              },
            }),
            input: {
              ...fixture(),
              equipment: {
                largeTools: [],
                thirdParty: [
                  {
                    id: "tp-1",
                    item: "450amp diesel welder",
                    period: "daily" as const,
                    rate: 134,
                    freight: 100,
                    qty: 1,
                    start: "2026-09-01",
                    end: "2026-09-01",
                  },
                ],
              },
              otherCost: {
                perDiemRate: 0,
                travel: [
                  { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
                  { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
                ],
                misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
              },
              jobMeta: {
                ...fixture().jobMeta,
                laborContingencyPct: 2,
              },
            },
            lock: deskPackageTotal({
              ...fixture(),
              equipment: {
                largeTools: [],
                thirdParty: [
                  {
                    id: "tp-1",
                    item: "450amp diesel welder",
                    period: "daily" as const,
                    rate: 134,
                    freight: 100,
                    qty: 1,
                    start: "2026-09-01",
                    end: "2026-09-01",
                  },
                ],
              },
              otherCost: {
                perDiemRate: 0,
                travel: [
                  { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
                  { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
                ],
                misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
              },
              jobMeta: { ...fixture().jobMeta, laborContingencyPct: 2 },
            }),
          },
        ];
    for (const { label, pack, input, lock } of cases) {
      const bytes = await estimateToXlsx(input);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(bytes));
      const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
      const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
      const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
      const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
      assert.ok(staff && setup);
      staff.getCell(`${dayCol()}8`).value = (Number(staff.getCell(`${dayCol()}8`).value) || 0) + 1;
      setup.getCell("B19").value = (Number(setup.getCell("B19").value) || 0) + 1;
      if (misc) {
        const spareRow = 8;
        if (!String(misc.getCell(`A${spareRow}`).value ?? "").trim()) {
          misc.getCell(`A${spareRow}`).value = "Import gasket";
          misc.getCell(`C${spareRow}`).value = 2;
          misc.getCell(`D${spareRow}`).value = 15;
        }
      }
      if (travel) {
        const firstMiles = travel.getCell("C7");
        firstMiles.value = (Number(firstMiles.value) || 0) + 5;
      }
      const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
      const applied = applyEstimateImport(pack, imported);
      const money = livePackMoney(applied);
      assert.equal(money.desk, money.summary, `${label} desk vs Summary`);
      assert.notEqual(money.desk, lock, `${label} mutate must move money`);
    }
  });

  function assertFiniteMoney(applied: ReturnType<typeof applyEstimateImport>, label: string) {
    const money = livePackMoney(applied);
    assert.equal(Number.isFinite(money.desk), true, `${label} desk finite`);
    assert.equal(Number.isFinite(money.summary), true, `${label} Summary finite`);
    assert.equal(money.desk, money.summary, `${label} desk vs Summary`);
    return money;
  }

  it("Nathan blank-abuse: cleared HC/PD/spares/MORE cannot NaN or #VALUE! the rail", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      jobMeta: { ...fixture().jobMeta, moreFundPerHour: 2, laborContingencyPct: 5 },
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-1",
            item: "450amp diesel welder",
            period: "daily",
            rate: 134,
            freight: 100,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [{ id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 }],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    assert.ok(staff && setup && misc && rental);
    staff.getCell(`${dayCol()}8`).value = null;
    staff.getCell(`${dayCol()}13`).value = null;
    staff.getCell(`${dayCol()}10`).value = "typed-over";
    setup.getCell("B25").value = null;
    misc.getCell("C8").value = null;
    misc.getCell("D8").value = null;
    rental.getCell("C8").value = "";
    rental.getCell("E8").value = "";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const money = assertFiniteMoney(applied, "blank-abuse");
    assert.equal(imported.jobMeta?.moreFundPerHour, null);
    assert.equal(money.desk >= 0, true);
  });

  it("Nathan blank Position / Bill as keeps the live pack titles", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const support = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.support);
    assert.ok(staff && support);
    staff.getCell("B7").value = "";
    support.getCell("B11").value = "   ";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const crew = applied.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Superintendent 01");
    assert.equal(crew.support[0].billedAs, "Boilermaker Journeyman");
    assertFiniteMoney(applied, "blank-titles");
  });

  it("Nathan illegal dates and junk CBA do not corrupt Job setup", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = "not-a-date";
    setup.getCell("D7").value = new Date(2026, 6, 1);
    setup.getCell("B23").value = "junk";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const pre = imported.schedule.phases.find((row) => row.id === "pre");
    const mech = imported.schedule.phases.find((row) => row.id === "mech");
    assert.ok(pre && mech);
    assert.equal(pre.on, true);
    assert.equal(Boolean(pre.start), true);
    assert.equal(pre.stop >= pre.start, true);
    assert.equal(mech.start >= pre.stop, true);
    assert.equal(imported.jobMeta?.cbaIncreaseDate, "");
    assertFiniteMoney(applyEstimateImport(asPack(input), imported), "illegal-dates");
  });

  it("Nathan blank/unknown Period remaps instead of inventing a rate", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "weekly",
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-ln",
            item: "LN 25 Mig guns",
            period: "monthly",
            rate: 225,
            freight: 50,
            qty: 1,
            ...weekday,
          },
        ],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    assert.ok(rental && coe);
    rental.getCell("B7").value = "";
    coe.getCell("B7").value = "hourly-ish";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const guns = (applied.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty.find((line) => line.item === "LN 25 Mig guns");
    const tool = (applied.equipment as { largeTools: LargeToolLine[] }).largeTools[0];
    assert.ok(guns && tool);
    assert.notEqual(guns.period, "");
    assert.notEqual(tool.period, "hourly-ish");
    assertFiniteMoney(applied, "period-havoc");
  });

  it("Nathan money-driver extremes still lock desk to Summary", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B19").value = "";
    setup.getCell("B20").value = 250;
    setup.getCell("B21").value = 0;
    setup.getCell("B22").value = "NO";
    setup.getCell("B25").value = 0;
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    assert.equal(imported.jobMeta?.laborContingencyPct, 0);
    assert.equal(imported.jobMeta?.equipmentContingencyPct, 250);
    assert.equal(imported.jobMeta?.cbaIncreaseOn, false);
    assertFiniteMoney(applyEstimateImport(asPack(input), imported), "money-extremes");
  });

  it("Nathan halfway spare row and craft-travel stay off Misc on the second UP", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
          { id: "travel-craft", kind: "craft", source: "crew", headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    assert.ok(misc);
    misc.getCell("A8").value = "Halfway gasket";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const miscLines = (applied.otherCost as { misc: MiscLine[] }).misc;
    assert.equal(miscLines.some((line) => /halfway gasket/i.test(line.item)), false);
    assert.equal(miscLines.some((line) => /craft travel/i.test(line.item)), false);
    assert.equal(imported.travel?.some((line) => line.kind === "craft"), true);
    const money = assertFiniteMoney(applied, "halfway-spare");
    const secondUp = estimateWorkbookSummaryTotal({
      title: applied.title,
      client: applied.client,
      site: applied.site,
      crew: applied.crew,
      schedule: applied.schedule,
      jobMeta: applied.jobMeta,
      equipment: applied.equipment,
      otherCost: applied.otherCost,
      subcontractor: applied.subcontractor,
    });
    assert.equal(secondUp, money.desk);
  });

  it("DOWN: craft travel keeps craft identity and import-twice does not drift money", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
          { id: "travel-craft", kind: "craft", source: "crew", headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
    };
    const first = applyEstimateImport(asPack(input), await parseEstimateXlsx(await estimateToXlsx(input)));
    const travel = (first.otherCost as { travel: Array<{ id: string; kind: string; miles: number; source: string }> }).travel;
    assert.equal(travel.find((line) => line.kind === "staff")?.id, "travel-staff");
    assert.equal(travel.find((line) => line.kind === "craft")?.id, "travel-craft");
    assert.equal(travel.find((line) => line.kind === "craft")?.source, "crew");
    assert.equal(travel.find((line) => line.kind === "craft")?.miles, 20);
    const once = livePackMoney(first);
    const second = applyEstimateImport(first, await parseEstimateXlsx(await estimateToXlsx({
      title: first.title,
      client: first.client,
      site: first.site,
      crew: first.crew,
      schedule: first.schedule,
      jobMeta: first.jobMeta,
      equipment: first.equipment,
      otherCost: first.otherCost,
      subcontractor: first.subcontractor,
    })));
    const twice = livePackMoney(second);
    assert.equal(once.desk, twice.desk);
    assert.equal(twice.desk, twice.summary);
    assert.equal((second.otherCost as { travel: Array<{ id: string }> }).travel.find((line) => line.id === "travel-craft")?.id, "travel-craft");
  });

  it("DOWN: Position change after hours plus Bill as flip still locks the rail", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const support = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.support);
    assert.ok(staff && support);
    staff.getCell("B7").value = "Project Manager 01";
    staff.getCell(`${dayCol()}8`).value = 2;
    support.getCell("B11").value = "Superintendent 01";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const crew = applied.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Project Manager 01");
    assert.equal(crew.staff[0].ranges.some((range) => range.headcount === 2), true);
    assert.equal(crew.support[0].billedAs, "Superintendent 01");
    assertFiniteMoney(applied, "position-after-hours");
  });

  it("DOWN: Periods edit on rental and COE ripples billed days and desk money", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-1",
            item: "450amp diesel welder",
            period: "daily",
            rate: 134,
            freight: 100,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
    };
    const before = deskPackageTotal(input);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    assert.ok(rental && coe);
    rental.getCell("D7").value = 5;
    coe.getCell("D7").value = 3;
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const tools = (applied.equipment as { largeTools: LargeToolLine[]; thirdParty: ThirdPartyLine[] }).largeTools;
    const third = (applied.equipment as { largeTools: LargeToolLine[]; thirdParty: ThirdPartyLine[] }).thirdParty;
    assert.equal(billedPeriodCount(tools[0]!.start, tools[0]!.end, tools[0]!.period), 3);
    assert.equal(billedPeriodCount(third[0]!.start, third[0]!.end, third[0]!.period), 5);
    const money = livePackMoney(applied);
    assert.equal(money.desk, money.summary);
    assert.equal(money.desk > before, true);
  });

  it("DOWN: create-new keeps wet vs dry COE identity from the hidden item id", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-wet",
            itemId: "wet:8:truck-crew",
            period: "daily",
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
          {
            id: "lt-dry",
            itemId: "dry:40:truck-crew",
            period: "daily",
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [],
      },
    };
    const before = deskPackageTotal(input);
    const pack = createPackFromImport(await parseEstimateXlsx(await estimateToXlsx(input)));
    const tools = (pack.equipment as { largeTools: LargeToolLine[] }).largeTools;
    assert.equal(tools.some((line) => line.itemId.startsWith("wet:")), true);
    assert.equal(tools.some((line) => line.itemId.startsWith("dry:")), true);
    const money = livePackMoney(pack);
    assert.equal(money.desk, before);
    assert.equal(money.desk, money.summary);
  });

  it("Robert create-new from Aromatics and CAT 2 must hit the same desk rail", async () => {
    const vaults = [
      { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", total: 25324671.97 },
      { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", total: 1435365.66 },
    ];
    for (const { file, total } of vaults) {
      if (!existsSync(file)) continue;
      const { input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
      const pack = createPackFromImport(await parseEstimateXlsx(await estimateToXlsx(input)));
      const money = livePackMoney(pack);
      assert.equal(money.desk, money.summary, `${file} create-new desk===Summary`);
      assert.equal(money.desk, total, `${file} create-new desk`);
    }
  });

  it("UP then DOWN: Aromatics and CAT 2 line money and a second import stay on the rail", async () => {
    const vaults = [
      { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", total: 25324671.97 },
      { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", total: 1435365.66 },
    ];
    for (const { file, total } of vaults) {
      if (!existsSync(file)) continue;
      const { pack, input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
      assert.equal(deskEstimateTotal(input), total, file);
      assert.equal(estimateWorkbookSummaryTotal(input), total, `${file} first UP`);
      const imported = await parseEstimateXlsx(await estimateToXlsx(input));
      const applied = applyEstimateImport(pack, imported);
      const first = livePackMoney(applied);
      assert.equal(first.desk, total, `${file} after DOWN`);
      assert.equal(first.summary, total, `${file} second UP`);
      const again = applyEstimateImport(applied, await parseEstimateXlsx(await estimateToXlsx({
        title: applied.title,
        client: applied.client,
        site: applied.site,
        crew: applied.crew,
        schedule: applied.schedule,
        jobMeta: applied.jobMeta,
        equipment: applied.equipment,
        otherCost: applied.otherCost,
        subcontractor: applied.subcontractor,
      })));
      assert.equal(livePackMoney(again).desk, total, `${file} import twice`);
    }
  });

  function richPack(): EstimateXlsxInput {
    return {
      ...fixture(),
      jobMeta: {
        ...fixture().jobMeta,
        moreFundPerHour: 2,
        laborContingencyPct: 5,
        equipmentContingencyPct: 3,
        cbaIncreaseOn: false,
      },
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-1",
            item: "450amp diesel welder",
            period: "daily",
            rate: 134,
            freight: 100,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
          {
            id: "tp-ln",
            item: "LN 25 Mig guns",
            period: "monthly",
            rate: 225,
            freight: 50,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 },
          { id: "travel-craft", kind: "craft", source: "crew", headcount: 2, travelers: 2, perMile: 0.5, miles: 20 },
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sb-1", vendor: "ACME", scope: "Scaffold", qty: 2, unit: "LS" as const, rate: 500, affiliate: false }],
        cards: [],
      },
    };
  }

  function bakeFormulas(wb: ExcelJS.Workbook, garbage = 999) {
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const value = cell.value as { formula?: string; sharedFormula?: string; result?: unknown } | string | number | null;
          const formula =
            (value && typeof value === "object" && (value.formula || value.sharedFormula)) ||
            (typeof value === "string" && value.startsWith("="));
          if (!formula) return;
          const result = value && typeof value === "object" ? value.result : undefined;
          cell.value = typeof result === "number" && Number.isFinite(result) ? garbage : garbage;
        });
      });
    }
  }

  it("CHAOS blank-abuse: wipe HC/HPS/ST/OT/DT/PD, live qty/rates, and MORE — rail stays finite", async () => {
    const input = richPack();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    const sub = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.sub);
    assert.ok(staff && setup && misc && rental && coe && sub);
    const day = dayCol();
    const title = 7;
    staff.getCell(`${day}${title + LABOR_HC_OFFSET}`).value = null;
    staff.getCell(`${day}${title + LABOR_HPS_OFFSET}`).value = "";
    staff.getCell(`${day}${title + LABOR_ST_OFFSET}`).value = null;
    staff.getCell(`${day}${title + LABOR_OT_OFFSET}`).value = "#VALUE!";
    staff.getCell(`${day}${title + LABOR_DT_OFFSET}`).value = { error: "#VALUE!" };
    staff.getCell(`${day}${title + LABOR_PD_OFFSET}`).value = null;
    setup.getCell(JOB_SETUP_MORE_CELL).value = "";
    misc.getCell("C7").value = null;
    misc.getCell("D7").value = "";
    rental.getCell("C7").value = null;
    rental.getCell("E7").value = "";
    coe.getCell("C7").value = 0;
    sub.getCell("C7").value = null;
    sub.getCell("D7").value = "";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const applied = applyEstimateImport(asPack(input), imported);
    const money = assertFiniteMoney(applied, "chaos-blank");
    assert.equal(imported.jobMeta?.moreFundPerHour, null);
    const secondUp = estimateWorkbookSummaryTotal({
      title: applied.title,
      client: applied.client,
      site: applied.site,
      crew: applied.crew,
      schedule: applied.schedule,
      jobMeta: applied.jobMeta,
      equipment: applied.equipment,
      otherCost: applied.otherCost,
      subcontractor: applied.subcontractor,
    });
    assert.equal(secondUp, money.desk);
  });

  it("CHAOS illegal dates: Stop before Start and non-dates cascade, never corrupt", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = new Date(2026, 8, 10);
    setup.getCell("D7").value = new Date(2026, 8, 1);
    setup.getCell("C9").value = "32/13/2026";
    setup.getCell("D9").value = "n/a";
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const pre = imported.schedule.phases.find((row) => row.id === "pre");
    const mech = imported.schedule.phases.find((row) => row.id === "mech");
    assert.ok(pre && mech);
    assert.equal(pre.stop >= pre.start, true);
    assert.equal(mech.start >= pre.stop, true);
    assert.equal(mech.stop >= mech.start, true);
    assertFiniteMoney(applyEstimateImport(asPack(input), imported), "chaos-dates");
  });

  it("CHAOS Period havoc: daily-only and monthly-only forced the wrong way still remap", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-ln",
            item: "LN 25 Mig guns",
            period: "monthly",
            rate: 225,
            freight: 50,
            qty: 1,
            ...weekday,
          },
          {
            id: "tp-clamps",
            item: "German saw clamps",
            period: "weekly",
            rate: 56,
            freight: 25,
            qty: 1,
            ...weekday,
          },
        ],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    assert.ok(rental && coe);
    rental.getCell("B7").value = "weekly";
    rental.getCell("B8").value = "daily";
    coe.getCell("B7").value = "hourly";
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const third = (applied.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty;
    const guns = third.find((line) => line.item === "LN 25 Mig guns");
    const clamps = third.find((line) => line.item === "German saw clamps");
    const tool = (applied.equipment as { largeTools: LargeToolLine[] }).largeTools[0];
    assert.equal(guns?.period, "monthly");
    assert.equal(guns?.rate, 225);
    assert.notEqual(clamps?.period, "daily");
    assert.notEqual(tool?.period, "hourly");
    assertFiniteMoney(applied, "chaos-period");
  });

  it("CHAOS Position mid-block and Bill as craft↔staff stay sane", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const support = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.support);
    assert.ok(staff && support);
    staff.getCell("B8").value = "Boilermaker Journeyman";
    staff.getCell("B7").value = "Project Manager 01";
    support.getCell("B11").value = "Superintendent 01";
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const crew = applied.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Project Manager 01");
    assert.equal(crew.support[0].billedAs, "Superintendent 01");
    assert.equal(crew.support[0].position, "Fire Watch");
    assertFiniteMoney(applied, "chaos-position");
  });

  it("CHAOS money drivers: zero PD/mileage, CBA on, MORE 0 — desk matches Summary", async () => {
    const input = richPack();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell(JOB_SETUP_STAFF_PD_CELL).value = 0;
    setup.getCell(JOB_SETUP_CRAFT_PD_CELL).value = 0;
    setup.getCell(JOB_SETUP_STAFF_MILE_CELL).value = 0;
    setup.getCell(JOB_SETUP_CRAFT_MILE_CELL).value = 0;
    setup.getCell(JOB_SETUP_LABOR_CONT_CELL).value = 0;
    setup.getCell(JOB_SETUP_CBA_ON_CELL).value = "YES";
    setup.getCell(JOB_SETUP_CBA_DATE_CELL).value = new Date(2026, 8, 1);
    setup.getCell(JOB_SETUP_MORE_CELL).value = 0;
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    assert.equal(imported.jobMeta?.staffPerDiemRate, 0);
    assert.equal(imported.jobMeta?.craftMileageRate, 0);
    assert.equal(imported.jobMeta?.cbaIncreaseOn, true);
    assert.equal(imported.jobMeta?.moreFundPerHour, 0);
    assertFiniteMoney(applyEstimateImport(asPack(input), imported), "chaos-money");
  });

  it("CHAOS formula-strip: baked ST/OT/DT and sheet totals still DOWN from typed inputs", async () => {
    const input = richPack();
    const clean = applyEstimateImport(asPack(input), await parseEstimateXlsx(await estimateToXlsx(input)));
    const expected = livePackMoney(clean).desk;
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    bakeFormulas(wb, 999);
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const money = assertFiniteMoney(applied, "chaos-bake");
    assert.equal(money.desk, expected);
    const crew = applied.crew as { staff: CraftRow[] };
    assert.equal(crew.staff[0].ranges.some((range) => range.headcount === 1), true);
  });

  it("CHAOS round-trip thrash: mutate several sheets on Aromatics and CAT 2, second UP matches desk", async () => {
    const vaults = [
      { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", total: 25324671.97 },
      { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", total: 1435365.66 },
    ];
    for (const { file, total } of vaults) {
      if (!existsSync(file)) continue;
      const { pack, input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
      const bytes = await estimateToXlsx(input);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(bytes));
      const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
      const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
      const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
      const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
      const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
      const sub = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.sub);
      assert.ok(staff && setup);
      staff.getCell(`${dayCol()}8`).value = (Number(staff.getCell(`${dayCol()}8`).value) || 0) + 1;
      setup.getCell(JOB_SETUP_LABOR_CONT_CELL).value = (Number(setup.getCell(JOB_SETUP_LABOR_CONT_CELL).value) || 0) + 1;
      if (misc && !String(misc.getCell("A8").value ?? "").trim()) {
        misc.getCell("A8").value = "Chaos gasket";
        misc.getCell("C8").value = 2;
        misc.getCell("D8").value = 11;
      }
      if (travel) travel.getCell("C7").value = (Number(travel.getCell("C7").value) || 0) + 3;
      if (rental) rental.getCell("C7").value = (Number(rental.getCell("C7").value) || 1) + 1;
      if (sub) sub.getCell("C7").value = (Number(sub.getCell("C7").value) || 1) + 1;
      const applied = applyEstimateImport(pack, await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
      const money = assertFiniteMoney(applied, `${file} chaos-thrash`);
      assert.notEqual(money.desk, total, `${file} thrash must move money`);
      const miscItems = (applied.otherCost as { misc: MiscLine[] }).misc ?? [];
      assert.equal(miscItems.some((line) => /craft travel/i.test(line.item)), false);
      const secondUp = estimateWorkbookSummaryTotal({
        title: applied.title,
        client: applied.client,
        site: applied.site,
        crew: applied.crew,
        schedule: applied.schedule,
        jobMeta: applied.jobMeta,
        equipment: applied.equipment,
        otherCost: applied.otherCost,
        subcontractor: applied.subcontractor,
      });
      assert.equal(secondUp, money.desk, `${file} second UP`);
    }
  });

  function secondUpFrom(applied: ReturnType<typeof applyEstimateImport>) {
    return estimateWorkbookSummaryTotal({
      title: applied.title,
      client: applied.client,
      site: applied.site,
      crew: applied.crew,
      schedule: applied.schedule,
      jobMeta: applied.jobMeta,
      equipment: applied.equipment,
      otherCost: applied.otherCost,
      subcontractor: applied.subcontractor,
    });
  }

  it("Nathan half-fill a day: blank HPS keeps the live Hours/shift", async () => {
    const input = fixture();
    const before = deskPackageTotal(input);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    staff.getCell(`${dayCol()}${7 + LABOR_HPS_OFFSET}`).value = null;
    staff.getCell(`${dayCol()}${7 + LABOR_PD_OFFSET}`).value = null;
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const row = (applied.crew as { staff: CraftRow[] }).staff[0];
    assert.equal(row.ranges[0]?.hoursPerShift, 10);
    assert.equal(row.ranges[0]?.perDiemPeople, 0);
    const money = assertFiniteMoney(applied, "nathan-half-fill");
    assert.equal(money.desk < before, true);
    assert.equal(secondUpFrom(applied), money.desk);
  });

  it("Nathan halfway Travel spare without Kind does not invent staff miles", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      otherCost: {
        perDiemRate: 0,
        travel: [{ id: "travel-staff", kind: "staff", source: "crew", headcount: 1, travelers: 1, perMile: 0.7, miles: 40 }],
        misc: [],
      },
    };
    const before = deskPackageTotal(input);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
    assert.ok(travel);
    travel.getCell("B8").value = 2;
    travel.getCell("C8").value = 80;
    travel.getCell("D8").value = 0.7;
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const lines = (applied.otherCost as { travel: Array<{ kind: string; miles: number }> }).travel;
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.miles, 40);
    assert.equal(livePackMoney(applied).desk, before);
  });

  it("Nathan halfway Misc name-only does not add a $0 desk row", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      otherCost: { perDiemRate: 0, travel: [], misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }] },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    assert.ok(misc);
    misc.getCell("A8").value = "Halfway gasket";
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const lines = (applied.otherCost as { misc: MiscLine[] }).misc;
    assert.equal(lines.some((line) => /halfway/i.test(line.item)), false);
    assert.equal(lines.length, 1);
    assertFiniteMoney(applied, "nathan-misc-halfway");
  });

  it("Nathan spare TRUCK CREW with the wet daily rate stays wet", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily",
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    assert.ok(coe);
    coe.getCell("A8").value = "TRUCK CREW";
    coe.getCell("B8").value = "daily";
    coe.getCell("C8").value = 1;
    coe.getCell("D8").value = 1;
    coe.getCell("E8").value = 184;
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const tools = (applied.equipment as { largeTools: LargeToolLine[] }).largeTools;
    const truck = tools.find((line) => /truck-crew/i.test(line.itemId));
    assert.ok(truck);
    assert.match(truck.itemId, /^wet:/);
    assertFiniteMoney(applied, "nathan-wet-truck");
  });

  it("Nathan puts Craft travel on Misc as a dumb label — second UP stays off Misc", async () => {
    const input: EstimateXlsxInput = {
      ...fixture(),
      otherCost: {
        perDiemRate: 0,
        travel: [{ id: "travel-craft", kind: "craft", source: "crew", headcount: 2, travelers: 2, perMile: 0.5, miles: 20 }],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
      },
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    assert.ok(misc);
    misc.getCell("A8").value = "Craft travel (miles)";
    misc.getCell("C8").value = 2;
    misc.getCell("D8").value = 90;
    const applied = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const lines = (applied.otherCost as { misc: MiscLine[] }).misc;
    assert.equal(lines.some((line) => /craft\s*travel/i.test(line.item)), false);
    const money = assertFiniteMoney(applied, "nathan-craft-on-misc");
    assert.equal(secondUpFrom(applied), money.desk);
  });

  it("Nathan combo: Position after hours, Bill as, backward date, bad Period, typed ST, import twice", async () => {
    const input = richPack();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const support = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.support);
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    assert.ok(staff && support && setup && rental && misc);
    staff.getCell("B7").value = "Project Manager 01";
    staff.getCell(`${dayCol()}${7 + LABOR_HC_OFFSET}`).value = 2;
    staff.getCell(`${dayCol()}${7 + LABOR_ST_OFFSET}`).value = 99;
    support.getCell("B11").value = "Superintendent 01";
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = new Date(2026, 8, 10);
    setup.getCell("D7").value = new Date(2026, 8, 1);
    rental.getCell("B8").value = "daily";
    misc.getCell("A8").value = "Craft Travel $";
    misc.getCell("C8").value = 1;
    misc.getCell("D8").value = 50;
    const first = applyEstimateImport(asPack(input), await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const crew = first.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Project Manager 01");
    assert.equal(crew.staff[0].ranges.some((range) => range.headcount === 2), true);
    assert.equal(crew.support[0].billedAs, "Superintendent 01");
    const pre = (first.schedule as PhaseScheduleState).phases.find((row) => row.id === "pre");
    assert.ok(pre);
    assert.equal(pre.stop >= pre.start, true);
    const guns = (first.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty.find((line) => line.item === "LN 25 Mig guns");
    assert.equal(guns?.period, "monthly");
    assert.equal(((first.otherCost as { misc: MiscLine[] }).misc ?? []).some((line) => /craft\s*travel/i.test(line.item)), false);
    const once = assertFiniteMoney(first, "nathan-combo-1");
    const second = applyEstimateImport(first, await parseEstimateXlsx(await estimateToXlsx({
      title: first.title,
      client: first.client,
      site: first.site,
      crew: first.crew,
      schedule: first.schedule,
      jobMeta: first.jobMeta,
      equipment: first.equipment,
      otherCost: first.otherCost,
      subcontractor: first.subcontractor,
    })));
    const twice = livePackMoney(second);
    assert.equal(twice.desk, once.desk);
    assert.equal(twice.desk, twice.summary);
    assert.equal(secondUpFrom(second), twice.desk);
  });

  function stackedHiring(): EstimateXlsxInput {
    const base = fixture();
    return {
      ...base,
      crew: {
        staff: [
          {
            ...craft("st-stack", "Superintendent 01", { start: "2026-09-01", end: "2026-09-10", otAfter8: false }),
            ranges: [
              {
                id: "rg-base",
                start: "2026-09-01",
                end: "2026-09-10",
                headcount: 2,
                nightHeadcount: 0,
                hoursPerShift: 10,
                perDiemPeople: 2,
                days: [false, true, true, true, true, true, false],
                otAfter8: false,
                phaseId: "mech",
                shift: "Days",
              },
              {
                id: "rg-hire",
                start: "2026-09-03",
                end: "2026-09-10",
                headcount: 3,
                nightHeadcount: 0,
                hoursPerShift: 8,
                perDiemPeople: 3,
                days: [false, true, true, true, true, true, false],
                otAfter8: true,
                phaseId: "mech",
                shift: "Days",
              },
            ],
          },
        ],
        direct: [],
        support: [],
        otAfter8: true,
      },
      schedule: {
        ...base.schedule,
        phases: defaultPhases().map((phase) =>
          phase.id === "mech"
            ? { ...phase, on: true, start: "2026-09-01", stop: "2026-09-10", daysPerWeek: 5, hoursPerDay: 10, otAfter8: true }
            : { ...phase, on: false },
        ),
      },
    };
  }

  it("UP: hidden _CrewRanges is a view of live hiring-progression stacks", async () => {
    const bytes = await estimateToXlsx(stackedHiring());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const helper = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crewRanges);
    assert.ok(helper);
    assert.equal(helper.state, "veryHidden");
    const ids: string[] = [];
    helper.eachRow((row, index) => {
      if (index === 1) return;
      ids.push(String(row.getCell(2).value ?? ""));
    });
    assert.equal(ids.includes("rg-base"), true);
    assert.equal(ids.includes("rg-hire"), true);
  });

  it("Robert create-new keeps stacked hiring-progression Hours/shift and OT after 8", async () => {
    const input = stackedHiring();
    const before = deskPackageTotal(input);
    const pack = createPackFromImport(await parseEstimateXlsx(await estimateToXlsx(input)));
    const ranges = (pack.crew as { staff: CraftRow[] }).staff[0].ranges;
    assert.equal(ranges.some((range) => range.id === "rg-base" && range.hoursPerShift === 10 && range.otAfter8 === false), true);
    assert.equal(ranges.some((range) => range.id === "rg-hire" && range.hoursPerShift === 8 && range.otAfter8 === true && range.headcount === 3), true);
    const money = livePackMoney(pack);
    assert.equal(money.desk, before);
    assert.equal(money.desk, money.summary);
  });

  it("Nathan edits stacked HC: create-new follows the grid, not the hidden stacks", async () => {
    const input = stackedHiring();
    const before = deskPackageTotal(input);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    staff.getCell(`${dayCol(2)}${7 + LABOR_HC_OFFSET}`).value = 1;
    const pack = createPackFromImport(await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const ranges = (pack.crew as { staff: CraftRow[] }).staff[0].ranges;
    assert.equal(ranges.some((range) => range.id === "rg-hire" && range.headcount === 3), false);
    const money = assertFiniteMoney(pack, "nathan-edit-stacked-hc");
    assert.notEqual(money.desk, before);
    assert.equal(money.desk, money.summary);
  });

  it("Nathan deletes _CrewRanges: create-new still imports; Aromatics labor leaves the desk rail", async () => {
    const file = "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json";
    if (!existsSync(file)) return;
    const { input } = estimateJsonToXlsxInput(JSON.parse(readFileSync(file, "utf8")));
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const helper = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crewRanges);
    assert.ok(helper);
    wb.removeWorksheet(helper.id);
    const pack = createPackFromImport(await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer())));
    const money = assertFiniteMoney(pack, "nathan-delete-crew-ranges");
    assert.equal(money.desk, money.summary);
    assert.notEqual(money.desk, 25324671.97);
  });
});
