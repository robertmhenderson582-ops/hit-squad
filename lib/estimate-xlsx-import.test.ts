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
  packSnapshotToXlsxInput,
  deskEstimateTotal,
} from "./estimate-pack-xlsx.ts";
import {
  ESTIMATE_XLSX_SHEETS,
  LABOR_DATE_START_COL,
  estimateToXlsx,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import { colLetter } from "./xlsx-minimal.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import type { CraftRow } from "./craft-labor.ts";
import type { PhaseScheduleState } from "./phase-schedule.ts";

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
      phases: [
        {
          id: "mech",
          name: "Mechanical Window",
          on: true,
          start: "2026-09-01",
          stop: "2026-09-01",
          daysPerWeek: 5,
          hoursPerDay: 10,
          otAfter8: true,
          sundaysOff: [],
        },
      ],
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
    assert.equal(imported.crew.staff?.[0]?.position, "Superintendent 01");
    assert.equal(imported.crew.support?.[0] && "billedAs" in imported.crew.support[0], true);
    assert.equal((imported.crew.support?.[0] as { billedAs?: string })?.billedAs, "Boilermaker Journeyman");
    const applied = applyEstimateImport(asPack(input), imported);
    const after = packSnapshotToXlsxInput(applied);
    assert.equal(deskEstimateTotal(after), before);
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
    support.getCell("B11").value = "Pipefitter Journeyman";
    setup.getCell("B7").value = "ON";
    setup.getCell("C7").value = new Date(2026, 8, 1);
    setup.getCell("D7").value = new Date(2026, 8, 1);
    const out = await wb.xlsx.writeBuffer();
    const imported = await parseEstimateXlsx(new Uint8Array(out));
    const applied = applyEstimateImport(asPack(input), imported);
    const crew = applied.crew as { staff: CraftRow[]; support: Array<CraftRow & { billedAs?: string }> };
    assert.equal(crew.staff[0].position, "Lead Safety 01");
    assert.equal(crew.staff[0].ranges.some((range) => range.headcount === 3), true);
    assert.equal(crew.staff[0].ranges.some((range) => range.perDiemPeople === 2), true);
    assert.equal(crew.support[0].billedAs, "Pipefitter Journeyman");
    const pre = (applied.schedule as PhaseScheduleState).phases.find((row) => row.id === "pre");
    assert.equal(pre?.on, true);
    assert.equal(pre?.start, "2026-09-01");
    const diff = diffEstimateImport(asPack(input), imported);
    assert.equal(diff.createsNew, false);
    assert.equal(diff.lines.some((line) => /Lead Safety|headcount|Bill as|Pre/i.test(line)), true);
  });

  it("creates a new pack from a filled workbook", async () => {
    const imported = await parseEstimateXlsx(await estimateToXlsx(fixture()));
    const pack = createPackFromImport(imported, "nathan@example.com");
    assert.match(pack.packId, /^new-/);
    assert.equal(pack.title, fixture().title);
    assert.equal((pack.crew as { staff: CraftRow[] }).staff[0].position, "Superintendent 01");
    assert.equal(diffEstimateImport(null, imported).createsNew, true);
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
      const next = packSnapshotToXlsxInput(applied);
      assert.equal(deskEstimateTotal(next), total, `${file} after import`);
    }
  });
});
