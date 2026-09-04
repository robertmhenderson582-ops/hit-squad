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
  EXCEL_JOB_SETUP_IMPORT_PARKED,
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
  LABOR_PHASE_LABEL,
  LABOR_TYPE_ORDER,
  laborBlockId,
  estimateToXlsx,
  estimateXlsxFilename,
  laborCalendarDates,
  RATE_RENTAL_SECTION,
  RATE_TOOLS_SECTION,
  sheetRef,
} from "./estimate-xlsx.ts";
import { commercialMarkupRate } from "./estimate-total.ts";
import {
  hasThirdPartyPeriodRate,
  lookupThirdPartyRental,
  thirdPartyRentalPeriodRate,
} from "./third-party-rental.ts";
import { deskEstimateTotal, estimateWorkbookSummaryTotal } from "./estimate-pack-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import {
  lookupShahanEquipment,
  lookupShahanLabor,
  SHAHAN_NO_RATE_LABEL,
  shahanCrewCostAmount,
  shahanPeriodRate,
} from "./shahan-wood-river.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import {
  EXCEL_UNIT_FORMATS,
  LABOR_COL_WIDTHS,
  LABOR_DAY_COL_WIDTH,
  LABOR_INSTRUMENT_OUTLINE_LEVEL,
  LABOR_DATA_ROW_HEIGHT,
  LABOR_HEADER_ROW_HEIGHT,
  SHEET_VOID_WASH,
  LABOR_DAYSHIFT_BANNER,
  LABOR_CAGE_WASH_A,
  LABOR_CAGE_WASH_B,
  LABOR_DAY_WASH,
  LABOR_HC_HPS,
  LABOR_HC_HPS_CLEAR,
  LABOR_HOURS_LABEL,
  LABOR_POSITION_TITLE,
  LABOR_SAT_BODY,
  LABOR_SAT_HEADER,
  LABOR_SPACER,
  LABOR_SUN_BODY,
  LABOR_SUN_HEADER,
  LABOR_WEEKEND_FILL,
  HEADER_META_LINE_HEIGHT,
  HEADER_META_WRAP_HEIGHT,
  LABOR_PHASE_ROW_HEIGHT,
  SUMMARY_COL_A_WIDTH,
  SUMMARY_SECTION,
  SUMMARY_TOTAL,
} from "./xlsx-exceljs.ts";
import { PHASE_TONE_FILLS, phaseOwningDate } from "./phase-schedule.ts";
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

