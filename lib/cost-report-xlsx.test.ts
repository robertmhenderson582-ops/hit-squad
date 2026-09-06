import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import {
  applyTurnipPaste,
  deskBudgetFromPack,
  emptyCostReportBook,
  estimateCurveFromCrew,
  parseTurnipPaste,
  saveCostSnapshot,
} from "./cost-report.ts";
import {
  PPR_EARNED_NOTE,
  PPR_REPORT_TITLE,
  TURNIP15_HEADERS,
  buildPprLines,
  pprLaneFromChargeCode,
} from "./cost-report-ppr.ts";
import { sampleCostReportInput } from "./cost-report-sample.ts";
import {
  COST_EXPORT_BRAND,
  COST_EXPORT_CONFIDENTIAL,
  COST_XLSX_APPENDIX_SHEETS,
  COST_XLSX_CLIENT_SHEETS,
  COST_XLSX_HIDDEN_SHEETS,
  COST_XLSX_SHEETS,
  buildCostReportWorkbook,
  costReportToXlsx,
  costReportXlsxFilename,
  pprLayout,
  pprSheetRef,
} from "./cost-report-xlsx.ts";
import { PPR_EARNED_FILL, PPR_EXPENDED_FILL, STEEL, STEEL_DEEP } from "./xlsx-exceljs.ts";
import { S_CURVE_AMBER, S_CURVE_STEEL } from "./xlsx-s-curve-chart.ts";
import { evaluateWorkbook } from "./xlsx-eval.ts";

const WOOD = { client: "Phillips 66", site: "Wood River — Roxana, IL" };

function fixtureBook() {
  const row = blankCraftRow();
  row.position = "Pipefitter Journeyman";
  row.ranges = [
    {
      ...blankRange(),
      start: "2026-09-01",
      end: "2026-09-02",
      hoursPerShift: 10,
      headcount: 2,
      days: [false, true, true, true, true, true, false],
    },
  ];
  const budget = deskBudgetFromPack({ crew: { direct: [row] }, ...WOOD });
  let book = applyTurnipPaste(
    emptyCostReportBook(),
    "15",
    [
      TURNIP15_HEADERS.join("\t"),
      ["100", "Direct Labor", "16", "4800", "0", "0", "4800"].join("\t"),
    ].join("\n"),
  );
  book = applyTurnipPaste(
    book,
    "16",
    "event_dt\tcraft\tUnits\n09/01/2026\tPipefitter Journeyman\t16",
  );
  book = { ...book, statusDate: "2026-09-01", notes: "Monday field report" };
  book = saveCostSnapshot(book, budget, 1);
  const curve = estimateCurveFromCrew({ direct: [row] }, WOOD.site, WOOD.client);
  return { budget, book, curve, title: "Cat 2 Pit Stop", ...WOOD };
}

