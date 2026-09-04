import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, it } from "node:test";
import type { CraftRow } from "./craft-labor.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_EXPORT_BRAND,
  ESTIMATE_EXPORT_CONFIDENTIAL,
  ESTIMATE_EXPORT_ERROR,
  ESTIMATE_EXPORT_PRODUCER,
  ESTIMATE_HOURS_LINE,
  ESTIMATE_SUMMARY_AMOUNT,
  ESTIMATE_SUMMARY_HOURS,
  ESTIMATE_XLSX_SHEETS,
  OPTIONAL_ESTIMATE_SHEETS,
  LABOR_BLOCK_HEIGHT,
  LABOR_BLOCK_ID_COL,
  LABOR_DATE_START_COL,
  LABOR_MAX_DAYS,
  LABOR_DAYSHIFT,
  LABOR_HC_LABEL,
  LABOR_HPS_LABEL,
  LABOR_HPS_TYPE,
  LABOR_NIGHTSHIFT,
  LABOR_TITLE_TYPE,
  LABOR_TYPE_ORDER,
  laborBlockId,
  estimateToXlsx,
  estimateXlsxFilename,
  laborCalendarDates,
  sheetRef,
} from "./estimate-xlsx.ts";
import { deskEstimateTotal } from "./estimate-pack-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { lookupShahanLabor, SHAHAN_NO_RATE_LABEL, shahanCrewCostAmount } from "./shahan-wood-river.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import {
  LABOR_COL_WIDTHS,
  LABOR_DAY_COL_WIDTH,
  LABOR_DAYSHIFT_BANNER,
  LABOR_HC_HPS,
  LABOR_HOURS_LABEL,
  LABOR_POSITION_TITLE,
  LABOR_SAT_BODY,
  LABOR_SAT_HEADER,
  LABOR_SPACER,
  LABOR_SUN_BODY,
  LABOR_SUN_HEADER,
  SUMMARY_COL_A_WIDTH,
  SUMMARY_SECTION,
  SUMMARY_TOTAL,
} from "./xlsx-exceljs.ts";
import { evaluateWorkbook } from "./xlsx-eval.ts";
import {
  REQUIRED_XLSX_PARTS,
  buildSheetXml,
  colLetter,
  excelSafeSheetName,
  type WorkbookSheet,
} from "./xlsx-minimal.ts";

function zipParts(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "est-xlsx-"));
  const file = join(dir, "book.xlsx");
  writeFileSync(file, bytes);
  const listing = execSync(`unzip -l "${file}"`, { encoding: "utf8" });
  return listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/).pop() ?? "")
    .filter((part) => part.includes(".xml") || part.includes(".rels"));
}

function craft(
  id: string,
  position: string,
  hoursPerShift: number,
  extra: Partial<CraftRow> & {
    phaseId?: string;
    start?: string;
    end?: string;
    perDiemPeople?: number;
    otAfter8?: boolean;
    days?: boolean[];
    headcount?: number;
    nightHeadcount?: number;
  } = {},
): CraftRow {
  return {
    id,
    position,
    shift: extra.shift ?? "Days",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    billedAs: extra.billedAs,
    clockOverride: extra.clockOverride ?? "auto",
    laborClassOverride: extra.laborClassOverride ?? null,
    ranges: [
      {
        id: `${id}-rg`,
        start: extra.start ?? "2026-09-01",
        end: extra.end ?? "2026-09-01",
        headcount: extra.headcount ?? extra.ranges?.[0]?.headcount ?? 1,
        nightHeadcount: extra.nightHeadcount ?? extra.ranges?.[0]?.nightHeadcount ?? 0,
        hoursPerShift,
        perDiemPeople: extra.perDiemPeople ?? 1,
        days: extra.days ?? [false, true, true, true, true, true, false],
        otAfter8: extra.otAfter8,
        phaseId: extra.phaseId ?? "mech",
      },
    ],
  };
}

function woodRiverFixture() {
  return {
    title: "Unit 3 mechanical T&M",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    crew: {
      staff: [craft("st-1", "Superintendent 01", 10, { perDiemPeople: 1, otAfter8: false })],
      direct: [craft("dr-1", "Boilermaker Journeyman", 10, { perDiemPeople: 1, otAfter8: true })],
      otAfter8: true,
    },
    schedule: {
      projectStart: "2026-09-01",
      multiUnits: false,
      units: [],
      phases: [
        {
          id: "mech" as const,
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
        { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 1, travelers: 0, perMile: 0.5, miles: 0 },
      ],
      misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 2, each: 25 }],
    },
  };
}

