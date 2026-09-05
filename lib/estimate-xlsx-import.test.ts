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
} from "./estimate-pack-xlsx.ts";
import {
  ESTIMATE_XLSX_SHEETS,
  LABOR_DATE_START_COL,
  estimateToXlsx,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import type { MiscLine } from "./other-cost.ts";
import type { ThirdPartyLine } from "./equipment-sheet.ts";
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
  };
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
    assert.equal(deskPackageTotal({ ...input, crew: applied.crew, schedule: applied.schedule }), before);
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

  it("imports Job setup money drivers onto jobMeta", async () => {
    const input = fixture();
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const setup = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
    assert.ok(setup);
    setup.getCell("B15").value = 155;
    setup.getCell("B16").value = 145;
    setup.getCell("B19").value = 8;
    setup.getCell("B22").value = "YES";
    setup.getCell("B23").value = new Date(2026, 0, 1);
    setup.getCell("B24").value = 3;
    setup.getCell("B25").value = 2;
    const imported = await parseEstimateXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    assert.equal(imported.jobMeta?.staffPerDiemRate, 155);
    assert.equal(imported.jobMeta?.craftPerDiemRate, 145);
    assert.equal(imported.jobMeta?.laborContingencyPct, 8);
    assert.equal(imported.jobMeta?.cbaIncreaseOn, true);
    assert.equal(imported.jobMeta?.cbaIncreaseDate, "2026-01-01");
    assert.equal(imported.jobMeta?.cbaIncreasePct, 3);
    assert.equal(imported.jobMeta?.moreFundPerHour, 2);
    const applied = applyEstimateImport(asPack(input), imported);
    const meta = applied.jobMeta as { staffPerDiemRate?: number; laborContingencyPct?: number; moreFundPerHour?: number | null };
    assert.equal(meta.staffPerDiemRate, 155);
    assert.equal(meta.laborContingencyPct, 8);
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
    const imported = await parseEstimateXlsx(await estimateToXlsx(fixture()));
    const pack = createPackFromImport(imported, "nathan@example.com");
    assert.match(pack.packId, /^new-/);
    assert.equal(pack.title, fixture().title);
    assert.equal((pack.crew as { staff: CraftRow[] }).staff[0].position, "Superintendent 01");
    assert.equal(diffEstimateImport(null, imported).createsNew, true);
  });

  it("imports filled spare rows on COE, Misc, and Equipment Rental", async () => {
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
    };
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const coe = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe);
    const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
    assert.ok(misc && rental && coe && travel);
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
    const out = await wb.xlsx.writeBuffer();
    const imported = await parseEstimateXlsx(new Uint8Array(out));
    assert.equal(imported.misc?.length, 2);
    assert.equal(imported.rental?.length, 2);
    assert.equal(imported.coe?.length, 2);
    assert.equal(imported.travel?.some((line) => line.kind === "craft"), true);
    const applied = applyEstimateImport(
      { ...asPack(input), equipment: input.equipment, otherCost: input.otherCost },
      imported,
    );
    const miscLines = (applied.otherCost as { misc: MiscLine[] }).misc;
    const rentals = (applied.equipment as { thirdParty: ThirdPartyLine[] }).thirdParty;
    assert.equal(miscLines.length, 2);
    assert.equal(miscLines[1]?.item, "Gasket");
    assert.equal(miscLines[1]?.qty, 3);
    assert.equal(rentals.some((line) => line.item === "Light tower" && line.qty === 2), true);
    assert.equal((applied.equipment as { largeTools: Array<{ itemId: string }> }).largeTools.length, 2);
    assert.equal(miscLines.some((line) => /craft travel/i.test(line.item)), false);
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
      assert.equal(
        deskEstimateTotal({ ...input, crew: applied.crew, schedule: applied.schedule }),
        total,
        `${file} after import`,
      );
    }
  });
});