function fillArgb(cell: ExcelJS.Cell) {
  return String((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? "").toUpperCase();
}

function steelFill(cell: ExcelJS.Cell) {
  const argb = fillArgb(cell);
  return argb === STEEL || argb === STEEL.slice(2) || argb === STEEL_DEEP || argb === STEEL_DEEP.slice(2);
}

describe("cost report Excel export", () => {
  it("builds a Mike-shaped PPR package with live budget and Turnip ClientActual fields", () => {
    const input = fixtureBook();
    const sheets = buildCostReportWorkbook({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
      preparedBy: "Mike",
      status: "In progress",
      curve: input.curve.map((point) => ({
        ...point,
        actHours: point.date === "2026-09-01" ? 16 : 0,
        actHeadcount: point.date === "2026-09-01" ? 2 : 0,
        cumEstHours: point.estHours,
        cumActHours: point.date === "2026-09-01" ? 16 : 0,
      })),
    });
    const names = sheets.map((sheet) => sheet.name);
    assert.deepEqual(names, [...COST_XLSX_CLIENT_SHEETS, ...COST_XLSX_APPENDIX_SHEETS, ...COST_XLSX_HIDDEN_SHEETS]);
    assert.equal(names[0], COST_XLSX_SHEETS.charts);
    const cover = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.cover)!;
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === COST_EXPORT_BRAND));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === PPR_REPORT_TITLE));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Cat 2 Pit Stop"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && cell.value === "Phillips 66"));
    assert.ok(cover.cells.some((cell) => cell.type === "text" && /Wood River/.test(cell.value)));
    const { totalRow } = pprLayout({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
    });
    const coverForecast = cover.cells.find((cell) => cell.ref === "E9");
    assert.equal(coverForecast?.type, "formula");
    assert.equal(coverForecast && "value" in coverForecast ? coverForecast.value : "", pprSheetRef(`D${totalRow}`));
    const ppr = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.ppr)!;
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === PPR_REPORT_TITLE));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Dollars Budget"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Current Forecast"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Work Hours Expended"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Work Hours Earned"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Physical % Complete"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "To Go Forecast"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "DIRECT LABOR"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "TOTAL PROJECT"));
    assert.ok(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Pipefitter Journeyman"));
    assert.equal(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Budget"), false);
    assert.equal(ppr.cells.some((cell) => cell.type === "text" && cell.value === "Variance"), false);
    const craftLabel = ppr.cells.find((cell) => cell.type === "text" && cell.value === "Pipefitter Journeyman");
    const craftRow = Number(/(\d+)$/.exec(craftLabel?.ref ?? "")?.[1] ?? 0);
    const rate = ppr.cells.find((cell) => cell.ref === `H${craftRow}`);
    assert.equal(rate?.type, "formula");
    assert.match(String(rate && "value" in rate ? rate.value : ""), new RegExp(`D${craftRow}/G${craftRow}`));
    const { evalAt } = evaluateWorkbook(sheets);
    assert.ok(Number(evalAt(COST_XLSX_SHEETS.ppr, `D${totalRow}`)) > 0);
    assert.equal(evalAt(COST_XLSX_SHEETS.ppr, `M${totalRow}`), 4800);
    assert.equal(evalAt(COST_XLSX_SHEETS.cover, "E9"), evalAt(COST_XLSX_SHEETS.ppr, `D${totalRow}`));
    const appendix = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.export15);
    assert.ok(appendix?.cells.some((cell) => cell.type === "text" && cell.value === "LaborTotal_ClientActual_Units"));
    assert.ok(appendix?.cells.some((cell) => cell.type === "text" && cell.value === "LaborTotal_ClientActual_Dollars"));
    assert.equal(appendix?.cells.some((cell) => cell.type === "text" && cell.value === "Date"), false);
    const t16 = sheets.find((sheet) => sheet.name === COST_XLSX_SHEETS.export16);
    assert.ok(t16?.cells.some((cell) => cell.type === "text" && cell.value === "event_dt"));
    assert.ok(t16?.cells.some((cell) => cell.type === "text" && cell.value === "Units"));
    assert.match(PPR_EARNED_NOTE, /no P6/i);
  });

  it("writes a real xlsx with industrial PPR chrome and does not leak field-trial copy", async () => {
    const input = fixtureBook();
    const bytes = await costReportToXlsx({
      title: input.title,
      client: input.client,
      site: input.site,
      statusDate: "2026-09-01",
      budget: input.budget,
      book: input.book,
      curve: input.curve.map((point) => ({
        ...point,
        actHours: point.date === "2026-09-01" ? 16 : 0,
        actHeadcount: point.date === "2026-09-01" ? 2 : 0,
        cumEstHours: point.estHours,
        cumActHours: point.date === "2026-09-01" ? 16 : 0,
      })),
      preparedBy: "Robert Henderson",
      status: "Budgetary",
    });
    assert.ok(bytes.byteLength > 2000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    assert.deepEqual(
      wb.worksheets.map((sheet) => sheet.name),
      [...COST_XLSX_CLIENT_SHEETS, ...COST_XLSX_APPENDIX_SHEETS, ...COST_XLSX_HIDDEN_SHEETS],
    );
    assert.equal(wb.worksheets[0]?.name, COST_XLSX_SHEETS.charts);
    const cover = wb.getWorksheet(COST_XLSX_SHEETS.cover)!;
    const ppr = wb.getWorksheet(COST_XLSX_SHEETS.ppr)!;
    const curve = wb.getWorksheet(COST_XLSX_SHEETS.curve)!;
    assert.equal(cover.getCell("A1").value, COST_EXPORT_BRAND);
    assert.equal(ppr.getCell("A1").value, COST_EXPORT_BRAND);
    assert.equal(ppr.getCell("A3").value, PPR_REPORT_TITLE);
    assert.ok(steelFill(cover.getCell("A1")));
    assert.ok(steelFill(ppr.getCell("A1")));
    assert.ok(steelFill(curve.getCell("A1")));
    assert.equal(fillArgb(ppr.getCell("J7")).replace(/^FF/, ""), PPR_EXPENDED_FILL.replace(/^FF/, ""));
    assert.equal(fillArgb(ppr.getCell("N7")).replace(/^FF/, ""), PPR_EARNED_FILL.replace(/^FF/, ""));
    assert.match(String(ppr.getCell("A5").value ?? ""), /Prepared by: Robert Henderson/);
    assert.match(String(ppr.getCell("A5").value ?? ""), /Status: Budgetary/);
    assert.equal(ppr.views?.[0]?.ySplit, 9);
    assert.match(
      costReportXlsxFilename({ site: input.site, title: input.title, statusDate: "2026-09-01" }),
      /hit-squad-wood-river-cat-2-pit-stop-ppr-2026-09-01\.xlsx$/,
    );
    const zip = await JSZip.loadAsync(bytes);
    const chartFiles = Object.keys(zip.files).filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name));
    assert.ok(chartFiles.length >= 12);
    const chartXmls = await Promise.all(chartFiles.map((name) => zip.file(name)!.async("string")));
    const joined = chartXmls.join("\n");
    assert.ok(chartXmls.some((xml) => /doughnutChart/.test(xml) && /Subcontractor/.test(xml)));
    assert.ok(chartXmls.some((xml) => /doughnutChart/.test(xml) && /Direct craft labor/.test(xml)));
    assert.ok(chartXmls.some((xml) => /doughnutChart/.test(xml) && /Indirect labor/.test(xml)));
    assert.ok(chartXmls.some((xml) => /lineChart/.test(xml)));
    assert.match(joined, new RegExp(S_CURVE_STEEL));
    assert.match(joined, new RegExp(S_CURVE_AMBER));
    assert.match(joined, /Job cost mix/);
    assert.match(joined, /Forecast vs Expended/);
    assert.match(joined, /Per diem and travel/);
    assert.match(joined, /Equipment and rentals/);
    assert.match(joined, /Materials and other/);
    assert.match(joined, /Hours by craft/);
    assert.match(joined, /Peak headcount/);
    const source = readFileSync(fileURLToPath(new URL("./cost-report-xlsx.ts", import.meta.url)), "utf8");
    assert.equal(/field trial|forgebook|not a release/i.test(source), false);
    assert.match(source, /companyLogo/);
    const desk = readFileSync(fileURLToPath(new URL("../components/CostReportDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, /costReportToXlsx/);
    assert.match(desk, /downloadXlsx/);
    assert.match(desk, /company-logo/);
    assert.match(desk, /status: pack\.status/);
    assert.match(desk, /subcontractor: readSubSheet/);
    assert.match(String(COST_EXPORT_CONFIDENTIAL), /Confidential/);
  });

  it("parses Turnip ClientActual headers and maps WO codes onto PPR lanes", () => {
    const paste = parseTurnipPaste(
      [
        TURNIP15_HEADERS.join("\t"),
        ["100", "Direct Labor", "40", "4400", "0", "0", "4400"].join("\t"),
        ["505", "Per Diem", "0", "0", "910", "0", "910"].join("\t"),
        ["702", "Staff", "10", "1500", "0", "0", "1500"].join("\t"),
      ].join("\n"),
      "15",
    );
    assert.equal(paste.headers[0], "ChargeCode");
    assert.ok(paste.headers.includes("LaborTotal_ClientActual_Units"));
    assert.equal(paste.rows[0]?.hours, 40);
    assert.equal(paste.rows[0]?.dollars, 4400);
    assert.equal(paste.rows[0]?.lane, "direct");
    assert.equal(paste.rows[1]?.pdDollars, 910);
    assert.equal(pprLaneFromChargeCode("100"), "direct");
    assert.equal(pprLaneFromChargeCode("400"), "foremen");
    assert.equal(pprLaneFromChargeCode("500"), "support");
    assert.equal(pprLaneFromChargeCode("515"), "perDiem");
    assert.equal(pprLaneFromChargeCode("702"), "staff");
    assert.equal(pprLaneFromChargeCode("721"), "materials");
    assert.equal(pprLaneFromChargeCode("725"), "rentals");
    assert.equal(pprLaneFromChargeCode("727"), "coe");
    assert.equal(pprLaneFromChargeCode("730"), "subs");
    const craft = parseTurnipPaste("event_dt\tUnits\n09/01/2026\t12", "16");
    assert.equal(craft.rows[0]?.date, "2026-09-01");
    assert.equal(craft.rows[0]?.hours, 12);
  });

  it("Day-1 earned tracks expended on Direct and uses Direct % for Support", () => {
    const input = fixtureBook();
    const lines = buildPprLines(input.budget, input.book);
    const direct = lines.find((line) => line.label === "Pipefitter Journeyman");
    assert.ok(direct);
    assert.equal(direct.earnedHoursToDate, direct.expendedHoursToDate);
    const support = lines.find((line) => line.id === "support");
    assert.ok(support);
    if (support.forecastHours > 0 && direct.forecastHours > 0) {
      const pct = direct.expendedHoursToDate / direct.forecastHours;
      assert.ok(Math.abs(support.earnedHoursToDate - pct * support.forecastHours) < 0.02);
    }
  });

  it("sample workbook is synthetic and uses Turnip field names", async () => {
    const sample = sampleCostReportInput();
    assert.match(sample.title || "", /SAMPLE/);
    assert.equal(sample.sample, true);
    const bytes = await costReportToXlsx(sample);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ppr = wb.getWorksheet(COST_XLSX_SHEETS.ppr)!;
    const t15 = wb.getWorksheet(COST_XLSX_SHEETS.export15)!;
    assert.match(String(ppr.getCell("A6").value ?? ""), /SAMPLE/);
    assert.equal(t15.getCell("A6").value, "ChargeCode");
    assert.equal(t15.getCell("C6").value, "LaborTotal_ClientActual_Units");
    assert.equal(Number(t15.getCell("A7").value), 100);
    assert.notEqual(String(t15.getCell("A6").value), "Date");
    const charts = wb.getWorksheet(COST_XLSX_SHEETS.charts)!;
    const data = wb.getWorksheet(COST_XLSX_SHEETS.chartData)!;
    assert.equal(wb.worksheets[0]?.name, COST_XLSX_SHEETS.charts);
    assert.match(String(charts.getCell("A3").value ?? ""), /Cost, Progress/);
    assert.equal(data.getCell("A7").value, "SAMPLE NDE");
    assert.equal(data.getCell("A8").value, "SAMPLE Insulation");
    assert.equal(data.getCell("A9").value, "SAMPLE Scaffold");
    assert.equal(data.getCell("A10").value, "SAMPLE Crane");
    assert.ok(Number(data.getCell("B7").value) > 0);
    const zip = await JSZip.loadAsync(bytes);
    const chartXmls = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name))
        .map((name) => zip.file(name)!.async("string")),
    );
    assert.ok(chartXmls.some((xml) => /doughnutChart/.test(xml) && /Subcontractor costs/.test(xml)));
    assert.ok(chartXmls.some((xml) => /Direct craft labor/.test(xml)));
    assert.ok(chartXmls.some((xml) => /Indirect labor/.test(xml)));
    assert.ok(chartXmls.some((xml) => /Equipment and rentals/.test(xml)));
    assert.ok(chartXmls.some((xml) => /Materials and other/.test(xml)));
    assert.ok(chartXmls.some((xml) => /Peak headcount/.test(xml)));
    assert.equal(data.getCell("H7").value, "Pipefitter Journeyman");
    assert.equal(data.getCell("L7").value, "Foremen");
    assert.equal(data.getCell("P7").value, "Per Diem");
    assert.equal(data.getCell("T7").value, "Company Owned Equipment");
    assert.equal(data.getCell("X7").value, "Materials");
    const source = readFileSync(fileURLToPath(new URL("./cost-report-sample.ts", import.meta.url)), "utf8");
    assert.equal(/PCA000110|mike-cost-report-map|\.xls\b/i.test(source), false);
  });
});