function rodeoFixture() {
  return {
    title: "Crude unit window",
    client: "Phillips 66",
    site: "Rodeo — Rodeo, CA",
    crew: {
      direct: [craft("rd-1", "BOILERMAKER JOURNEYMAN", 12)],
      otAfter8: true,
    },
    jobMeta: { staffPerDiemRate: 155, craftPerDiemRate: 145, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" },
    equipment: { largeTools: [], thirdParty: [] },
    otherCost: { perDiemRate: 0, travel: [], misc: [] },
  };
}

function sheetOf(sheets: WorkbookSheet[], name: string) {
  return sheets.find((sheet) => sheet.name === name);
}

function cellMap(sheet: WorkbookSheet) {
  return new Map(sheet.cells.map((cell) => [cell.ref, cell]));
}

function laborTitleRow(sheet: WorkbookSheet, position: string, shift = LABOR_DAYSHIFT) {
  for (const cell of sheet.cells) {
    if (cell.type !== "text" || !cell.ref.startsWith("C") || cell.value !== position) continue;
    const row = Number(cell.ref.slice(1));
    const label = sheet.cells.find((item) => item.ref === `A${row}` && item.type === "text")?.value;
    if (label === shift) return row;
  }
  return 0;
}

function laborHours(sheet: WorkbookSheet, position: string, shift = LABOR_DAYSHIFT) {
  const title = laborTitleRow(sheet, position, shift);
  return {
    title,
    hc: title + 1,
    hps: title + 2,
    st: title + 3,
    ot: title + 4,
    dt: title + 5,
    pd: title + 6,
  };
}

describe("estimate excel export", () => {
  it("writes live formulas and Summary money equals sheet rollups", async () => {
    const input = woodRiverFixture();
    const sheets = buildEstimateWorkbook(input);
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(
      names.includes(ESTIMATE_XLSX_SHEETS.summary),
      true,
    );
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.staff), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.direct), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.rental), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.travel), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.misc), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.rates), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.org), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.slicer), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.tension), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.crane), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.coe), false);

    const summary = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    const direct = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(summary && staff && direct);
    assert.equal(summary.cells.find((cell) => cell.ref === "A1")?.value, ESTIMATE_EXPORT_BRAND);
    assert.equal(summary?.cells.find((cell) => cell.ref === "A5")?.value?.toString().startsWith("Produced"), true);
    assert.match(String(summary.cells.find((cell) => cell.ref === "A2")?.value), new RegExp(ESTIMATE_EXPORT_PRODUCER));
    assert.match(String(summary.cells.find((cell) => cell.ref === "A2")?.value), new RegExp(ESTIMATE_EXPORT_CONFIDENTIAL));
    assert.equal(summary.cells.find((cell) => cell.ref === "B5")?.type, "date");
    assert.match(String(staff.cells.find((cell) => cell.ref === "D10")?.value), /^B10\*E10$/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "E10")?.value), /Rate Tables/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "K14")?.value), /^SUM\(K7\)$/);
    assert.equal(summary.cells.some((cell) => cell.ref === "A7" && cell.value === "Staff labor $"), true);
    assert.equal(summary.cells.some((cell) => cell.ref.startsWith("A") && cell.value === ESTIMATE_HOURS_LINE), true);
    assert.equal(summary.cells.find((cell) => cell.ref === "B6")?.value, ESTIMATE_SUMMARY_AMOUNT);
    assert.equal(summary.cells.find((cell) => cell.ref === "C6")?.value, ESTIMATE_SUMMARY_HOURS);
    assert.equal(staff.cells.find((cell) => cell.ref === "K6")?.value, "Labor $");
    assert.equal(staff.cells.find((cell) => cell.ref === "B6")?.value, "Total Billable");
    assert.equal(staff.cells.find((cell) => cell.ref === "L6")?.type, "date");

    const { evalAt } = evaluateWorkbook(sheets);
    const amountAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${row}`);
    };
    const hoursAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${row}`);
    };
    const staffLabor = evalAt(ESTIMATE_XLSX_SHEETS.staff, "K14");
    const directLabor = evalAt(ESTIMATE_XLSX_SHEETS.direct, "K14");
    const staffPd = evalAt(ESTIMATE_XLSX_SHEETS.staff, "D14");
    const directPd = evalAt(ESTIMATE_XLSX_SHEETS.direct, "D14");
    const rentalCost = evalAt(ESTIMATE_XLSX_SHEETS.rental, "G8");
    const rentalMarked = evalAt(ESTIMATE_XLSX_SHEETS.rental, "H8");
    const travel = evalAt(ESTIMATE_XLSX_SHEETS.travel, "E8");
    const misc = evalAt(ESTIMATE_XLSX_SHEETS.misc, "E8");
    const markup = amountAt("6.5% markup");
    const grand = amountAt("ESTIMATE TOTAL $");
    assert.equal(staffLabor > 0, true);
    assert.equal(directLabor > 0, true);
    assert.equal(rentalCost, 234);
    assert.equal(rentalMarked, (134 + 100) * 1.065);
    assert.equal(markup, Math.round((234 + 50) * 0.065 * 100) / 100);
    assert.equal(
      Math.round((staffLabor + directLabor + staffPd + directPd + rentalCost + travel + misc + markup) * 100) / 100,
      Math.round(grand * 100) / 100,
    );
    assert.equal(hoursAt(ESTIMATE_HOURS_LINE) > 0, true);
    assert.equal(hoursAt("ESTIMATE TOTAL $"), evalAt(ESTIMATE_XLSX_SHEETS.staff, "B14") + evalAt(ESTIMATE_XLSX_SHEETS.direct, "B14"));

    const staffHours = computeRowHours(input.crew.staff[0], input.site, input.client, true);
    const directHours = computeRowHours(input.crew.direct[0], input.site, input.client, true);
    assert.equal(staffHours.st, 10);
    assert.equal(staffHours.ot, 0);
    assert.equal(directHours.st, 8);
    assert.equal(directHours.ot, 2);
    assert.equal(staffLabor, shahanCrewCostAmount("Superintendent 01", staffHours, wageLookupOpts(input.site)));
    assert.equal(directLabor, shahanCrewCostAmount("Boilermaker Journeyman", directHours, wageLookupOpts(input.site)));
    assert.equal(travel, 28);
    assert.equal(misc, 50);

    const xml = buildSheetXml(staff.cells);
    assert.match(xml, /<f>/);
    const bytes = await estimateToXlsx(input);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const parts = zipParts(bytes);
    assert.equal(parts.some((part) => part.endsWith("xl/theme/theme1.xml")), true);
    for (const part of REQUIRED_XLSX_PARTS) {
      assert.equal(parts.some((item) => item.endsWith(part) || item === part), true, part);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const summarySheet = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(summarySheet);
    assert.match(String(summarySheet.getCell("A2").value ?? ""), /Produced by Hit Squad Project Controls/);
    assert.equal(wb.worksheets.some((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.summary), true);
    assert.equal(/nathan|cat 2 pit stop/i.test(JSON.stringify(wb.model)), false);

    const staffSheet = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staffSheet && summarySheet);
    assert.equal(staffSheet.getCell("B7").numFmt, "#,##0.0");
    assert.equal(staffSheet.getCell("K7").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("E10").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("D10").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("L8").numFmt, "#,##0");
    assert.equal(staffSheet.getCell("L10").numFmt, "#,##0.0");
    let hoursRow = 0;
    let totalRow = 0;
    summarySheet.eachRow((row, rowNumber) => {
      const label = String(row.getCell(1).value ?? "");
      if (label === ESTIMATE_HOURS_LINE) hoursRow = rowNumber;
      if (label === "ESTIMATE TOTAL $") totalRow = rowNumber;
    });
    assert.equal(hoursRow > 0, true);
    assert.equal(totalRow > hoursRow, true);
    assert.equal(summarySheet.getCell(`C${hoursRow}`).numFmt, "#,##0.0");
    assert.equal(summarySheet.getCell(`B${totalRow}`).numFmt, "$#,##0.00");
    assert.equal(/field trial|forgebook|not a release/i.test(JSON.stringify(wb.model)), false);
  });

  it("uses that job's clock and rates, not a Wood River or Nathan gate", () => {
    const rodeo = buildEstimateWorkbook(rodeoFixture());
    const names = rodeo.map((sheet) => sheet.name);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.direct), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.staff), false);
    const direct = sheetOf(rodeo, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(direct);
    const hours = cellMap(direct);
    const block = laborHours(direct, "BOILERMAKER JOURNEYMAN");
    assert.equal(hours.get(`C${block.title}`)?.value, "BOILERMAKER JOURNEYMAN");
    const billed = lookupShahanLabor("BOILERMAKER JOURNEYMAN", wageLookupOpts("Rodeo — Rodeo, CA"));
    assert.ok(billed?.st);
    const { evalAt } = evaluateWorkbook(rodeo);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `B${block.st}`), 8);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `B${block.ot}`), 4);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `B${block.dt}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `K${block.title}`), 8 * billed.st + 4 * (billed.ot ?? 0));
    assert.match(estimateXlsxFilename(rodeoFixture()), /rodeo/);
    assert.equal(/nathan|cat-2|wood-river/i.test(estimateXlsxFilename(rodeoFixture())), false);
    assert.match(estimateXlsxFilename(woodRiverFixture()), /wood-river/);
    assert.equal(/nathan|cat-2-pit-stop/i.test(estimateXlsxFilename(woodRiverFixture())), false);
    assert.equal(sheetRef("Rate Tables", "C7"), "'Rate Tables'!C7");
    assert.equal(ESTIMATE_EXPORT_ERROR, "Could not export. Try again.");
  });

  it("does not put source workbooks in git and keeps empty sheets omitted", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((file) => file && !file.startsWith("look-samples/"));
    assert.equal(listed.join("\n"), "");
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /estimateToXlsx/);
    assert.match(workspace, /ESTIMATE_EXPORT_ERROR/);
    assert.equal(/nathanboyte|CAT 2 Pit Stop|isNathan/i.test(workspace), false);
    const empty = buildEstimateWorkbook({ title: "Blank", site: "Yates", client: "Georgia Power" });
    assert.deepEqual(empty.map((sheet) => sheet.name), [ESTIMATE_XLSX_SHEETS.summary]);
    assert.equal(empty[0].cells.some((cell) => cell.type === "formula" || (cell.type === "number" && cell.ref === "B8")), true);
  });

  it("omits leftover $0 catalog rows — no blank Crane / OM Crane / empty labor tabs", async () => {
    const leftoverZero = {
      title: "CAT 2 leftover zeros",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st-1", "Superintendent PF 01", 10)],
        generalForeman: [],
        foreman: [{ ...craft("fm-empty", "", 10), position: "" }],
        direct: [],
        support: [{ ...craft("sup-ws", "   ", 10), position: "   " }],
        otAfter8: true,
      },
      schedule: woodRiverFixture().schedule,
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" },
      equipment: {
        largeTools: [
          {
            id: "lt-empty",
            itemId: "",
            period: "daily" as const,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-empty",
            item: "",
            period: "daily" as const,
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
          {
            id: "tp-crane-zero",
            item: "Carry deck crane",
            period: "daily" as const,
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
          {
            id: "tp-tension-zero",
            item: "Hydraulic tensioner",
            period: "daily" as const,
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
          {
            id: "tp-rental-zero",
            item: "450amp diesel welder",
            period: "daily" as const,
            rate: 0,
            freight: 0,
            qty: 1,
            start: "2026-09-21",
            end: "2026-10-22",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [
          { id: "travel-staff", kind: "staff" as const, source: "crew" as const, headcount: 8, travelers: 0, perMile: 0.76, miles: 0 },
          { id: "travel-craft", kind: "craft" as const, source: "crew" as const, headcount: 40, travelers: 0, perMile: 0, miles: 0 },
        ],
        misc: [
          { id: "mc-alloy", item: "Alloy rod", description: "Stainless", qty: 1, each: 0 },
          { id: "mc-steel", item: "Steel", description: "", qty: 1, each: 0 },
        ],
      },
      subcontractor: {
        lines: [{ id: "sb-empty", vendor: "", scope: "", qty: 1, unit: "LS" as const, rate: 0, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(leftoverZero);
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(names, [ESTIMATE_XLSX_SHEETS.summary, ESTIMATE_XLSX_SHEETS.staff, ESTIMATE_XLSX_SHEETS.rates]);
    for (const name of [
      ESTIMATE_XLSX_SHEETS.foremen,
      ESTIMATE_XLSX_SHEETS.direct,
      ESTIMATE_XLSX_SHEETS.support,
      ESTIMATE_XLSX_SHEETS.rental,
      ESTIMATE_XLSX_SHEETS.tension,
      ESTIMATE_XLSX_SHEETS.crane,
      excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub),
      ESTIMATE_XLSX_SHEETS.coe,
      ESTIMATE_XLSX_SHEETS.travel,
      ESTIMATE_XLSX_SHEETS.misc,
    ]) {
      assert.equal(names.includes(name), false, name);
    }
    assert.equal(OPTIONAL_ESTIMATE_SHEETS.includes(ESTIMATE_XLSX_SHEETS.crane), true);

    const bytes = await estimateToXlsx(leftoverZero);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    assert.deepEqual(
      wb.worksheets.map((sheet) => sheet.name),
      [ESTIMATE_XLSX_SHEETS.summary, ESTIMATE_XLSX_SHEETS.staff, ESTIMATE_XLSX_SHEETS.rates],
    );
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crane), undefined);
    assert.equal(wb.getWorksheet(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub)), undefined);
  });

  it("Look samples omit empty category sheets (no blank Crane / OM Crane tabs)", async () => {
    async function sheetNames(file: string) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(readFileSync(fileURLToPath(new URL(`../look-samples/${file}`, import.meta.url))));
      return wb.worksheets.map((sheet) => sheet.name);
    }
    const cat2 = await sheetNames("v151_real_cat2.xlsx");
    assert.deepEqual(cat2, [
      ESTIMATE_XLSX_SHEETS.summary,
      ESTIMATE_XLSX_SHEETS.staff,
      ESTIMATE_XLSX_SHEETS.foremen,
      ESTIMATE_XLSX_SHEETS.direct,
      ESTIMATE_XLSX_SHEETS.support,
      ESTIMATE_XLSX_SHEETS.coe,
      ESTIMATE_XLSX_SHEETS.travel,
      ESTIMATE_XLSX_SHEETS.misc,
      ESTIMATE_XLSX_SHEETS.rates,
    ]);
    assert.equal(cat2.includes(ESTIMATE_XLSX_SHEETS.crane), false);
    assert.equal(cat2.includes(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub)), false);
    assert.equal(cat2.includes(ESTIMATE_XLSX_SHEETS.rental), false);
    assert.equal(cat2.includes(ESTIMATE_XLSX_SHEETS.tension), false);

    const aromatics = await sheetNames("v151_real_aromatics.xlsx");
    assert.deepEqual(aromatics, [
      ESTIMATE_XLSX_SHEETS.summary,
      ESTIMATE_XLSX_SHEETS.staff,
      ESTIMATE_XLSX_SHEETS.foremen,
      ESTIMATE_XLSX_SHEETS.direct,
      ESTIMATE_XLSX_SHEETS.support,
      ESTIMATE_XLSX_SHEETS.rental,
      ESTIMATE_XLSX_SHEETS.sub,
      ESTIMATE_XLSX_SHEETS.coe,
      ESTIMATE_XLSX_SHEETS.travel,
      ESTIMATE_XLSX_SHEETS.misc,
      ESTIMATE_XLSX_SHEETS.rates,
    ]);
    assert.equal(aromatics.includes("OM Crane Subcontractor"), false);
    assert.equal(aromatics.includes(ESTIMATE_XLSX_SHEETS.crane), false);
    assert.equal(aromatics.includes(ESTIMATE_XLSX_SHEETS.tension), false);
    for (const names of [cat2, aromatics]) {
      assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.org), false);
      assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.slicer), false);
      assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), false);
    }
  });

  it("writes an Excel-365-safe package for the O&M sub sheet, inch-quotes, and > text", async () => {
    const input = {
      ...woodRiverFixture(),
      equipment: {
        largeTools: [],
        thirdParty: [
          ...(woodRiverFixture().equipment.thirdParty ?? []),
          {
            id: "tp-2",
            item: '20" clam shell',
            period: "daily" as const,
            rate: 50,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
        ],
      },
      otherCost: {
        ...woodRiverFixture().otherCost,
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless > 2\"", qty: 2, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 1000, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const subName = excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub);
    assert.equal(subName, "Subcontractor");
    assert.equal(ESTIMATE_XLSX_SHEETS.sub, "Subcontractor");
    assert.equal(sheets.some((sheet) => sheet.name === subName), true);
    assert.equal(sheets.some((sheet) => sheet.name.includes("&")), false);
    assert.equal(sheets.some((sheet) => sheet.name.includes("OM Crane")), false);
    const summary = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary);
    const subFormula = summary?.cells.find((cell) => cell.type === "formula" && String(cell.value).includes(subName));
    assert.ok(subFormula);
    assert.equal(String(subFormula.value).includes("&amp;"), false);
    assert.equal(sheetRef(ESTIMATE_XLSX_SHEETS.sub, "H8"), "Subcontractor!H8");

    const bytes = await estimateToXlsx(input);
    const parts = zipParts(bytes);
    assert.equal(parts.some((part) => part.endsWith("xl/theme/theme1.xml")), true);
    assert.equal(parts.some((part) => part.endsWith("xl/sharedStrings.xml")), true);
    assert.equal(parts.some((part) => part.endsWith("xl/styles.xml")), true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const sub = wb.getWorksheet(subName);
    assert.ok(sub);
    assert.equal(String(sub.getCell("A7").value), "O&M Crane");
    const rental = wb.getWorksheet(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.rental));
    assert.ok(rental);
    assert.equal(String(rental.getCell("A8").value), '20" clam shell');
    const misc = wb.getWorksheet(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.misc));
    assert.ok(misc);
    assert.match(String(misc.getCell("B7").value), /Stainless > 2"/);
    const { evalAt } = evaluateWorkbook(sheets);
    const subTotal = evalAt(subName, "H8");
    assert.equal(subTotal, 1000 * 1.065);
    const summaryAmount = (label: string) => {
      const row = summary?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${row}`);
    };
    assert.equal(summaryAmount("Subcontractor $"), 1065);
    assert.equal(summaryAmount("6.5% markup"), Math.round((234 + 50 + 50) * 0.065 * 100) / 100);
  });

  it("rolls Subs as desk Cost + affiliate-aware markup and keeps the full job calendar", async () => {
    const input = {
      title: "Long window affiliates",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        direct: [craft("dr-1", "Boilermaker Journeyman", 10, { start: "2027-01-11", end: "2027-05-21", otAfter8: true })],
        otAfter8: true,
      },
      schedule: {
        projectStart: "2027-01-11",
        multiUnits: false,
        units: [],
        phases: [
          {
            id: "mech" as const,
            name: "Mechanical Window",
            on: true,
            start: "2027-01-11",
            stop: "2027-05-21",
            daysPerWeek: 5,
            hoursPerDay: 10,
            otAfter8: true,
            sundaysOff: [],
          },
        ],
      },
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" },
      equipment: {
        largeTools: [],
        thirdParty: [
          {
            id: "tp-1",
            item: "450amp diesel welder",
            period: "daily" as const,
            rate: 100,
            freight: 0,
            qty: 1,
            start: "2027-01-11",
            end: "2027-01-11",
          },
        ],
      },
      otherCost: {
        perDiemRate: 0,
        travel: [],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "", qty: 1, each: 200 }],
      },
      subcontractor: {
        lines: [],
        cards: [
          {
            id: "sc-aff",
            vendor: "JVIC Engineering",
            kind: "both" as const,
            labor: [],
            equipment: [{ id: "se-1", description: "LS", period: "daily" as const, rate: 4000, qty: 1, freight: 0, start: "", end: "" }],
            affiliate: true,
          },
          {
            id: "sc-out",
            vendor: "Hartford",
            kind: "both" as const,
            labor: [],
            equipment: [{ id: "se-2", description: "LS", period: "daily" as const, rate: 2500, qty: 1, freight: 0, start: "", end: "" }],
            affiliate: false,
          },
        ],
      },
    };
    const dates = laborCalendarDates(input);
    assert.equal(dates[0], "2027-01-11");
    assert.equal(dates[dates.length - 1], "2027-05-21");
    assert.equal(dates.length > 90, true);
    assert.equal(dates.length <= LABOR_MAX_DAYS, true);
    const sheets = buildEstimateWorkbook(input);
    const { evalAt } = evaluateWorkbook(sheets);
    const amountAt = (label: string) => {
      const row = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref.replace("A", "");
      assert.ok(row, label);
      return evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${row}`);
    };
    assert.equal(amountAt("Subcontractor $"), 4000 + 2500 + Math.round(2500 * 0.065 * 100) / 100);
    assert.equal(amountAt("6.5% markup"), Math.round((100 + 200) * 0.065 * 100) / 100);
    assert.equal(sheets.some((sheet) => sheet.name === "Subcontractor"), true);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(staff?.weekendCols?.some((col) => col.weekday === 6));
    assert.ok(staff?.weekendCols?.some((col) => col.weekday === 0));
    const excelTotal = amountAt("ESTIMATE TOTAL $");
    assert.equal(Math.round(excelTotal * 100) / 100, deskEstimateTotal(input));

    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const direct = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(direct);
    const sat = staff!.weekendCols!.find((col) => col.weekday === 6)!;
    const sun = staff!.weekendCols!.find((col) => col.weekday === 0)!;
    const argb = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "")
        .replace(/^FF/i, "")
        .toUpperCase();
    assert.equal(argb(direct.getCell(6, sat.col)), LABOR_SAT_HEADER.slice(2));
    assert.equal(argb(direct.getCell(6, sun.col)), LABOR_SUN_HEADER.slice(2));
    assert.equal(argb(direct.getCell(7, sat.col)), LABOR_SAT_BODY.slice(2));
    assert.equal(argb(direct.getCell(7, sun.col)), LABOR_SUN_BODY.slice(2));
    assert.notEqual(argb(direct.getCell(6, sat.col)), argb(direct.getCell(6, sun.col)));
  });

  it("tightens A–K and paints Office craft cages like Robert’s CAT 2", async () => {
    const input = {
      ...woodRiverFixture(),
      crew: {
        ...woodRiverFixture().crew,
        direct: [
          craft("dr-1", "Boilermaker Journeyman", 10, { perDiemPeople: 1, otAfter8: true }),
          craft("dr-2", "Pipefitter Journeyman", 10, { perDiemPeople: 1, otAfter8: true }),
        ],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const directModel = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct);
    assert.ok(directModel);
    assert.deepEqual(directModel.laborBlocks, [
      { start: 7, end: 13 },
      { start: 15, end: 21 },
    ]);
    assert.deepEqual(directModel.spacerRows, [14]);

    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const direct = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.direct);
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(direct);
    assert.ok(summary);
    const argb = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "")
        .replace(/^FF/i, "")
        .toUpperCase();
    const widthOf = (sheet: ExcelJS.Worksheet, col: number) => Number(sheet.getColumn(col).width);
    assert.equal(widthOf(direct, 1), LABOR_COL_WIDTHS.A);
    assert.equal(widthOf(direct, 2), LABOR_COL_WIDTHS.B);
    assert.equal(widthOf(direct, 3), LABOR_COL_WIDTHS.C);
    assert.equal(widthOf(direct, 11), LABOR_COL_WIDTHS.K);
    assert.equal(widthOf(direct, 12), LABOR_DAY_COL_WIDTH);
    assert.equal(widthOf(summary, 1), SUMMARY_COL_A_WIDTH);
    assert.equal(argb(direct.getCell("A7")), LABOR_DAYSHIFT_BANNER.slice(2));
    assert.equal(argb(direct.getCell("C7")), LABOR_POSITION_TITLE.slice(2));
    assert.equal(argb(direct.getCell("A8")), LABOR_HC_HPS.slice(2));
    assert.equal(argb(direct.getCell("A9")), LABOR_HC_HPS.slice(2));
    assert.equal(argb(direct.getCell("F10")), LABOR_HOURS_LABEL.slice(2));
    assert.equal(argb(direct.getCell("A14")), LABOR_SPACER.slice(2));
    assert.equal(direct.getCell("A7").border?.left?.style, "medium");
    assert.equal(direct.getCell("K13").border?.right?.style, "medium");
    assert.equal(direct.getCell("K13").border?.bottom?.style, "medium");
    const laborRow = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find(
      (cell) => cell.ref.startsWith("A") && cell.value === "Labor $",
    );
    assert.ok(laborRow);
    const laborExcelRow = Number(laborRow.ref.slice(1));
    assert.equal(argb(summary.getCell(`A${laborExcelRow}`)), SUMMARY_SECTION.slice(2));
    const totalRow = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find(
      (cell) => cell.ref.startsWith("A") && cell.value === "ESTIMATE TOTAL $",
    );
    assert.ok(totalRow);
    assert.equal(argb(summary.getCell(`A${totalRow.ref.slice(1)}`)), SUMMARY_TOTAL.slice(2));
  });

  it("stacks hiring-progression ranges on the same day the way the desk does", () => {
    const base = craft("dr-1", "Boilermaker Journeyman", 8, {
      start: "2026-09-01",
      end: "2026-09-01",
      headcount: 8,
      otAfter8: true,
      perDiemPeople: 6,
    });
    base.ranges.push({
      ...base.ranges[0],
      id: "dr-1-add",
      headcount: 3,
      perDiemPeople: 0,
    });
    const sheets = buildEstimateWorkbook({
      title: "Hiring add",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: { direct: [base], otAfter8: true },
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" },
    });
    const direct = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct)!;
    const block = laborHours(direct, "Boilermaker Journeyman");
    const { evalAt } = evaluateWorkbook(sheets);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `L${block.hc}`), 11);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `L${block.hps}`), 8);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `L${block.pd}`), 6);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `B${block.st}`), 8 * 11);
    const desk = computeRowHours(base, "Wood River — Roxana, IL", "Phillips 66", true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `B${block.title}`), desk.hours);
  });

  it("resolves ambiguous Shahan titles the same way the desk does and never writes a fake $0 rate", () => {
    assert.equal(lookupShahanLabor("Lead Safety 01"), null);
    const merit = lookupShahanLabor("Lead Safety 01", { laborClass: "Merit" });
    const union = lookupShahanLabor("Lead Safety 01", { laborClass: "Union" });
    assert.equal(merit?.st, 91.02);
    assert.equal(union?.st, 127.36);
    assert.equal(defaultLaborClass("Lead Safety 01"), "Merit");

    const site = "Wood River — Roxana, IL";
    const meritRow = craft("st-merit", "Lead Safety 01", 10);
    const unionRow = craft("st-union", "Lead Safety 01", 10, { laborClassOverride: "Union" });
    const noneRow = craft("sup-1", "Fire Watch", 10);
    const sheets = buildEstimateWorkbook({
      title: "Aromatics staff rates",
      client: "Phillips 66",
      site,
      crew: {
        staff: [meritRow, unionRow],
        support: [{ ...noneRow, billedAs: "" }],
      },
    });
    const rates = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.rates);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    const support = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.support);
    assert.ok(rates && staff && support);
    const rateMap = cellMap(rates);
    const staffMap = cellMap(staff);
    const supportMap = cellMap(support);
    assert.equal(rateMap.get("A7")?.value, "Lead Safety 01 · Merit");
    assert.equal(rateMap.get("A8")?.value, "Lead Safety 01 · Union");
    assert.equal(rateMap.get("C7")?.type, "number");
    assert.equal(rateMap.get("C7")?.value, 91.02);
    assert.equal(rateMap.get("C8")?.value, 127.36);
    assert.equal(rateMap.get("B7")?.value, 52.5);
    assert.equal(rateMap.get("A9")?.value, "Fire Watch");
    assert.equal(rateMap.get("C9")?.type, "text");
    assert.equal(rateMap.get("C9")?.value, SHAHAN_NO_RATE_LABEL);
    assert.equal(rateMap.get("C9")?.value === 0, false);

    const meritBlock = laborHours(staff, "Lead Safety 01");
    const unionTitle = staff.cells.filter((cell) => cell.ref.startsWith("C") && cell.value === "Lead Safety 01")[1];
    const unionTitleRow = Number(unionTitle?.ref.slice(1) ?? 0);
    const supportBlock = laborHours(support, "Fire Watch");
    assert.match(String(staffMap.get(`E${meritBlock.st}`)?.value), /Rate Tables.*C7/);
    assert.match(String(staffMap.get(`E${unionTitleRow + 3}`)?.value), /Rate Tables.*C8/);
    assert.equal(supportMap.get(`E${supportBlock.st}`)?.type, "text");
    assert.equal(supportMap.get(`E${supportBlock.st}`)?.value, SHAHAN_NO_RATE_LABEL);
    assert.equal(supportMap.get(`D${supportBlock.st}`)?.value, 0);

    const { evalAt } = evaluateWorkbook(sheets);
    const hours = computeRowHours(meritRow, site, "Phillips 66");
    assert.equal(hours.st, 10);
    assert.equal(hours.ot, 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `B${meritBlock.st}`), 10);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `B${meritBlock.ot}`), 0);
    const round2 = (value: number) => Math.round(value * 100) / 100;
    assert.equal(
      round2(evalAt(ESTIMATE_XLSX_SHEETS.staff, `K${meritBlock.title}`)),
      shahanCrewCostAmount("Lead Safety 01", hours, wageLookupOpts(site, { laborClass: "Merit" })),
    );
    assert.equal(
      round2(evalAt(ESTIMATE_XLSX_SHEETS.staff, `K${unionTitleRow}`)),
      shahanCrewCostAmount("Lead Safety 01", hours, wageLookupOpts(site, { laborClass: "Union" })),
    );
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.support, `K${supportBlock.title}`), 0);
  });

  it("exports B-1 staff seats on the staff clock, not the East Coast craft clock", () => {
    const site = "Wood River — Roxana, IL";
    const client = "Phillips 66";
    const weekday = {
      start: "2026-09-01",
      end: "2026-09-01",
      otAfter8: false as const,
    };
    const sheets = buildEstimateWorkbook({
      title: "Aromatics clocks",
      client,
      site,
      crew: {
        staff: [
          craft("ls", "Lead Site 01", 10, weekday),
          craft("safe", "Lead Safety 01", 10, weekday),
          craft("qa", "COORDINATOR QA-QC 1", 10, weekday),
          craft("doc", "Clerk Document 01", 10, weekday),
          craft("off", "Manager Office 01", 10, weekday),
          craft("tk", "Clerk Timekeeper 01", 10, weekday),
          craft("comp", "Lead Site 01", 10, { ...weekday, clockOverride: "comp", otAfter8: true }),
        ],
        generalForeman: [craft("gf", "Pipefitter GF Union", 10, { ...weekday, otAfter8: true })],
        otAfter8: true,
      },
    });
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staff);
    assert.equal(sheetOf(sheets, ESTIMATE_XLSX_SHEETS.foremen), undefined);
    const { evalAt: hoursAt } = evaluateWorkbook(sheets);
    for (const title of [
      "Lead Site 01",
      "Lead Safety 01",
      "COORDINATOR QA-QC 1",
      "Clerk Document 01",
      "Manager Office 01",
      "Clerk Timekeeper 01",
    ]) {
      const block = laborHours(staff, title);
      assert.ok(block.title, title);
      assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${block.st}`), 10, `${title} ST`);
      assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${block.ot}`), 0, `${title} OT`);
    }
    const titles = staff.cells.filter((cell) => cell.ref.startsWith("C") && cell.value === "Lead Site 01");
    const compRow = Number(titles[1]?.ref.slice(1) ?? 0);
    assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${compRow + 3}`), 8);
    assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${compRow + 4}`), 2);
    const gf = laborHours(staff, "Pipefitter GF Union");
    assert.ok(gf.title);
    assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${gf.st}`), 8);
    assert.equal(hoursAt(ESTIMATE_XLSX_SHEETS.staff, `B${gf.ot}`), 2);

    const saturday = buildEstimateWorkbook({
      title: "Aromatics Saturday",
      client,
      site,
      crew: {
        staff: [
          craft("sat-staff", "Lead Safety 01", 10, {
            start: "2026-09-05",
            end: "2026-09-05",
            days: [false, false, false, false, false, false, true],
            otAfter8: false,
          }),
        ],
        generalForeman: [
          craft("sat-gf", "Pipefitter GF Union", 10, {
            start: "2026-09-05",
            end: "2026-09-05",
            days: [false, false, false, false, false, false, true],
            otAfter8: true,
          }),
        ],
        otAfter8: true,
      },
    });
    const satSheet = sheetOf(saturday, ESTIMATE_XLSX_SHEETS.staff)!;
    const satStaff = laborHours(satSheet, "Lead Safety 01");
    const satGf = laborHours(satSheet, "Pipefitter GF Union");
    const { evalAt: satAt } = evaluateWorkbook(saturday);
    assert.equal(sheetOf(saturday, ESTIMATE_XLSX_SHEETS.foremen), undefined);
    assert.equal(satAt(ESTIMATE_XLSX_SHEETS.staff, `B${satStaff.st}`), 10);
    assert.equal(satAt(ESTIMATE_XLSX_SHEETS.staff, `B${satStaff.ot}`), 0);
    assert.ok(satGf.title);
    assert.equal(satAt(ESTIMATE_XLSX_SHEETS.staff, `B${satGf.st}`), 0);
    assert.equal(satAt(ESTIMATE_XLSX_SHEETS.staff, `B${satGf.ot}`), 10);
  });

  it("labels contingency, CBA, M.O.R.E., and 6.5% markup on Summary Amount $ — not in MH", () => {
    const input = {
      ...woodRiverFixture(),
      jobMeta: {
        ...woodRiverFixture().jobMeta,
        laborContingencyPct: 10,
        equipmentContingencyPct: 5,
        subsContingencyPct: 4,
        cbaIncreaseOn: true,
        cbaIncreasePct: 3,
        cbaIncreaseDate: "2026-01-01",
        moreFundPerHour: 2,
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 1000, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const labels = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells
      .filter((cell) => cell.ref.startsWith("A") && cell.type === "text")
      .map((cell) => cell.value);
    assert.ok(labels?.includes("Labor contingency"));
    assert.ok(labels?.includes("Equipment contingency"));
    assert.ok(labels?.includes("Subs contingency"));
    assert.ok(labels?.includes("CBA increase"));
    assert.ok(labels?.includes("M.O.R.E. fund"));
    assert.ok(labels?.includes("6.5% markup"));
    const { evalAt } = evaluateWorkbook(sheets);
    const rowOf = (label: string) => {
      const ref = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.summary)?.cells.find((cell) => cell.ref.startsWith("A") && cell.value === label)?.ref;
      assert.ok(ref, label);
      return ref.replace("A", "");
    };
    const hoursRow = rowOf(ESTIMATE_HOURS_LINE);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${hoursRow}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${hoursRow}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("Labor contingency")}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("6.5% markup")}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `C${rowOf("6.5% markup")}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.summary, `B${rowOf("ESTIMATE TOTAL $")}`) > 0, true);
  });

  it("builds a CAT 2-shaped package and keeps FIELD TRIAL / Forgebook off the client file", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const craftWeek = { ...weekday, otAfter8: true as const };
    const input = {
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st-1", "Lead Safety 01", 10, { ...weekday, otAfter8: false })],
        generalForeman: [craft("gf-1", "Pipefitter GF Union", 10, craftWeek)],
        foreman: [craft("fm-1", "Boilermaker Foreman", 10, craftWeek)],
        direct: [craft("dr-1", "Boilermaker Journeyman", 10, craftWeek)],
        support: [craft("su-1", "Fire Watch", 10, { ...craftWeek, billedAs: "Boilermaker Journeyman" })],
        otAfter8: true,
      },
      schedule: woodRiverFixture().schedule,
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
      equipment: {
        largeTools: [
          {
            id: "lt-1",
            itemId: "air-mover",
            period: "daily" as const,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
            enteredCost: 0,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-r",
            item: "450amp diesel welder",
            period: "daily" as const,
            rate: 134,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
          {
            id: "tp-t",
            item: "Hydraulic tensioner",
            period: "daily" as const,
            rate: 80,
            freight: 0,
            qty: 1,
            start: "2026-09-01",
            end: "2026-09-01",
          },
          {
            id: "tp-c",
            item: "Carry deck crane",
            period: "daily" as const,
            rate: 400,
            freight: 0,
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
        ],
        misc: [{ id: "mc-1", item: "Alloy rod", description: "Stainless", qty: 1, each: 25 }],
      },
      subcontractor: {
        lines: [{ id: "sub-1", vendor: "O&M Crane", scope: "crane lift", qty: 1, unit: "LS" as const, rate: 500, affiliate: false }],
        cards: [],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const names = sheets.map((sheet) => sheet.name);
    assert.equal(names.length, 13);
    assert.equal(names[0], ESTIMATE_XLSX_SHEETS.summary);
    assert.deepEqual(
      ["Staff", "Foremen", "Direct", "Support"].every((name) => names.includes(name)),
      true,
    );
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.org), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.slicer), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), false);
    assert.equal(names.includes(excelSafeSheetName(ESTIMATE_XLSX_SHEETS.sub)), true);
    assert.equal(names.some((name) => name.includes("&")), false);
    const blob = JSON.stringify(sheets);
    assert.equal(/field trial|forgebook|not a release/i.test(blob), false);
    const staffSheet = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff)!;
    const foremenSheet = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.foremen)!;
    const staffMap = cellMap(staffSheet);
    assert.equal(staffMap.get("A7")?.value, LABOR_DAYSHIFT);
    assert.equal(staffMap.get("C7")?.value, "Lead Safety 01");
    assert.equal(laborHours(staffSheet, "Pipefitter GF Union").title > 7, true);
    assert.equal(cellMap(foremenSheet).get("C7")?.value, "Boilermaker Foreman");

    const bytes = await estimateToXlsx(input);
    const parts = zipParts(bytes);
    for (const part of REQUIRED_XLSX_PARTS) {
      assert.equal(parts.some((item) => item.endsWith(part) || item === part), true, part);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    assert.equal(wb.worksheets.length, 13);
    assert.ok(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary)?.headerFooter.oddHeader?.includes("HIT SQUAD"));
    assert.equal(/field trial|forgebook/i.test(String(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary)?.headerFooter.oddHeader)), false);
    const lead = laborHours(staffSheet, "Lead Safety 01");
    const gf = laborHours(staffSheet, "Pipefitter GF Union");
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getCell(`C${lead.title}`).value, "Lead Safety 01");
    const { evalAt: catAt } = evaluateWorkbook(sheets);
    assert.equal(catAt(ESTIMATE_XLSX_SHEETS.staff, `B${lead.st}`), 10);
    assert.equal(catAt(ESTIMATE_XLSX_SHEETS.staff, `B${lead.ot}`), 0);
    assert.equal(catAt(ESTIMATE_XLSX_SHEETS.staff, `B${gf.st}`), 8);
    assert.equal(catAt(ESTIMATE_XLSX_SHEETS.staff, `B${gf.ot}`), 2);
    const rates = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(rates);
    assert.equal(Number(rates.getCell("C7").value) > 0, true);
  });

  it("keeps workbook Staff/Foremen/Direct/Support itemization and does not invent a sixth crew sheet", () => {
    const listed = execSync('git ls-files "components/CrewPhaseCards.tsx" "lib/crew-lanes.ts"', { encoding: "utf8" });
    assert.match(listed, /crew-lanes/);
    const lanes = readFileSync(fileURLToPath(new URL("./crew-lanes.ts", import.meta.url)), "utf8");
    assert.match(lanes, /Staff/);
    assert.match(lanes, /General Foreman/);
    assert.match(lanes, /Foreman/);
    assert.match(lanes, /Direct Craft/);
    assert.match(lanes, /Support/);
    assert.equal(/laydown/i.test(lanes), false);
    const sheets = buildEstimateWorkbook({
      title: "Wood River itemization",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st", "Lead Safety 01", 10)],
        generalForeman: [craft("gf", "Pipefitter GF Union", 10, { otAfter8: true })],
        foreman: [craft("fm", "Boilermaker Foreman", 10, { otAfter8: true })],
        direct: [craft("dr", "Boilermaker Journeyman", 10, { otAfter8: true })],
        support: [craft("su", "Fire Watch", 10, { otAfter8: true })],
        otAfter8: true,
      },
    });
    const names = sheets.map((sheet) => sheet.name);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.staff), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.foremen), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.direct), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.support), true);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.laydown), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.org), false);
    assert.equal(names.includes(ESTIMATE_XLSX_SHEETS.slicer), false);
    assert.equal(laborHours(sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff)!, "Pipefitter GF Union").title > 0, true);
    assert.equal(cellMap(sheetOf(sheets, ESTIMATE_XLSX_SHEETS.foremen)!).get("C7")?.value, "Boilermaker Foreman");
  });

  it("keeps an unrecognized Staff-card title on the staff clock", () => {
    const sheets = buildEstimateWorkbook({
      title: "Staff clock lane",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("odd", "Turnaround Coordinator Desk", 10, { start: "2026-09-01", end: "2026-09-01", otAfter8: false })],
        otAfter8: true,
      },
    });
    const staffSheet = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff)!;
    const block = laborHours(staffSheet, "Turnaround Coordinator Desk");
    const { evalAt } = evaluateWorkbook(sheets);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `B${block.st}`), 10);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `B${block.ot}`), 0);
  });

  it("writes a CAT 2 daily itemized labor grid — date row, 7-row HC/HPS/ST/OT/DT/PD blocks", async () => {
    const weekday = {
      start: "2026-09-01",
      end: "2026-09-07",
      days: [true, true, true, true, true, true, true],
    };
    const input = {
      title: "Wood River daily grid",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st", "Lead Safety 01", 10, { ...weekday, otAfter8: false })],
        generalForeman: [craft("gf", "Pipefitter GF Union", 10, { ...weekday, otAfter8: true })],
        foreman: [craft("fm", "Boilermaker Foreman", 10, { ...weekday, otAfter8: true })],
        direct: [
          craft("dr", "Boilermaker Journeyman", 10, {
            ...weekday,
            otAfter8: true,
            shift: "Days & nights" as const,
            headcount: 2,
            nightHeadcount: 1,
            perDiemPeople: 2,
          }),
        ],
        support: [craft("su", "Fire Watch", 10, { ...weekday, otAfter8: true, billedAs: "Boilermaker Journeyman" })],
        otAfter8: true,
      },
      schedule: {
        projectStart: "2026-09-01",
        multiUnits: false,
        units: [],
        phases: [
          {
            id: "mech" as const,
            name: "Mechanical Window",
            on: true,
            start: "2026-09-01",
            stop: "2026-09-07",
            daysPerWeek: 5,
            hoursPerDay: 10,
            otAfter8: true,
            sundaysOff: [],
          },
        ],
      },
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
    };
    const dates = laborCalendarDates(input);
    assert.deepEqual(dates[0], "2026-09-01");
    assert.equal(dates.length, 7);
    assert.equal(colLetter(LABOR_DATE_START_COL), "L");
    const sheets = buildEstimateWorkbook(input);
    assert.equal(sheets.some((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.laydown), false);
    const staff = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.staff)!;
    const direct = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.direct)!;
    const staffMap = cellMap(staff);
    assert.equal(staffMap.get("L6")?.type, "date");
    assert.equal(staffMap.get("M6")?.type, "formula");
    assert.match(String(staffMap.get("M6")?.value), /L6\+1/);
    const lead = laborHours(staff, "Lead Safety 01");
    assert.equal(staffMap.get(`A${lead.title}`)?.value, LABOR_DAYSHIFT);
    assert.equal(staffMap.get(`C${lead.title}`)?.value, "Lead Safety 01");
    assert.deepEqual(
      LABOR_TYPE_ORDER.map((type, index) => staffMap.get(`F${lead.title + index}`)?.value),
      [...LABOR_TYPE_ORDER],
    );
    assert.equal(staffMap.get(`F${lead.hc}`)?.value, LABOR_HC_LABEL);
    assert.equal(staffMap.get(`A${lead.hps}`)?.value, LABOR_HPS_LABEL);
    assert.equal(staffMap.get(`F${lead.hps}`)?.value, LABOR_HPS_TYPE);
    assert.equal(staffMap.get(`F${lead.title}`)?.value, LABOR_TITLE_TYPE);
    assert.equal(staffMap.get(`F${lead.st}`)?.value, "ST");
    assert.equal(staffMap.get(`F${lead.ot}`)?.value, "OT");
    assert.equal(staffMap.get(`F${lead.dt}`)?.value, "DT");
    assert.equal(staffMap.get(`F${lead.pd}`)?.value, "PD");
    assert.equal(lead.pd - lead.title + 1, LABOR_BLOCK_HEIGHT);
    assert.equal(staffMap.get("L8")?.type, "number");
    assert.equal(staffMap.get("L8")?.value, 1);
    assert.equal(staffMap.get("L9")?.value, 10);
    assert.match(String(staffMap.get(`L${lead.st}`)?.value), /WEEKDAY/);
    assert.match(String(staffMap.get(`L${lead.ot}`)?.value), /WEEKDAY/);
    assert.match(String(staffMap.get(`L${lead.dt}`)?.value), /WEEKDAY/);
    const { evalAt } = evaluateWorkbook(sheets);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `L${lead.st}`), 10);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `L${lead.ot}`), 0);
    const satCol = colLetter(LABOR_DATE_START_COL + 4);
    const gf = laborHours(staff, "Pipefitter GF Union");
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `${satCol}${gf.st}`), 0);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `${satCol}${gf.ot}`), 10);
    const day = laborHours(direct, "Boilermaker Journeyman");
    const night = laborHours(direct, "Boilermaker Journeyman", LABOR_NIGHTSHIFT);
    assert.ok(day.title);
    assert.ok(night.title);
    assert.equal(cellMap(direct).get(`A${night.title}`)?.value, LABOR_NIGHTSHIFT);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `L${day.hc}`), 2);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.direct, `L${night.hc}`), 1);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `K${lead.title}`) > 0, true);
    assert.equal(evalAt(ESTIMATE_XLSX_SHEETS.staff, `D${lead.pd}`) > 0, true);
    assert.equal(gf.title, lead.title + LABOR_BLOCK_HEIGHT);
    const idCol = colLetter(LABOR_BLOCK_ID_COL);
    const leadId = laborBlockId({ id: "st", position: "Lead Safety 01" }, false);
    const nightId = laborBlockId({ id: "dr", position: "Boilermaker Journeyman" }, true);
    assert.equal(staffMap.get(`${idCol}${lead.title}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.hc}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.hps}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.pd}`)?.value, leadId);
    assert.equal(cellMap(direct).get(`${idCol}${night.title}`)?.value, nightId);
    assert.equal(staff.hiddenCols?.includes(LABOR_BLOCK_ID_COL), true);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getColumn(LABOR_BLOCK_ID_COL).hidden, true);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.equal(/import workbook|upload.*xlsx|round-trip/i.test(workspace), false);
  });
});