function labelRow(sheet: WorkbookSheet, label: string) {
  for (const cell of sheet.cells) {
    if (cell.type === "text" && cell.ref.startsWith("A") && cell.value === label) {
      return Number(cell.ref.slice(1));
    }
  }
  return 0;
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
    assert.match(String(summary.cells.find((cell) => cell.ref === "A2")?.value), /Unit 3 mechanical/);
    assert.match(String(summary.cells.find((cell) => cell.ref === "A3")?.value), new RegExp(ESTIMATE_EXPORT_PRODUCER));
    assert.match(String(summary.cells.find((cell) => cell.ref === "A3")?.value), new RegExp(ESTIMATE_EXPORT_CONFIDENTIAL));
    assert.match(String(summary.cells.find((cell) => cell.ref === "A3")?.value), /Produced /);
    assert.match(String(staff.cells.find((cell) => cell.ref === "D10")?.value), /^B10\*E10$/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "E10")?.value), /Rate Tables/);
    assert.match(String(staff.cells.find((cell) => cell.ref === "K14")?.value), /^SUM\(K7\)$/);
    assert.equal(summary.cells.some((cell) => cell.ref === "A7" && cell.value === "Staff labor $"), true);
    assert.equal(summary.cells.some((cell) => cell.ref.startsWith("A") && cell.value === ESTIMATE_HOURS_LINE), true);
    assert.equal(summary.cells.find((cell) => cell.ref === "B6")?.value, ESTIMATE_SUMMARY_AMOUNT);
    assert.equal(summary.cells.find((cell) => cell.ref === "C6")?.value, ESTIMATE_SUMMARY_HOURS);
    assert.equal(staff.cells.find((cell) => cell.ref === "K6")?.value, "Labor $");
    assert.equal(staff.cells.find((cell) => cell.ref === "B6")?.value, "Billable");
    assert.equal(staff.cells.find((cell) => cell.ref === "D6")?.value, "Subtotal $");
    assert.equal(staff.cells.find((cell) => cell.ref === "J6")?.value, "PD");
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
    assert.match(String(summarySheet.getCell("A3").value ?? ""), /Produced by Hit Squad Project Controls/);
    assert.equal(wb.worksheets.some((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.summary), true);
    assert.equal(/nathan|cat 2 pit stop/i.test(JSON.stringify(wb.model)), false);

    const staffSheet = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staffSheet && summarySheet);
    assert.match(String(summarySheet.getCell("A2").value ?? ""), /East Coast \(PCA0001103\)/);
    assert.match(String(summarySheet.getCell("A3").value ?? ""), /Confidential estimate package/);
    assert.equal(summarySheet.getCell("A2").alignment?.wrapText, true);
    assert.equal(summarySheet.getCell("A3").alignment?.wrapText, true);
    assert.equal(Number(summarySheet.getRow(2).height), HEADER_META_WRAP_HEIGHT);
    assert.equal(Number(summarySheet.getRow(3).height), HEADER_META_WRAP_HEIGHT);
    assert.equal(Number(staffSheet.getRow(2).height), HEADER_META_LINE_HEIGHT);
    assert.equal(Number(staffSheet.getRow(3).height), HEADER_META_LINE_HEIGHT);
    assert.equal(Boolean(staffSheet.getCell("A2").alignment?.wrapText), false);
    assert.equal(Boolean(staffSheet.getCell("A3").alignment?.wrapText), false);
    const staffMerges = ((staffSheet.model as { merges?: string[] }).merges ?? []) as string[];
    const brandMerge = staffMerges.find((merge) => /^A1:[A-Z]+1$/.test(merge));
    assert.ok(brandMerge);
    const lastHeaderCol = brandMerge.slice(3, -1);
    assert.ok(lastHeaderCol !== "K");
    assert.ok(staffMerges.includes(`A2:${lastHeaderCol}2`));
    assert.ok(staffMerges.includes(`A3:${lastHeaderCol}3`));
    const headerFill = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "")
        .replace(/^FF/i, "")
        .toUpperCase();
    assert.ok(headerFill(staffSheet.getCell("A2")));
    assert.ok(headerFill(staffSheet.getCell("A3")));
    assert.equal(headerFill(staffSheet.getCell("L2")), headerFill(staffSheet.getCell("A2")));
    assert.equal(headerFill(staffSheet.getCell("L3")), headerFill(staffSheet.getCell("A3")));
    assert.equal(headerFill(staffSheet.getCell(`${lastHeaderCol}2`)), headerFill(staffSheet.getCell("A2")));
    assert.equal(headerFill(staffSheet.getCell(`${lastHeaderCol}3`)), headerFill(staffSheet.getCell("A3")));
    assert.equal(staffSheet.getCell("B7").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(staffSheet.getCell("K7").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("E10").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("D10").numFmt, "$#,##0.00");
    assert.equal(staffSheet.getCell("L8").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(staffSheet.getCell("L9").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(staffSheet.getCell("L10").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(staffSheet.getCell("L8").numFmt.includes("."), false);
    assert.equal(staffSheet.getCell("G7").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(staffSheet.getCell("J7").numFmt, EXCEL_UNIT_FORMATS.hours);
    let hoursRow = 0;
    let totalRow = 0;
    summarySheet.eachRow((row, rowNumber) => {
      const label = String(row.getCell(1).value ?? "");
      if (label === ESTIMATE_HOURS_LINE) hoursRow = rowNumber;
      if (label === "ESTIMATE TOTAL $") totalRow = rowNumber;
    });
    assert.equal(hoursRow > 0, true);
    assert.equal(totalRow > hoursRow, true);
    assert.equal(summarySheet.getCell(`C${hoursRow}`).numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(summarySheet.getCell(`B${totalRow}`).numFmt, "$#,##0.00");
    assert.equal(/field trial|forgebook|not a release/i.test(JSON.stringify(wb.model)), false);
    assert.equal(estimateWorkbookSummaryTotal(input), deskEstimateTotal(input));
  });

  it("Summary ESTIMATE TOTAL $ equals the desk rail after weekly-40", async () => {
    const week = {
      start: "2026-09-07",
      end: "2026-09-18",
      days: [false, true, true, true, true, true, false],
      otAfter8: false,
    };
    const input = {
      ...woodRiverFixture(),
      title: "Weekly 40 match",
      crew: {
        staff: [craft("st-1", "Superintendent 01", 10, { ...week, otAfter8: false })],
        direct: [craft("dr-1", "Boilermaker Journeyman", 10, week)],
        otAfter8: false,
      },
      schedule: {
        ...woodRiverFixture().schedule,
        phases: [
          {
            ...woodRiverFixture().schedule.phases[0],
            start: "2026-09-07",
            stop: "2026-09-18",
            otAfter8: false,
          },
        ],
      },
    };
    const desk = deskEstimateTotal(input);
    const excel = estimateWorkbookSummaryTotal(input);
    assert.equal(excel, desk);
    assert.equal(excel > 0, true);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(summary);
    let totalRow = 0;
    summary.eachRow((row, rowNumber) => {
      if (String(row.getCell(1).value ?? "") === "ESTIMATE TOTAL $") totalRow = rowNumber;
    });
    const cell = summary.getCell(`B${totalRow}`).value as { formula?: string; result?: number };
    assert.match(String(cell.formula ?? ""), /^SUM\(/);
    assert.equal(Math.round(Number(cell.result) * 100) / 100, desk);
  });

  it("includes change-order dollars on Summary so ESTIMATE TOTAL $ stays on the rail", () => {
    const input = { ...woodRiverFixture(), changeOrders: 73889.52 };
    const desk = deskEstimateTotal(input);
    assert.equal(desk, deskEstimateTotal({ ...input, changeOrders: 0 }) + 73889.52);
    const excel = estimateWorkbookSummaryTotal(input);
    assert.equal(excel, desk);
    const sheets = buildEstimateWorkbook(input);
    assert.equal(
      sheets[0].cells.some((cell) => cell.type === "text" && cell.value === "Change orders"),
      true,
    );
  });

  it("uses COMP 6.5% on P66/Bayway and 10% on Yates — not Nathan’s old 6% formula", () => {
    const rental = woodRiverFixture().equipment.thirdParty;
    const p66 = buildEstimateWorkbook({
      title: "Bayway COMP",
      client: "Phillips 66",
      site: "Bayway",
      equipment: { largeTools: [], thirdParty: rental },
    });
    const yates = buildEstimateWorkbook({
      title: "Yates materials",
      client: "Georgia Power",
      site: "Yates",
      equipment: { largeTools: [], thirdParty: rental },
    });
    const { evalAt: p66At } = evaluateWorkbook(p66);
    const { evalAt: yatesAt } = evaluateWorkbook(yates);
    assert.equal(p66At(ESTIMATE_XLSX_SHEETS.rental, "H7"), (134 + 100) * 1.065);
    assert.equal(yatesAt(ESTIMATE_XLSX_SHEETS.rental, "H7"), (134 + 100) * 1.1);
    assert.equal(
      p66.some((sheet) => sheet.cells.some((cell) => cell.type === "text" && cell.value === "6.5% markup")),
      true,
    );
    assert.equal(
      yates.some((sheet) => sheet.cells.some((cell) => cell.type === "text" && cell.value === "10% markup")),
      true,
    );
    assert.equal(
      p66.some((sheet) => sheet.cells.some((cell) => cell.type === "formula" && String(cell.value).includes("*0.06"))),
      false,
    );
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
    const leftoverRates = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(leftoverRates);
    assert.equal(leftoverRates.cells.some((cell) => cell.value === RATE_TOOLS_SECTION), false);
    assert.equal(leftoverRates.cells.some((cell) => cell.value === RATE_RENTAL_SECTION), false);
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
      assert.equal(names.includes("Job setup"), false);
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
    assert.equal(argb(direct.getCell(6, sat.col)), "C9C9C9");
    assert.equal(argb(direct.getCell(6, sun.col)), "C9C9C9");
    const weekday = [sat.col - 1, sat.col + 1, sun.col - 1, sun.col + 1].find(
      (col) => col !== sat.col && col !== sun.col && col >= 12,
    );
    assert.ok(weekday);
    assert.notEqual(argb(direct.getCell(6, weekday)), "C9C9C9");
    const cfDump = JSON.stringify(direct.conditionalFormattings ?? []);
    assert.match(cfDump, /WEEKDAY/);
    assert.match(cfDump, /C9C9C9/i);
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
    assert.equal(widthOf(direct, 5) >= LABOR_COL_WIDTHS.E, true);
    assert.equal(widthOf(direct, 6), LABOR_COL_WIDTHS.F);
    assert.equal(widthOf(direct, 11) >= LABOR_COL_WIDTHS.K, true);
    assert.equal(widthOf(direct, 11) <= 18, true);
    assert.equal(widthOf(direct, 12), LABOR_DAY_COL_WIDTH);
    assert.equal(LABOR_COL_WIDTHS.A, 11);
    assert.equal(LABOR_COL_WIDTHS.K, 16);
    assert.equal(Number(direct.getRow(6).height), LABOR_HEADER_ROW_HEIGHT);
    assert.equal(Boolean(direct.getCell("A6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("B6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("C6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("D6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("J6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("L6").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("A4").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("L4").alignment?.wrapText), false);
    assert.equal(widthOf(summary, 1), SUMMARY_COL_A_WIDTH);
    assert.equal(argb(direct.getCell("A7")), LABOR_DAYSHIFT_BANNER.slice(2));
    assert.equal(argb(direct.getCell("C7")), LABOR_POSITION_TITLE.slice(2));
    assert.equal(direct.getCell("B7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("C7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("D7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("E7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("F7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("G7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("H7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("I7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("J7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("K7").alignment?.horizontal, "center");
    assert.equal(direct.getCell("E10").alignment?.horizontal, "center");
    assert.equal(direct.getCell("F10").alignment?.horizontal, "center");
    assert.equal(direct.getCell("B6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("C6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("D6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("E6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("F6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("G6").alignment?.horizontal, "center");
    assert.equal(direct.getCell("K6").alignment?.horizontal, "center");
    assert.equal(Boolean(direct.getCell("C7").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("A7").alignment?.wrapText), false);
    assert.equal(argb(direct.getCell("A8")), LABOR_HC_HPS_CLEAR.slice(2));
    assert.equal(argb(direct.getCell("B8")), LABOR_HC_HPS_CLEAR.slice(2));
    assert.equal(argb(direct.getCell("K8")), LABOR_HC_HPS_CLEAR.slice(2));
    assert.equal(argb(direct.getCell("A9")), LABOR_HC_HPS_CLEAR.slice(2));
    assert.equal(argb(direct.getCell("K9")), LABOR_HC_HPS_CLEAR.slice(2));
    assert.equal(direct.getCell("A9").value, LABOR_HPS_LABEL);
    assert.equal(Boolean(direct.getCell("A9").alignment?.wrapText), false);
    assert.equal(Boolean(direct.getCell("F10").alignment?.wrapText), false);
    for (let row = 7; row <= 13; row += 1) {
      assert.equal(Number(direct.getRow(row).height), LABOR_DATA_ROW_HEIGHT, `craft row ${row}`);
    }
    const weekendSet = new Set((directModel.weekendCols ?? []).map((col) => col.col));
    let weekdayDayCol = 12;
    while (weekendSet.has(weekdayDayCol) && weekdayDayCol < 20) weekdayDayCol += 1;
    assert.equal(argb(direct.getCell(8, weekdayDayCol)), LABOR_HC_HPS.slice(2));
    assert.equal(argb(direct.getCell(9, weekdayDayCol)), LABOR_HC_HPS.slice(2));
    assert.equal(direct.getCell(8, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell(9, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell(10, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell(11, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell(12, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell(13, weekdayDayCol).alignment?.horizontal, "center");
    assert.equal(direct.getCell("L8").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(String(direct.getCell("G7").numFmt ?? "").includes("."), false);
    assert.equal(argb(direct.getCell("F10")), LABOR_HOURS_LABEL.slice(2));
    assert.equal(argb(direct.getCell("C10")), LABOR_CAGE_WASH_B.slice(2));
    assert.equal(argb(direct.getCell("G10")), LABOR_CAGE_WASH_B.slice(2));
    assert.equal(argb(direct.getCell(10, weekdayDayCol)), LABOR_DAY_WASH.slice(2));
    assert.equal(argb(direct.getCell("A14")), LABOR_SPACER.slice(2));
    const lastDateCol = colLetter(LABOR_DATE_START_COL + laborCalendarDates(input).length - 1);
    const directMerges = ((direct.model as { merges?: string[] }).merges ?? []) as string[];
    assert.ok(directMerges.includes(`A1:${lastDateCol}1`));
    assert.ok(directMerges.includes(`A2:${lastDateCol}2`));
    assert.ok(directMerges.includes(`A3:${lastDateCol}3`));
    assert.equal(argb(direct.getCell("L2")), argb(direct.getCell("A2")));
    assert.equal(argb(direct.getCell("L3")), argb(direct.getCell("A3")));
    assert.equal(argb(direct.getCell(`${lastDateCol}2`)), argb(direct.getCell("A2")));
    assert.equal(argb(direct.getCell(`${lastDateCol}3`)), argb(direct.getCell("A3")));
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
    assert.equal(argb(summary.getCell(`B${totalRow.ref.slice(1)}`)), SUMMARY_TOTAL.slice(2));
    assert.equal(argb(summary.getCell(`C${totalRow.ref.slice(1)}`)), SUMMARY_TOTAL.slice(2));
  });

  it("fills Rate Tables COMP BW from the Wood River wage book", () => {
    const site = "Wood River — Roxana, IL";
    const sheets = buildEstimateWorkbook({
      title: "Aromatics rates",
      client: "Phillips 66",
      site,
      crew: {
        staff: [
          craft("gs-pf", "General Superintendent PF 01", 10),
          craft("gs-bm", "General Superintendent BM 01", 10),
        ],
        foreman: [craft("pf-fm", "PIPEFITTER FORMAN", 10, { otAfter8: true })],
        support: [craft("tm", "TEAMSTERS GRP 01", 10, { otAfter8: true })],
      },
    });
    const rates = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(rates);
    const byCraft = new Map<string, number>();
    for (const cell of rates.cells) {
      if (cell.type !== "text" || !cell.ref.startsWith("A") || Number(cell.ref.slice(1)) < 7) continue;
      const row = cell.ref.slice(1);
      const bw = rates.cells.find((item) => item.ref === `B${row}` && item.type === "number");
      byCraft.set(String(cell.value), bw?.type === "number" ? bw.value : 0);
    }
    assert.equal(byCraft.get("General Superintendent PF 01"), 67.5);
    assert.equal(byCraft.get("General Superintendent BM 01"), 62);
    assert.equal(byCraft.get("PIPEFITTER FORMAN"), 53.93);
    assert.equal(byCraft.get("TEAMSTERS GRP 01"), 45.8);
  });

  it("appends live Large tools and third-party catalogs to Rate Tables without inventing rates", async () => {
    const weekday = { start: "2026-09-01", end: "2026-09-01" };
    const welder = lookupThirdPartyRental("450amp diesel welder");
    const ln25 = lookupThirdPartyRental("LN 25 Mig guns");
    const mover = lookupShahanEquipment("air-mover");
    const truck = lookupShahanEquipment("wet:8:truck-crew");
    const threaders = lookupShahanEquipment("PIPE THREADERS (535 AND LARGER) COST PLUS 6%");
    assert.ok(welder && ln25 && mover && truck && threaders);
    const input = {
      title: "Rate Tables equipment",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: { staff: [craft("st-1", "Superintendent 01", 10)] },
      schedule: woodRiverFixture().schedule,
      jobMeta: woodRiverFixture().jobMeta,
      equipment: {
        largeTools: [
          {
            id: "lt-mover",
            itemId: "air-mover",
            period: "daily" as const,
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
          {
            id: "lt-mover-dup",
            itemId: "air-mover",
            period: "weekly" as const,
            qty: 2,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
          {
            id: "lt-truck",
            itemId: "wet:8:truck-crew",
            period: "monthly" as const,
            qty: 1,
            ...weekday,
            enteredCost: 0,
            freight: 0,
          },
          {
            id: "lt-plus",
            itemId: "PIPE THREADERS (535 AND LARGER) COST PLUS 6%",
            period: "daily" as const,
            qty: 1,
            ...weekday,
            enteredCost: 1000,
            freight: 0,
          },
        ],
        thirdParty: [
          {
            id: "tp-weld",
            item: "450amp diesel welder",
            period: "daily" as const,
            rate: 134,
            freight: 100,
            qty: 1,
            ...weekday,
          },
          {
            id: "tp-purge",
            item: "Purge Monitors",
            period: "monthly" as const,
            rate: 1200,
            freight: 50,
            qty: 1,
            ...weekday,
          },
          {
            id: "tp-ln",
            item: "LN 25 Mig guns",
            period: "monthly" as const,
            rate: 225,
            freight: 50,
            qty: 1,
            ...weekday,
          },
        ],
      },
    };
    const sheets = buildEstimateWorkbook(input);
    const rates = sheetOf(sheets, ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(rates);
    const map = cellMap(rates);
    assert.equal(map.get("A7")?.value, "Superintendent 01");
    assert.equal(map.get("C7")?.type, "number");
    assert.equal(Number(map.get("C7")?.value) > 0, true);
    assert.deepEqual(rates.headerRows?.includes(6), true);

    const toolsTitle = labelRow(rates, RATE_TOOLS_SECTION);
    const rentalTitle = labelRow(rates, RATE_RENTAL_SECTION);
    assert.ok(toolsTitle > 7);
    assert.ok(rentalTitle > toolsTitle);
    const toolsHeader = toolsTitle + 1;
    const rentalHeader = rentalTitle + 1;
    assert.equal(map.get(`A${toolsHeader}`)?.value, "Item");
    assert.equal(map.get(`B${toolsHeader}`)?.value, "Fuel");
    assert.equal(map.get(`C${toolsHeader}`)?.value, "Daily $");
    assert.equal(map.get(`A${rentalHeader}`)?.value, "Item");
    assert.equal(map.get(`B${rentalHeader}`)?.value, "Daily $");
    assert.equal(map.get(`F${rentalHeader}`)?.value, "Markup %");
    assert.equal(rates.headerRows?.includes(toolsHeader), true);
    assert.equal(rates.headerRows?.includes(rentalHeader), true);

    const moverRow = toolsHeader + 1;
    const truckRow = toolsHeader + 2;
    const plusRow = toolsHeader + 3;
    assert.equal(map.get(`A${moverRow}`)?.value, mover.description);
    assert.equal(map.get(`B${moverRow}`)?.value, "Dry");
    assert.equal(map.get(`C${moverRow}`)?.value, shahanPeriodRate(mover, "daily"));
    assert.equal(map.get(`D${moverRow}`)?.value, shahanPeriodRate(mover, "weekly"));
    assert.equal(map.get(`E${moverRow}`)?.value, shahanPeriodRate(mover, "monthly"));
    assert.equal(map.get(`A${truckRow}`)?.value, truck.description);
    assert.equal(map.get(`B${truckRow}`)?.value, "Wet");
    assert.equal(map.get(`C${truckRow}`)?.value, shahanPeriodRate(truck, "daily"));
    assert.equal(map.get(`D${truckRow}`)?.value, shahanPeriodRate(truck, "weekly"));
    assert.equal(map.get(`E${truckRow}`)?.value, shahanPeriodRate(truck, "monthly"));
    assert.equal(map.get(`A${plusRow}`)?.value, threaders.description);
    assert.equal(map.get(`C${plusRow}`), undefined);
    assert.equal(map.get(`D${plusRow}`), undefined);
    assert.equal(map.get(`E${plusRow}`), undefined);
    assert.equal(map.get(`F${plusRow}`)?.value, "Cost + 6%");
    assert.equal(
      rates.cells.filter((cell) => cell.type === "text" && cell.value === mover.description).length,
      1,
    );

    const weldRow = rentalHeader + 1;
    const purgeRow = rentalHeader + 2;
    const lnRow = rentalHeader + 3;
    const markup = commercialMarkupRate("Phillips 66", "Wood River — Roxana, IL");
    assert.equal(map.get(`A${weldRow}`)?.value, "450amp diesel welder");
    assert.equal(map.get(`B${weldRow}`)?.value, thirdPartyRentalPeriodRate(welder, "daily"));
    assert.equal(map.get(`C${weldRow}`)?.value, thirdPartyRentalPeriodRate(welder, "weekly"));
    assert.equal(map.get(`D${weldRow}`)?.value, thirdPartyRentalPeriodRate(welder, "monthly"));
    assert.equal(map.get(`E${weldRow}`)?.value, welder.freight);
    assert.equal(map.get(`F${weldRow}`)?.value, markup);
    assert.equal(hasThirdPartyPeriodRate(ln25, "daily"), false);
    assert.equal(map.get(`A${purgeRow}`)?.value, "Purge Monitors");
    assert.equal(map.get(`B${purgeRow}`), undefined);
    assert.equal(map.get(`C${purgeRow}`), undefined);
    assert.equal(map.get(`D${purgeRow}`)?.value, 1200);
    assert.equal(map.get(`E${purgeRow}`)?.value, 50);
    assert.equal(map.get(`F${purgeRow}`)?.value, markup);
    assert.equal(map.get(`A${lnRow}`)?.value, "LN 25 Mig guns");
    assert.equal(map.get(`B${lnRow}`), undefined);
    assert.equal(map.get(`C${lnRow}`), undefined);
    assert.equal(map.get(`D${lnRow}`)?.value, thirdPartyRentalPeriodRate(ln25, "monthly"));
    assert.equal(map.get(`E${lnRow}`)?.value, ln25.freight);
    assert.equal(map.get(`F${lnRow}`)?.value, markup);

    const wood = sheetOf(buildEstimateWorkbook(woodRiverFixture()), ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(wood);
    assert.equal(labelRow(wood, RATE_TOOLS_SECTION), 0);
    assert.ok(labelRow(wood, RATE_RENTAL_SECTION) > 0);
    assert.equal(cellMap(wood).get(`A${labelRow(wood, RATE_RENTAL_SECTION) + 2}`)?.value, "450amp diesel welder");

    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const painted = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(painted);
    const argb = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "")
        .replace(/^FF/i, "")
        .toUpperCase();
    const steel = SUMMARY_SECTION.slice(2);
    const header = "083943";
    const toolsPaint = labelRow(rates, RATE_TOOLS_SECTION);
    const rentalPaint = labelRow(rates, RATE_RENTAL_SECTION);
    assert.equal(argb(painted.getCell(`A${toolsPaint}`)), steel);
    assert.equal(argb(painted.getCell(`F${toolsPaint}`)), steel);
    assert.equal(argb(painted.getCell(`A${toolsPaint + 1}`)), header);
    assert.equal(argb(painted.getCell(`A${rentalPaint}`)), steel);
    assert.equal(argb(painted.getCell(`A${rentalPaint + 1}`)), header);
    assert.equal(painted.getCell(`C${toolsPaint + 2}`).numFmt, EXCEL_UNIT_FORMATS.currency);
    assert.equal(painted.getCell(`F${rentalPaint + 2}`).numFmt, EXCEL_UNIT_FORMATS.percent);
  });

  it("paints a continuous amber TOTAL bar across every used column", async () => {
    const bytes = await estimateToXlsx(woodRiverFixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const argb = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "")
        .replace(/^FF/i, "")
        .toUpperCase();
    const amber = SUMMARY_TOTAL.slice(2);
    const totalRowOf = (sheet: ExcelJS.Worksheet, label: string) => {
      let found = 0;
      sheet.eachRow((row, rowNumber) => {
        if (String(row.getCell(1).value ?? "") === label) found = rowNumber;
      });
      return found;
    };
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental);
    const rates = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(misc && travel && rental && rates && summary);
    const miscTotal = totalRowOf(misc, "TOTAL");
    const travelTotal = totalRowOf(travel, "TOTAL");
    const rentalTotal = totalRowOf(rental, "TOTAL");
    assert.ok(miscTotal && travelTotal && rentalTotal);
    for (const col of [1, 2, 3, 4, 5]) assert.equal(argb(misc.getCell(miscTotal, col)), amber);
    for (const col of [1, 2, 3, 4, 5]) assert.equal(argb(travel.getCell(travelTotal, col)), amber);
    for (const col of [1, 2, 3, 4, 5, 6, 7, 8]) assert.equal(argb(rental.getCell(rentalTotal, col)), amber);
    assert.equal(argb(rates.getCell("A7")), LABOR_CAGE_WASH_A.slice(2));
    assert.equal(argb(rates.getCell("B8")) === LABOR_CAGE_WASH_A.slice(2) || argb(rates.getCell("B8")) === LABOR_CAGE_WASH_B.slice(2), true);
    assert.equal(argb(rates.getCell("B2")), "E4EBE9");
    const summaryTotal = totalRowOf(summary, "ESTIMATE TOTAL $");
    assert.ok(summaryTotal);
    for (const col of [1, 2, 3]) assert.equal(argb(summary.getCell(summaryTotal, col)), amber);
  });

  it("protects formula cells and leaves HC/HPS/PD day-grid unlocked", async () => {
    const bytes = await estimateToXlsx(woodRiverFixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    const rates = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    assert.ok(staff && summary && rates);
    const staffProtect = (staff as ExcelJS.Worksheet & { sheetProtection?: { sheet?: boolean } }).sheetProtection;
    const summaryProtect = (summary as ExcelJS.Worksheet & { sheetProtection?: { sheet?: boolean } }).sheetProtection;
    assert.equal(staffProtect?.sheet, true);
    assert.equal(summaryProtect?.sheet, true);
    assert.equal(Boolean(staff.getCell("L8").protection?.locked), false);
    assert.equal(Boolean(staff.getCell("L9").protection?.locked), false);
    assert.equal(Boolean(staff.getCell("L13").protection?.locked), false);
    assert.equal(staff.getCell("K7").protection?.locked !== false, true);
    assert.equal(staff.getCell("G10").protection?.locked !== false, true);
    assert.equal(staff.getCell("B10").protection?.locked !== false, true);
    assert.equal(staff.getCell("A8").protection?.locked !== false, true);
    assert.equal(staff.getCell("A4").protection?.locked !== false, true);
    assert.equal(staff.getCell("L4").protection?.locked !== false, true);
    assert.equal(staff.getCell("L5").protection?.locked !== false, true);
    assert.equal(wb.getWorksheet("Job setup"), undefined);
    let totalRow = 0;
    summary.eachRow((row, rowNumber) => {
      if (String(row.getCell(1).value ?? "") === "ESTIMATE TOTAL $") totalRow = rowNumber;
    });
    assert.equal(summary.getCell(`B${totalRow}`).protection?.locked !== false, true);
    assert.equal(rates.getCell("C7").protection?.locked !== false, true);
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
      ["HC", "HPS", "ST", "OT", "DT", "PD"].map((type, index) => staffMap.get(`F${lead.hc + index}`)?.value),
      [...LABOR_TYPE_ORDER],
    );
    assert.equal(staffMap.get(`F${lead.hc}`)?.value, LABOR_HC_LABEL);
    assert.equal(staffMap.get(`A${lead.hps}`)?.value, LABOR_HPS_LABEL);
    assert.equal(staffMap.get(`F${lead.hps}`)?.value, LABOR_HPS_TYPE);
    assert.equal(staffMap.get(`F${lead.title}`), undefined);
    assert.equal(staffMap.get(`C${lead.title}`)?.value, "Lead Safety 01");
    assert.equal(staff.cells.some((cell) => cell.type === "text" && cell.value === "TITLE"), false);
    assert.equal(staffMap.get(`F${lead.st}`)?.value, "ST");
    assert.equal(staffMap.get(`F${lead.ot}`)?.value, "OT");
    assert.equal(staffMap.get(`F${lead.dt}`)?.value, "DT");
    assert.equal(staffMap.get(`F${lead.pd}`)?.value, "PD");
    assert.equal(lead.pd - lead.title + 1, LABOR_BLOCK_HEIGHT);
    assert.equal(staffMap.get("L8")?.type, "number");
    assert.equal(staffMap.get("L8")?.value, 1);
    assert.equal(staffMap.get("L9")?.value, 10);
    assert.equal(staffMap.get(`L${lead.st}`)?.type, "number");
    assert.equal(staffMap.get(`L${lead.ot}`)?.type, "number");
    assert.equal(staffMap.get(`L${lead.dt}`)?.type, "number");
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
    assert.equal(gf.title, lead.title + LABOR_BLOCK_HEIGHT + 1);
    const idCol = colLetter(LABOR_BLOCK_ID_COL);
    const leadId = laborBlockId({ id: "st", position: "Lead Safety 01" }, false);
    const nightId = laborBlockId({ id: "dr", position: "Boilermaker Journeyman" }, true);
    assert.equal(staffMap.get(`${idCol}${lead.title}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.hc}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.hps}`)?.value, leadId);
    assert.equal(staffMap.get(`${idCol}${lead.pd}`)?.value, leadId);
    assert.equal(cellMap(direct).get(`${idCol}${night.title}`)?.value, nightId);
    assert.equal(staff.hiddenCols?.includes(LABOR_BLOCK_ID_COL), true);
    const lastDateCol = colLetter(LABOR_DATE_START_COL + dates.length - 1);
    assert.deepEqual(staff.merges, [
      `A1:${lastDateCol}1`,
      `A2:${lastDateCol}2`,
      `A3:${lastDateCol}3`,
      "A4:K5",
      `L4:${lastDateCol}5`,
    ]);
    assert.deepEqual(direct.merges, [
      `A1:${lastDateCol}1`,
      `A2:${lastDateCol}2`,
      `A3:${lastDateCol}3`,
      "A4:K5",
      `L4:${lastDateCol}5`,
    ]);
    assert.equal(staffMap.get("A4")?.value, LABOR_PHASE_LABEL);
    assert.equal(staffMap.get("L4")?.value, "Mechanical Window");
    assert.deepEqual(staff.phaseBar, [
      { startCol: LABOR_DATE_START_COL, endCol: LABOR_DATE_START_COL + dates.length - 1, phaseId: "mech" },
    ]);
    const bytes = await estimateToXlsx(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staffBook = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    assert.ok(staffBook);
    for (let col = LABOR_DATE_START_COL; col < LABOR_DATE_START_COL + dates.length; col += 1) {
      assert.equal(Number(staffBook.getColumn(col).width), LABOR_DAY_COL_WIDTH, `day col ${col}`);
      assert.equal(staffBook.getColumn(col).hidden, false, `day col ${col} visible`);
      assert.notEqual(Number(staffBook.getColumn(col).width), 13, `day col ${col} not default 13`);
    }
    assert.ok(dates.length >= 2);
    assert.equal(Number(staffBook.getColumn(LABOR_DATE_START_COL + 1).width), LABOR_DAY_COL_WIDTH);
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const staffXmls = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .map((name) => zip.file(name)?.async("string") ?? Promise.resolve("")),
    );
    const laborXml = staffXmls.find((xml) => /min="13" max="13" width="3.2"/.test(xml));
    assert.ok(laborXml, "each day col must be its own 3.2 width tag so Excel does not leave M+ at default");
    assert.equal(/min="12" max="1[3-9]" width="3.2"/.test(laborXml), false);
    assert.equal(staffBook.getColumn(LABOR_DATE_START_COL + dates.length).hidden, true);
    assert.equal(staffBook.getColumn(200).hidden, true);
    const lastStaffRow = Math.max(...staff.cells.map((cell) => Number(cell.ref.replace(/^[A-Z]+/, ""))));
    assert.equal(staffBook.getRow(lastStaffRow).hidden, false);
    assert.equal(Number(staffBook.getRow(lastStaffRow).height) > 0, true);
    assert.equal(staffBook.properties.defaultRowHeight, 0);
    const totalRef = staff.cells.find((cell) => cell.ref.startsWith("A") && cell.value === "TOTAL")?.ref;
    assert.ok(totalRef);
    const voidFill = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "").toUpperCase();
    assert.equal(voidFill(staffBook.getCell(`L${totalRef.slice(1)}`)), SHEET_VOID_WASH);
    assert.equal(voidFill(staffBook.getCell("L8")), LABOR_HC_HPS);
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getColumn(LABOR_BLOCK_ID_COL).hidden, true);
    assert.equal(Number(staffBook.getRow(4).height), LABOR_PHASE_ROW_HEIGHT);
    assert.equal(Number(staffBook.getRow(5).height), LABOR_PHASE_ROW_HEIGHT);
    const phaseFill = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "").toUpperCase();
    assert.equal(phaseFill(staffBook.getCell("L4")), PHASE_TONE_FILLS.mech);
    assert.equal(phaseFill(staffBook.getCell("L5")), PHASE_TONE_FILLS.mech);
    assert.equal(phaseFill(staffBook.getCell(`${lastDateCol}4`)), PHASE_TONE_FILLS.mech);
    assert.equal(String(staffBook.getCell("L4").font?.color?.argb ?? "").replace(/^FF/i, "").toUpperCase(), "FFFFFF");
    assert.equal(staffBook.getCell("A4").value, LABOR_PHASE_LABEL);
    assert.equal(staffBook.getCell("L4").value, "Mechanical Window");
    assert.notEqual(phaseFill(staffBook.getCell("L4")), LABOR_WEEKEND_FILL);
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getCell("C7").dataValidation, undefined);
    const writer = readFileSync(fileURLToPath(new URL("./xlsx-exceljs.ts", import.meta.url)), "utf8");
    assert.equal(/dataValidation/i.test(writer), false);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.equal(/import workbook|upload.*xlsx|round-trip/i.test(workspace), false);
  });

  it("phase bar follows live Job setup dates and only ON phases", async () => {
    const weekday = {
      start: "2026-09-01",
      end: "2026-09-07",
      days: [true, true, true, true, true, true, true],
    };
    const mech = {
      id: "mech" as const,
      name: "Mechanical Window",
      on: true,
      start: "2026-09-01",
      stop: "2026-09-07",
      daysPerWeek: 5,
      hoursPerDay: 10,
      otAfter8: true,
      sundaysOff: [] as string[],
    };
    const base = {
      title: "Phase bar ripple",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      crew: {
        staff: [craft("st", "Lead Safety 01", 10, { ...weekday, otAfter8: false })],
        otAfter8: true,
      },
      schedule: {
        projectStart: "2026-09-01",
        multiUnits: false,
        units: [],
        phases: [mech],
      },
      jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0.7, craftMileageRate: 0.5, rateBook: "" },
    };
    const staff = sheetOf(buildEstimateWorkbook(base), ESTIMATE_XLSX_SHEETS.staff)!;
    const dates = laborCalendarDates(base);
    assert.equal(staff.cells.find((cell) => cell.ref === "A4")?.value, LABOR_PHASE_LABEL);
    assert.equal(staff.cells.find((cell) => cell.ref === "L4")?.value, "Mechanical Window");
    assert.deepEqual(staff.phaseBar, [
      { startCol: LABOR_DATE_START_COL, endCol: LABOR_DATE_START_COL + dates.length - 1, phaseId: "mech" },
    ]);

    const moved = {
      ...base,
      schedule: {
        ...base.schedule,
        phases: [{ ...mech, start: "2026-09-03", stop: "2026-09-07" }],
      },
    };
    const movedStaff = sheetOf(buildEstimateWorkbook(moved), ESTIMATE_XLSX_SHEETS.staff)!;
    assert.equal(laborCalendarDates(moved)[0], "2026-09-01");
    assert.equal(phaseOwningDate(moved.schedule.phases, "2026-09-01"), undefined);
    assert.equal(phaseOwningDate(moved.schedule.phases, "2026-09-03")?.id, "mech");
    assert.equal(movedStaff.cells.find((cell) => cell.ref === "L4")?.value, undefined);
    assert.equal(movedStaff.cells.find((cell) => cell.ref === "N4")?.value, "Mechanical Window");
    assert.deepEqual(movedStaff.phaseBar, [
      { startCol: LABOR_DATE_START_COL + 2, endCol: LABOR_DATE_START_COL + dates.length - 1, phaseId: "mech" },
    ]);

    const split = {
      ...base,
      schedule: {
        ...base.schedule,
        phases: [
          { ...mech, id: "pre" as const, name: "Pre-Turnaround", start: "2026-09-01", stop: "2026-09-02" },
          { ...mech, start: "2026-09-03", stop: "2026-09-07" },
        ],
      },
    };
    const splitStaff = sheetOf(buildEstimateWorkbook(split), ESTIMATE_XLSX_SHEETS.staff)!;
    assert.equal(splitStaff.cells.find((cell) => cell.ref === "L4")?.value, "Pre-Turnaround");
    assert.equal(splitStaff.cells.find((cell) => cell.ref === "N4")?.value, "Mechanical Window");
    assert.deepEqual(
      splitStaff.phaseBar?.map((run) => run.phaseId),
      ["pre", "mech"],
    );

    const off = {
      ...base,
      schedule: {
        ...base.schedule,
        phases: [{ ...mech, on: false }],
      },
    };
    const offStaff = sheetOf(buildEstimateWorkbook(off), ESTIMATE_XLSX_SHEETS.staff)!;
    assert.equal(offStaff.cells.find((cell) => cell.ref === "L4")?.value, undefined);
    assert.deepEqual(offStaff.phaseBar, []);
    assert.equal(offStaff.cells.find((cell) => cell.ref === "A4")?.value, LABOR_PHASE_LABEL);

    const src = readFileSync(fileURLToPath(new URL("./estimate-xlsx.ts", import.meta.url)), "utf8");
    assert.match(src, /liveJobSetupPhases/);
    assert.match(src, /phaseBarRuns/);
    assert.match(src, /next Excel compile/);
    assert.match(src, /view only/);
    assert.equal(/2026-01-11|Jan 11/.test(src), false);
    assert.equal(EXCEL_JOB_SETUP_IMPORT_PARKED, true);
    assert.equal(buildEstimateWorkbook(base).some((sheet) => sheet.name === "Job setup"), false);
  });

  it("hides unused grid past the used range and washes leftover white cells", async () => {
    const bytes = await estimateToXlsx(woodRiverFixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const staff = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff);
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    const rates = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rates);
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc);
    assert.ok(staff && summary && rates && misc);
    assert.equal(staff.getColumn(12).hidden, false);
    assert.equal(Number(staff.getColumn(12).width), LABOR_DAY_COL_WIDTH);
    assert.equal(staff.getColumn(13).hidden, true);
    assert.equal(summary.getColumn(3).hidden, false);
    assert.equal(summary.getColumn(4).hidden, true);
    assert.equal(summary.getColumn(80).hidden, true);
    assert.equal(rates.getColumn(7).hidden, true);
    assert.equal(misc.getColumn(6).hidden, true);
    const fill = (cell: ExcelJS.Cell) =>
      String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "").toUpperCase();
    assert.equal(fill(staff.getCell("L8")), LABOR_HC_HPS);
    assert.notEqual(fill(staff.getCell("L4")), SHEET_VOID_WASH);
    assert.notEqual(fill(staff.getCell("L4")), "FFFFFFFF");
    assert.equal(fill(summary.getCell("A2")) === "E4EBE9" || fill(summary.getCell("A2")) === "FFE4EBE9", true);
    assert.equal(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.staff)?.getCell("C7").dataValidation, undefined);
    for (const sheet of [staff, summary, rates, misc]) {
      assert.equal(sheet.properties.defaultRowHeight, 0, sheet.name);
    }
    let lastMiscContent = 0;
    misc.eachRow((row, n) => {
      if (String(row.getCell(1).value ?? "")) lastMiscContent = n;
    });
    assert.ok(lastMiscContent);
    assert.equal(Number(misc.getRow(lastMiscContent).height) > 0, true);
    assert.equal(String(misc.getCell(`A${lastMiscContent}`).value), "TOTAL");
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const sheetXml = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .map((name) => zip.file(name)?.async("string") ?? Promise.resolve("")),
    );
    assert.ok(sheetXml.length);
    for (const xml of sheetXml) {
      assert.match(xml, /zeroHeight="1"/);
      assert.match(xml, /defaultRowHeight="0"/);
    }
  });

  it("groups A–K on craft sheets with native column outline, no VBA", async () => {
    const bytes = await estimateToXlsx({
      ...woodRiverFixture(),
      crew: {
        ...woodRiverFixture().crew,
        generalForeman: [craft("gf-1", "Pipefitter GF Union", 10, { perDiemPeople: 1, otAfter8: true })],
        foreman: [craft("fm-1", "Boilermaker Foreman", 10, { perDiemPeople: 1, otAfter8: true })],
        support: [craft("su-1", "Fire Watch", 10, { perDiemPeople: 1, otAfter8: true, billedAs: "Boilermaker Journeyman" })],
      },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const craftNames = [
      ESTIMATE_XLSX_SHEETS.staff,
      ESTIMATE_XLSX_SHEETS.foremen,
      ESTIMATE_XLSX_SHEETS.direct,
      ESTIMATE_XLSX_SHEETS.support,
    ];
    for (const name of craftNames) {
      const sheet = wb.getWorksheet(name);
      assert.ok(sheet, name);
      assert.equal(sheet.getColumn(1).outlineLevel, LABOR_INSTRUMENT_OUTLINE_LEVEL, `${name} A`);
      assert.equal(sheet.getColumn(11).outlineLevel, LABOR_INSTRUMENT_OUTLINE_LEVEL, `${name} K`);
      assert.equal(Number(sheet.getColumn(12).outlineLevel ?? 0), 0, `${name} L`);
      assert.equal(Number(sheet.getColumn(1).width), LABOR_COL_WIDTHS.A);
      assert.equal(Number(sheet.getColumn(11).width), LABOR_COL_WIDTHS.K);
    }
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
    assert.ok(summary);
    assert.equal(Number(summary.getColumn(1).outlineLevel ?? 0), 0);

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    assert.equal(Object.keys(zip.files).some((name) => /vbaProject/i.test(name)), false);
    const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
    assert.ok(contentTypes);
    assert.equal(/macroEnabled/i.test(contentTypes), false);
    assert.match(contentTypes, /workbook.xml/);

    const sheetXml = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .map((name) => zip.file(name)?.async("string") ?? Promise.resolve("")),
    );
    const laborXml = sheetXml.filter((xml) => /min="1" max="1"[^>]*outlineLevel="1"/.test(xml));
    assert.equal(laborXml.length, 4);
    for (const xml of laborXml) {
      assert.match(xml, /min="1" max="1"[^>]*outlineLevel="1"/);
      assert.match(xml, /min="11" max="11"[^>]*outlineLevel="1"/);
      assert.equal(/min="1" max="1"[^>]*collapsed="1"/.test(xml), false);
      assert.equal(/min="11" max="11"[^>]*collapsed="1"/.test(xml), false);
      assert.equal(/min="12" max="12"[^>]*outlineLevel=/.test(xml), false);
      assert.match(xml, /showOutlineSymbols="1"/);
      assert.match(xml, /outlineLevelCol="1"/);
      assert.match(xml, /<outlinePr[^>]*summaryRight="1"/);
      assert.match(xml, /formatColumns="1"/);
      assert.match(xml, /min="12" max="12" width="3.2"/);
    }
    const nonLabor = sheetXml.filter((xml) => !/min="1" max="1"[^>]*outlineLevel="1"/.test(xml));
    assert.ok(nonLabor.length);
    for (const xml of nonLabor) {
      assert.equal(/min="1" max="1"[^>]*outlineLevel=/.test(xml), false);
    }
    const writer = readFileSync(fileURLToPath(new URL("./xlsx-exceljs.ts", import.meta.url)), "utf8");
    assert.match(writer, /applyLaborInstrumentOutline/);
    assert.equal(/vbaProject|\.xlsm/i.test(writer), false);
  });

  it("uses #,##0 hours and unclipped $ currency on every package sheet", async () => {
    const bytes = await estimateToXlsx(woodRiverFixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const names = wb.worksheets.map((sheet) => sheet.name);
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.summary));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.staff));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.direct));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.rental));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.travel));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.misc));
    assert.ok(names.includes(ESTIMATE_XLSX_SHEETS.rates));
    for (const ws of wb.worksheets) {
      const headers = new Map<number, string>();
      ws.getRow(6).eachCell((cell, col) => {
        headers.set(col, String(cell.value ?? ""));
      });
      ws.eachRow((row, rowNumber) => {
        if (rowNumber < 7) return;
        row.eachCell({ includeEmpty: false }, (cell, col) => {
          const fmt = String(cell.numFmt ?? "");
          const header = headers.get(col) ?? "";
          const lower = header.toLowerCase();
          const hourish =
            /hrs|hours|qty|periods|travelers|miles|\bcount\b|man-hours|\bmh\b|^pd$|^billable$/.test(lower) &&
            !/\$/.test(lower) &&
            !/rate/.test(lower);
          if (hourish && cell.type !== ExcelJS.ValueType.String) {
            assert.equal(fmt, EXCEL_UNIT_FORMATS.hours, `${ws.name} ${cell.address} ${header}`);
            assert.equal(fmt.includes("."), false, `${ws.name} ${cell.address}`);
            assert.equal(cell.alignment?.horizontal, "center", `${ws.name} ${cell.address}`);
          }
          if (fmt === EXCEL_UNIT_FORMATS.currency) {
            const align = cell.alignment?.horizontal;
            assert.equal(align === "center" || align === "right", true, `${ws.name} ${cell.address} money ${align ?? "none"}`);
            const raw = typeof cell.value === "number" ? cell.value : (cell.value as { result?: number })?.result;
            if (typeof raw !== "number") return;
            const shown = `$${Math.abs(raw).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            assert.equal(Number(ws.getColumn(col).width) >= shown.length + 2, true, `${ws.name} col ${col} ${shown}`);
          }
        });
      });
    }
    const misc = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc)!;
    assert.equal(misc.getCell("C7").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(misc.getCell("C7").alignment?.horizontal, "center");
    assert.equal(misc.getCell("E7").numFmt, EXCEL_UNIT_FORMATS.currency);
    const travel = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel)!;
    assert.equal(travel.getCell("B7").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(travel.getCell("E7").numFmt, EXCEL_UNIT_FORMATS.currency);
    const rental = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental)!;
    assert.equal(rental.getCell("C7").numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(rental.getCell("H7").numFmt, EXCEL_UNIT_FORMATS.currency);
    const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary)!;
    let hoursRow = 0;
    summary.eachRow((row, n) => {
      if (String(row.getCell(1).value ?? "") === ESTIMATE_HOURS_LINE) hoursRow = n;
    });
    assert.equal(summary.getCell(`C${hoursRow}`).numFmt, EXCEL_UNIT_FORMATS.hours);
    assert.equal(summary.getCell(`C${hoursRow}`).alignment?.horizontal, "center");
    let laborRow = 0;
    let markupRow = 0;
    summary.eachRow((row, n) => {
      const label = String(row.getCell(1).value ?? "");
      if (label === "Labor $") laborRow = n;
      if (label === "6.5% markup") markupRow = n;
    });
    assert.ok(laborRow);
    assert.ok(markupRow);
    assert.equal(summary.getCell(`B${laborRow}`).numFmt, EXCEL_UNIT_FORMATS.currency);
    assert.equal(summary.getCell(`B${laborRow}`).alignment?.horizontal, "right");
    assert.equal(summary.getCell(`B${markupRow}`).numFmt, EXCEL_UNIT_FORMATS.currency);
    assert.equal(summary.getCell(`B${markupRow}`).alignment?.horizontal, "right");
  });
});
