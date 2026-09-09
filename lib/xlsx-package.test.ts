import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CraftRow } from "./craft-labor.ts";
import { estimateJsonToXlsx, packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_XLSX_SHEETS,
  ESTIMATE_XLSX_SPARE_POSITIONS,
  EXCEL_DAY_GRID_NOTE_BUDGET,
  estimateToXlsx,
  LABOR_DATE_START_COL,
  type EstimateXlsxInput,
} from "./estimate-xlsx.ts";
import { rodeoU110FilledSnapshot } from "./madison-u110.ts";
import { rodeoU250FilledSnapshot } from "./madison-u250.ts";
import { parseA1 } from "./xlsx-minimal.ts";
import {
  assertOpenableEstimateXlsx,
  inspectEstimateXlsx,
  EXCELJS_VML_COMMENT_SAFE,
  EXCELJS_VML_IDMAP_CAPACITY,
  worksheetTopLevelTags,
} from "./xlsx-package.ts";
import { boiler17B1FilledSnapshot } from "./wood-river-b1.ts";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const VAULT_PACKS = [
  { file: "/tmp/vault-estimates/wood-river-2027-aromatics-turnaround.json", label: "aromatics-live" },
  { file: "/tmp/vault-estimates/aromatics-freeze-2026-09-02.json", label: "aromatics-freeze" },
  { file: "/tmp/vault-estimates/wood-river-madison-cat-2-pit-stop.json", label: "cat2" },
  { file: "/tmp/vault-estimates/wood-river-boiler-17-2026.json", label: "boiler17-live" },
] as const;

function weekday(): boolean[] {
  return [true, true, true, true, true, true, true];
}

function seat(
  id: string,
  position: string,
  start: string,
  end: string,
  extra: Partial<CraftRow> & { nightHeadcount?: number; billedAs?: string } = {},
): CraftRow {
  return {
    id,
    position,
    shift: extra.nightHeadcount ? "Days & nights" : "Days",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    billedAs: extra.billedAs,
    clockOverride: "auto",
    laborClassOverride: null,
    ranges: [
      {
        id: `${id}-rg`,
        start,
        end,
        headcount: extra.ranges?.[0]?.headcount ?? 1,
        nightHeadcount: extra.nightHeadcount ?? 0,
        hoursPerShift: 10,
        perDiemPeople: 1,
        nightPerDiemPeople: extra.nightHeadcount ? 1 : 0,
        days: weekday(),
        otAfter8: extra.otAfter8 ?? true,
        phaseId: "mech",
      },
    ],
  };
}

function denseInput(over: Partial<EstimateXlsxInput> = {}): EstimateXlsxInput {
  const start = "2027-01-11";
  const end = "2027-04-10";
  return {
    title: "Dense day-grid package",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: {
      staff: [
        seat("st-1", "Superintendent 01", start, end, { otAfter8: false, nightHeadcount: 1 }),
        seat("st-2", "Project Manager 01", start, end, { otAfter8: false }),
        seat("st-3", "Lead Safety 01", start, end, { otAfter8: false }),
      ],
      generalForeman: [seat("gf-1", "Pipefitter GF Union", start, end, { nightHeadcount: 1 })],
      foreman: [seat("fm-1", "Boilermaker Foreman", start, end), seat("fm-2", "Pipefitter Foreman", start, end)],
      direct: [
        seat("dr-1", "Boilermaker Journeyman", start, end, { nightHeadcount: 1 }),
        seat("dr-2", "Pipefitter Journeyman", start, end),
      ],
      support: [
        seat("su-1", "Fire Watch", start, end, { billedAs: "Boilermaker Journeyman" }),
        seat("su-2", "Tool Room Attendant", start, end, { billedAs: "Boilermaker Journeyman", nightHeadcount: 1 }),
      ],
      otAfter8: true,
    },
    schedule: {
      projectStart: start,
      multiUnits: false,
      units: [],
      phases: [
        {
          id: "mech",
          name: "Mechanical Window",
          on: true,
          start,
          stop: end,
          daysPerWeek: 7,
          hoursPerDay: 10,
          otAfter8: true,
          sundaysOff: [],
        },
      ],
    },
    jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
    ...over,
  };
}

function emptyCrewInput(): EstimateXlsxInput {
  return {
    title: "Empty crew package",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [], otAfter8: true },
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

function manyPositionsInput(): EstimateXlsxInput {
  const start = "2026-10-01";
  const end = "2026-10-14";
  const staff = Array.from({ length: 10 }, (_, i) =>
    seat(`st-${i + 1}`, `Superintendent ${String(i + 1).padStart(2, "0")}`, start, end, { otAfter8: false }),
  );
  return {
    title: "Many positions package",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: {
      staff,
      direct: [seat("dr-1", "Boilermaker Journeyman", start, end)],
      support: [seat("su-1", "Fire Watch", start, end, { billedAs: "Boilermaker Journeyman" })],
      otAfter8: true,
    },
    schedule: {
      projectStart: start,
      multiUnits: false,
      units: [],
      phases: [
        {
          id: "mech",
          name: "Mechanical Window",
          on: true,
          start,
          stop: end,
          daysPerWeek: 7,
          hoursPerDay: 10,
          otAfter8: true,
          sundaysOff: [],
        },
      ],
    },
    jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
  };
}

function monroeIdentityInput(): EstimateXlsxInput {
  return {
    title: "Monroe Energy U541 VAC",
    client: "Monroe Energy",
    site: "Monroe Energy",
    crew: {
      staff: [seat("st-1", "SITE-LEAD 01", "2026-06-01", "2026-06-14", { otAfter8: false })],
      direct: [seat("dr-1", "Boilermaker Journeyman", "2026-06-01", "2026-06-14")],
      otAfter8: true,
    },
    schedule: {
      projectStart: "2026-06-01",
      multiUnits: false,
      units: [],
      phases: [
        {
          id: "mech",
          name: "Mechanical Window",
          on: true,
          start: "2026-06-01",
          stop: "2026-06-14",
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

function laborNotes(input: EstimateXlsxInput) {
  return buildEstimateWorkbook(input).map((sheet) => ({
    name: sheet.name,
    notes: sheet.cells.filter((cell) => cell.note).length,
    blocks: sheet.laborBlocks?.length ?? 0,
    dayGridNotes: sheet.cells.filter((cell) => {
      const parsed = parseA1(cell.ref);
      return Boolean(cell.note) && parsed.colNum >= LABOR_DATE_START_COL && parsed.row >= 7;
    }).length,
  }));
}

async function exportAndOpen(input: EstimateXlsxInput, label: string) {
  const bytes = await estimateToXlsx(input);
  const report = await assertOpenableEstimateXlsx(bytes);
  const commentTotal = Object.values(report.commentsByPart).reduce((sum, n) => sum + n, 0);
  assert.equal(commentTotal <= EXCELJS_VML_IDMAP_CAPACITY * report.sheets.length, true, `${label} comments`);
  for (const [part, count] of Object.entries(report.commentsByPart)) {
    assert.equal(count <= EXCELJS_VML_COMMENT_SAFE, true, `${label} ${part} ${count}`);
  }
  for (const area of report.printAreas) {
    assert.match(area, /!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/, `${label} print area ${area}`);
    assert.equal(/!\$[A-Z]+\d+:\$[A-Z]+\d+/.test(area), false, `${label} mixed print area ${area}`);
  }
  return report;
}

describe("estimate xlsx package Excel can open", () => {
  it("keeps day-grid notes O(blocks) so ExcelJS VML ids stay inside the idmap", () => {
    const rows = laborNotes(denseInput());
    const staff = rows.find((row) => row.name === ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    assert.equal(staff.blocks >= 2 + ESTIMATE_XLSX_SPARE_POSITIONS, true);
    assert.equal(staff.dayGridNotes, staff.blocks * 3);
    assert.equal(staff.dayGridNotes <= EXCEL_DAY_GRID_NOTE_BUDGET, true);
    for (const row of rows) {
      assert.equal(row.notes <= EXCELJS_VML_COMMENT_SAFE, true, row.name);
    }
  });

  it("writes a valid zip ExcelJS can reopen for empty, dense, logo, spare, and identity packs", async () => {
    const cases: Array<{ label: string; input: EstimateXlsxInput }> = [
      { label: "empty-crew", input: emptyCrewInput() },
      { label: "dense-day-grid", input: denseInput() },
      { label: "dense-with-logo", input: denseInput({ companyLogo: PIXEL }) },
      { label: "many-positions", input: manyPositionsInput() },
      { label: "monroe-identity", input: monroeIdentityInput() },
      { label: "rodeo-u110", input: packSnapshotToXlsxInput(rodeoU110FilledSnapshot()) },
      { label: "rodeo-u250", input: packSnapshotToXlsxInput(rodeoU250FilledSnapshot()) },
      { label: "boiler17-b1", input: packSnapshotToXlsxInput(boiler17B1FilledSnapshot()) },
    ];
    for (const item of cases) {
      const report = await exportAndOpen(item.input, item.label);
      assert.equal(report.bytes > 1000, true, item.label);
      assert.ok(report.sheets.includes(ESTIMATE_XLSX_SHEETS.summary), item.label);
    }
  });

  it("rejects the ExcelJS repair patterns (picture-before-legacyDrawing, mixed Print_Area)", async () => {
    const bytes = await estimateToXlsx(denseInput({ companyLogo: PIXEL }));
    await assertOpenableEstimateXlsx(bytes);
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const laborName = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
          .map(async (name) => ({ name, xml: (await zip.file(name)?.async("string")) ?? "" })),
      )
    ).find((row) => /<legacyDrawing\b/.test(row.xml) && /<picture\b/.test(row.xml));
    assert.ok(laborName, "expected a sheet with comments + logo splash");
    const staff = laborName.xml;
    assert.match(staff, /<legacyDrawing\b[\s\S]*<picture\b/);
    const inverted = staff.replace(
      /(<legacyDrawing\b[^/]*\/>)(<picture\b[^/]*\/>)/,
      "$2$1",
    );
    assert.match(inverted, /<picture\b[\s\S]*<legacyDrawing\b/);
    zip.file(laborName.name, inverted);
    const invertedBytes = await zip.generateAsync({ type: "uint8array" });
    await assert.rejects(() => inspectEstimateXlsx(invertedBytes), /xlsx-sheet-order/);

    const zip2 = await JSZip.loadAsync(bytes);
    const workbook = (await zip2.file("xl/workbook.xml")?.async("string")) ?? "";
    zip2.file(
      "xl/workbook.xml",
      workbook.replace(/!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)/, "!$$$1$2:$$$3$4"),
    );
    const mixedBytes = await zip2.generateAsync({ type: "uint8array" });
    await assert.rejects(() => inspectEstimateXlsx(mixedBytes), /xlsx-print-area-rel/);
  });

  it("puts legacyDrawing before picture and keeps Print_Area fully absolute (Excel repair class)", async () => {
    const bytes = await estimateToXlsx(denseInput({ companyLogo: PIXEL }));
    const report = await assertOpenableEstimateXlsx(bytes);
    assert.ok(report.printAreas.length);
    for (const area of report.printAreas) {
      assert.match(area, /!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/);
    }
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const sheets = await Promise.all(
      report.parts
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .map(async (name) => ({ name, xml: (await zip.file(name)?.async("string")) ?? "" })),
    );
    const branded = sheets.filter((row) => /<picture\b/.test(row.xml) && /<legacyDrawing\b/.test(row.xml));
    assert.ok(branded.length >= 1, "logo + comments on a labor sheet");
    for (const row of branded) {
      const tags = worksheetTopLevelTags(row.xml);
      assert.equal(tags.indexOf("legacyDrawing") < tags.indexOf("picture"), true, row.name);
      assert.match(row.xml, /<legacyDrawing\b[\s\S]*<picture\b/);
    }
    const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
    assert.equal(/Print_Area[^>]*>[^<]*!\$[A-Z]+\d+:\$[A-Z]+\d+</.test(workbook), false);
  });

  it("opens Drive-shaped vault packs when present (Aromatics / CAT 2 / Boiler 17)", async () => {
    const present = VAULT_PACKS.filter((row) => existsSync(row.file));
    if (!present.length) {
      assert.equal(VAULT_PACKS.every((row) => !existsSync(row.file)), true);
      return;
    }
    for (const row of present) {
      const bytes = await estimateJsonToXlsx(JSON.parse(readFileSync(row.file, "utf8")));
      const report = await assertOpenableEstimateXlsx(bytes);
      for (const [part, count] of Object.entries(report.commentsByPart)) {
        assert.equal(count <= EXCELJS_VML_COMMENT_SAFE, true, `${row.label} ${part} ${count}`);
      }
      assert.ok(report.sheets.includes(ESTIMATE_XLSX_SHEETS.summary), row.label);
      assert.ok(report.sheets.includes(ESTIMATE_XLSX_SHEETS.staff), row.label);
    }
  });
});
