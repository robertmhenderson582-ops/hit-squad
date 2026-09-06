/**
 * Client-facing Cost / Progress / Performance workbook.
 * Total Project PPR is Mike’s dense multi-header print sheet.
 * Budget cells are values from the live desk pack — never Mike’s Estimate
 * Summary Excel links. Actuals / earned come from Turnip 15 / 16 ClientActual
 * fields. Earned / % complete bind to Schedule / Progress KPI
 * (01 DailyReport_TOTAL Earned Mhr) when entered; otherwise Day-0
 * stand-in (Direct earned = expended). Charts lead the send package;
 * Cover + PPR + Hrs S-curve + Report log follow.
 */
import {
  ESTIMATE_EXPORT_BRAND,
  ESTIMATE_EXPORT_PRODUCER,
  ESTIMATE_PREPARED_BY_LABEL,
  ESTIMATE_STATUS_LABEL,
} from "./estimate-xlsx.ts";
import { clampEstimateStatus, parseEstimateStatus } from "./estimate-status.ts";
import {
  COST_REPORT_NOUN,
  buildCostCurve,
  costActualsFromPastes,
  scheduleKpiEntered,
  snapshotList,
  type CostBudget,
  type CostCurvePoint,
  type CostReportBook,
  type TurnipPaste,
} from "./cost-report.ts";
import {
  PPR_REPORT_TITLE,
  PPR_SHEET_ROLE,
  TURNIP15_HEADERS,
  TURNIP15_TITLE,
  TURNIP16_HEADERS,
  TURNIP16_TITLE,
  buildPprLines,
  pprEarnedNote,
  pprTotalLine,
  type PprComputedLine,
} from "./cost-report-ppr.ts";
import { lineAmount, subCardTotal, type SubSheet } from "./subcontractor.ts";
import { buildWorkbook, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";
import { CHART_AMBER, CHART_STEEL, embedWorkbookCharts, type ChartEmbed } from "./xlsx-charts.ts";
import { slugify } from "./estimate-pack.ts";

export const COST_XLSX_SHEETS = {
  charts: "Charts",
  cover: "Cover",
  ppr: "Total Project PPR",
  curve: "Hrs S-curve",
  log: "Report log",
  export15: "T3 Export 15",
  export16: "T3 Export 16",
  chartData: "_ChartData",
} as const;

export const COST_XLSX_CLIENT_SHEETS = [
  COST_XLSX_SHEETS.charts,
  COST_XLSX_SHEETS.cover,
  COST_XLSX_SHEETS.ppr,
  COST_XLSX_SHEETS.curve,
  COST_XLSX_SHEETS.log,
] as const;

export const COST_XLSX_APPENDIX_SHEETS = [COST_XLSX_SHEETS.export15, COST_XLSX_SHEETS.export16] as const;
export const COST_XLSX_HIDDEN_SHEETS = [COST_XLSX_SHEETS.chartData] as const;

export const COST_EXPORT_BRAND = ESTIMATE_EXPORT_BRAND;
export const COST_EXPORT_PRODUCER = ESTIMATE_EXPORT_PRODUCER;
export const COST_EXPORT_CONFIDENTIAL = "Confidential cost / progress / performance report";

/** PPR data starts under the 3-row multi-header (rows 7–9). */
export const PPR_HEADER_ROWS = [7, 8, 9] as const;
export const PPR_FIRST_DATA_ROW = 10;
export const PPR_LAST_COL = "T";

export type CostReportXlsxInput = {
  title?: string;
  client?: string;
  site?: string;
  jobNumber?: string;
  statusDate?: string;
  budget: CostBudget;
  book: CostReportBook;
  curve?: CostCurvePoint[];
  preparedBy?: string;
  /** Live pack estimate status. Export-only. */
  status?: string | null;
  regularClient?: boolean;
  /** Live company-record logo (same path as estimate export). */
  companyLogo?: string | null;
  /** Synthetic Look QA package — watermark only, never real P66 dollars. */
  sample?: boolean;
  /** Live pack Subcontractor sheet — vendor slices for the doughnut. */
  subcontractor?: SubSheet;
};

function pushText(cells: SheetCell[], ref: string, value: string) {
  cells.push({ ref, type: "text", value });
}

function pushNum(cells: SheetCell[], ref: string, value: number, numFmt?: string) {
  cells.push(numFmt ? { ref, type: "number", value, numFmt } : { ref, type: "number", value });
}

function pushFormula(cells: SheetCell[], ref: string, value: string, numFmt?: string) {
  cells.push(numFmt ? { ref, type: "formula", value, numFmt } : { ref, type: "formula", value });
}

function moneyFmt() {
  return "$#,##0.00";
}

function hoursFmt() {
  return "#,##0.00";
}

function rateFmt() {
  return "$#,##0.00";
}

function pctFmt() {
  return "0.0%";
}

function factorFmt() {
  return "0.00";
}

function quoteSheet(name: string) {
  return /[^A-Za-z0-9]/.test(name) ? `'${name.replaceAll("'", "''")}'` : name;
}

export function pprSheetRef(ref: string) {
  return `${quoteSheet(COST_XLSX_SHEETS.ppr)}!${ref}`;
}

export function chartDataRange(col: string, first: number, last: number) {
  return `${quoteSheet(COST_XLSX_SHEETS.chartData)}!$${col}$${first}:$${col}$${last}`;
}

function curveSheetRange(col: string, first: number, last: number) {
  return `${quoteSheet(COST_XLSX_SHEETS.curve)}!$${col}$${first}:$${col}$${last}`;
}

const JOB_MIX: Array<{ label: string; ids: string[] }> = [
  { label: "Direct Labor", ids: ["sub-direct"] },
  { label: "Indirect labor", ids: ["foremen", "support", "staff"] },
  { label: "Per diem / travel", ids: ["perDiem", "travel"] },
  { label: "Equipment (COE)", ids: ["coe"] },
  { label: "3rd Party Rentals", ids: ["rentals"] },
  { label: "Subcontractors", ids: ["subs"] },
  { label: "Materials / other", ids: ["materials", "weather", "onboarding"] },
];

const INDIRECT_LANES: Array<{ label: string; id: string }> = [
  { label: "Foremen", id: "foremen" },
  { label: "Support", id: "support" },
  { label: "Staff", id: "staff" },
];

const PD_TRAVEL_LANES: Array<{ label: string; id: string }> = [
  { label: "Per Diem", id: "perDiem" },
  { label: "Mileage / Travel", id: "travel" },
];

const EQUIP_RENTAL_LANES: Array<{ label: string; id: string }> = [
  { label: "Company Owned Equipment", id: "coe" },
  { label: "3rd Party Rentals", id: "rentals" },
];

const MATERIALS_LANES: Array<{ label: string; id: string }> = [
  { label: "Materials", id: "materials" },
  { label: "Weather Delays", id: "weather" },
  { label: "Onboarding", id: "onboarding" },
];

function pprRowById(input: CostReportXlsxInput) {
  const { lines, first } = pprLayout(input);
  const map = new Map<string, number>();
  lines.forEach((line, index) => map.set(line.id, first + index));
  return map;
}

function pprSumFormula(col: string, rows: number[]) {
  const refs = rows.filter((row) => row > 0).map((row) => pprSheetRef(`${col}${row}`));
  if (!refs.length) return "0";
  if (refs.length === 1) return refs[0]!;
  return `SUM(${refs.join(",")})`;
}

export function subcontractorSlices(input: CostReportXlsxInput): { vendor: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const line of input.subcontractor?.lines ?? []) {
    const vendor = (line.vendor || line.scope || "Subcontractor").trim();
    const amount = lineAmount(line);
    if (!vendor || !(amount > 0)) continue;
    map.set(vendor, (map.get(vendor) ?? 0) + amount);
  }
  for (const card of input.subcontractor?.cards ?? []) {
    const vendor = (card.vendor || "Subcontractor").trim();
    const amount = subCardTotal(card, { site: input.site, client: input.client });
    if (!vendor || !(amount > 0)) continue;
    map.set(vendor, (map.get(vendor) ?? 0) + amount);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([vendor, amount]) => ({ vendor, amount }));
}

export function craftHoursSlices(paste: TurnipPaste): { craft: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const row of paste.rows) {
    const craft = (row.craft || "").trim();
    const hours = row.hours || 0;
    if (!craft || !(hours > 0)) continue;
    map.set(craft, (map.get(craft) ?? 0) + hours);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([craft, hours]) => ({ craft, hours }));
}

export function craftHeadcountSlices(paste: TurnipPaste): { craft: string; headcount: number }[] {
  const map = new Map<string, number>();
  for (const row of paste.rows) {
    const craft = (row.craft || "").trim();
    const headcount = row.headcount || 0;
    if (!craft || !(headcount > 0)) continue;
    map.set(craft, Math.max(map.get(craft) ?? 0, headcount));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([craft, headcount]) => ({ craft, headcount }));
}

function pprCraftEntries(input: CostReportXlsxInput): { label: string; row: number }[] {
  const { lines, first } = pprLayout(input);
  const out: { label: string; row: number }[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== "line") return;
    if (line.lane === "craft" || line.id === "direct-unassigned" || line.id === "direct-line") {
      out.push({ label: line.label, row: first + index });
    }
  });
  if (!out.length) {
    const row = pprRowById(input).get("sub-direct");
    if (row) out.push({ label: "Direct Labor", row });
  }
  return out;
}

function jobLine(input: CostReportXlsxInput) {
  return [input.client, input.title, input.site].filter((part) => String(part || "").trim()).join("  ·  ");
}

function statusDateOf(input: CostReportXlsxInput) {
  return input.statusDate || input.book.statusDate || "";
}

function yearOf(input: CostReportXlsxInput) {
  const stamp = statusDateOf(input);
  return /^\d{4}/.test(stamp) ? stamp.slice(0, 4) : String(new Date().getFullYear());
}

function jobNumberOf(input: CostReportXlsxInput) {
  return (input.jobNumber || "").trim() || `${yearOf(input)}-${slugify(input.site || "job").slice(0, 12) || "job"}`;
}

function estimateStatusOf(input: CostReportXlsxInput) {
  if (input.status == null || String(input.status).trim() === "") return "";
  return clampEstimateStatus(parseEstimateStatus(input.status), Boolean(input.regularClient));
}

function preparedByOf(input: CostReportXlsxInput) {
  return (input.preparedBy || "").replace(/\s+/g, " ").trim();
}

function sampleLabel(input: CostReportXlsxInput) {
  return input.sample ? "SAMPLE — synthetic hours and dollars for Look QA. Not a client actual." : "";
}

function pprLinesOf(input: CostReportXlsxInput) {
  return buildPprLines(input.budget, { ...input.book, statusDate: statusDateOf(input) });
}

export function pprLayout(input: CostReportXlsxInput) {
  const lines = pprLinesOf(input);
  const first = PPR_FIRST_DATA_ROW;
  const totalIndex = lines.findIndex((line) => line.kind === "total");
  const totalRow = first + (totalIndex >= 0 ? totalIndex : lines.length - 1);
  const notesRow = totalRow + 2;
  return { lines, first, totalRow, notesRow };
}

function buildCoverSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = [];
  const { totalRow } = pprLayout(input);
  const status = estimateStatusOf(input);
  const prepared = preparedByOf(input) || COST_EXPORT_PRODUCER;
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", PPR_REPORT_TITLE);
  pushText(cells, "A4", `${PPR_SHEET_ROLE}  ·  Job ${jobNumberOf(input)}  ·  ${yearOf(input)}`);
  pushText(
    cells,
    "A5",
    [
      statusDateOf(input) ? `Status Date ${statusDateOf(input)}` : "",
      status ? `${ESTIMATE_STATUS_LABEL}: ${status}` : "",
      prepared ? `${ESTIMATE_PREPARED_BY_LABEL}: ${prepared}` : "",
    ]
      .filter(Boolean)
      .join("  ·  "),
  );
  pushText(cells, "A6", sampleLabel(input) || COST_EXPORT_CONFIDENTIAL);
  pushText(cells, "A8", "Field");
  pushText(cells, "B8", "Detail");
  pushText(cells, "D8", "PPR snapshot");
  pushText(cells, "E8", "Value");
  const fields: Array<[string, string]> = [
    ["Client", (input.client || "").trim() || "—"],
    ["Job", (input.title || "").trim() || COST_REPORT_NOUN],
    ["Site", (input.site || "").trim() || "—"],
    ["Job #", jobNumberOf(input)],
    ["Status Date", statusDateOf(input) || "—"],
    ["Estimate status", status || "—"],
    [ESTIMATE_PREPARED_BY_LABEL, prepared],
    ["Notes", input.book.notes.trim() || "—"],
  ];
  fields.forEach(([label, value], index) => {
    const row = 9 + index;
    pushText(cells, `A${row}`, label);
    pushText(cells, `B${row}`, value);
  });
  const snaps: Array<{ label: string; formula: string; fmt: string }> = [
    { label: "Current Forecast $", formula: pprSheetRef(`D${totalRow}`), fmt: moneyFmt() },
    { label: "Dollars Expended To Date", formula: pprSheetRef(`M${totalRow}`), fmt: moneyFmt() },
    { label: "Workhours Budget", formula: pprSheetRef(`G${totalRow}`), fmt: hoursFmt() },
    { label: "Hours Expended To Date", formula: pprSheetRef(`K${totalRow}`), fmt: hoursFmt() },
    { label: "Hours Earned To Date", formula: pprSheetRef(`O${totalRow}`), fmt: hoursFmt() },
    { label: "Physical % Complete", formula: pprSheetRef(`Q${totalRow}`), fmt: pctFmt() },
    { label: "Performance To Date", formula: pprSheetRef(`S${totalRow}`), fmt: factorFmt() },
    { label: "Hours To Go", formula: pprSheetRef(`T${totalRow}`), fmt: hoursFmt() },
  ];
  snaps.forEach((snap, index) => {
    const row = 9 + index;
    pushText(cells, `D${row}`, snap.label);
    pushFormula(cells, `E${row}`, snap.formula, snap.fmt);
  });
  pushText(
    cells,
    "A18",
    "Charts lead the package. Budget from this job’s live estimate pack. Actuals from Turnip T3 Export 15 / 16 through the Status Date. Yellow = Expended. Cyan = Earned.",
  );
  return {
    name: COST_XLSX_SHEETS.cover,
    cells,
    merges: ["A1:E1", "A2:E2", "A3:E3", "A4:E4", "A5:E5", "A6:E6", "A18:E18"],
    headerRows: [8],
    chrome: "cover",
    freeze: { ySplit: 6 },
    printTitlesRow: "1:6",
    fitToHeight: 1,
  };
}

function writePprHeaders(cells: SheetCell[]) {
  const groups: Array<{ start: string; end: string; title: string; unit: string }> = [
    { start: "B", end: "D", title: "Dollars Budget", unit: "$" },
    { start: "E", end: "G", title: "Workhours Budget", unit: "Hrs" },
    { start: "H", end: "I", title: "Wage Rate", unit: "$ / Hr" },
    { start: "J", end: "K", title: "Work Hours Expended", unit: "Hrs" },
    { start: "L", end: "M", title: "Dollars Expended", unit: "$" },
    { start: "N", end: "O", title: "Work Hours Earned", unit: "Hrs" },
    { start: "P", end: "Q", title: "Physical % Complete", unit: "%" },
    { start: "R", end: "T", title: "Performance", unit: "" },
  ];
  pushText(cells, "A7", "Account / Description");
  pushText(cells, "A8", "");
  pushText(cells, "A9", "");
  for (const group of groups) {
    pushText(cells, `${group.start}7`, group.title);
    pushText(cells, `${group.start}8`, group.unit);
  }
  const detail: Array<[string, string]> = [
    ["B", "Original"],
    ["C", "Revised"],
    ["D", "Current Forecast"],
    ["E", "Original"],
    ["F", "Revised"],
    ["G", "Current Forecast"],
    ["H", "Budget Rate"],
    ["I", "Actual Rate"],
    ["J", "Daily"],
    ["K", "To Date"],
    ["L", "Daily"],
    ["M", "To Date"],
    ["N", "Daily"],
    ["O", "To Date"],
    ["P", "Daily"],
    ["Q", "To Date"],
    ["R", "To Go Forecast"],
    ["S", "To Date"],
    ["T", "Hours To Go"],
  ];
  for (const [col, label] of detail) pushText(cells, `${col}9`, label);
}

function writePprLine(cells: SheetCell[], row: number, line: PprComputedLine, memberRows?: number[]) {
  pushText(cells, `A${row}`, line.label);
  if (line.kind === "section") return;
  if (line.kind === "subtotal" || line.kind === "total") {
    const span = memberRows?.length ? memberRows : [row];
    const sum = (col: string) => (span.length ? `SUM(${span.map((item) => `${col}${item}`).join(",")})` : "0");
    pushFormula(cells, `B${row}`, sum("B"), moneyFmt());
    pushFormula(cells, `C${row}`, sum("C"), moneyFmt());
    pushFormula(cells, `D${row}`, sum("D"), moneyFmt());
    pushFormula(cells, `E${row}`, sum("E"), hoursFmt());
    pushFormula(cells, `F${row}`, sum("F"), hoursFmt());
    pushFormula(cells, `G${row}`, sum("G"), hoursFmt());
    pushFormula(cells, `H${row}`, `IF(G${row}=0,0,D${row}/G${row})`, rateFmt());
    pushFormula(cells, `I${row}`, `IF(K${row}=0,0,M${row}/K${row})`, rateFmt());
    pushFormula(cells, `J${row}`, sum("J"), hoursFmt());
    pushFormula(cells, `K${row}`, sum("K"), hoursFmt());
    pushFormula(cells, `L${row}`, sum("L"), moneyFmt());
    pushFormula(cells, `M${row}`, sum("M"), moneyFmt());
    pushFormula(cells, `N${row}`, sum("N"), hoursFmt());
    pushFormula(cells, `O${row}`, sum("O"), hoursFmt());
    pushFormula(cells, `P${row}`, `IF(G${row}=0,0,N${row}/G${row})`, pctFmt());
    pushFormula(cells, `Q${row}`, `IF(G${row}=0,0,O${row}/G${row})`, pctFmt());
    pushFormula(cells, `R${row}`, `D${row}-M${row}`, moneyFmt());
    pushFormula(cells, `S${row}`, `IF(K${row}=0,0,O${row}/K${row})`, factorFmt());
    pushFormula(cells, `T${row}`, `G${row}-O${row}`, hoursFmt());
    return;
  }
  pushNum(cells, `B${row}`, line.originalDollars, moneyFmt());
  pushNum(cells, `C${row}`, line.revisedDollars, moneyFmt());
  pushNum(cells, `D${row}`, line.forecastDollars, moneyFmt());
  pushNum(cells, `E${row}`, line.originalHours, hoursFmt());
  pushNum(cells, `F${row}`, line.revisedHours, hoursFmt());
  pushNum(cells, `G${row}`, line.forecastHours, hoursFmt());
  pushFormula(cells, `H${row}`, `IF(G${row}=0,0,D${row}/G${row})`, rateFmt());
  pushFormula(cells, `I${row}`, `IF(K${row}=0,0,M${row}/K${row})`, rateFmt());
  pushNum(cells, `J${row}`, line.expendedHoursDaily, hoursFmt());
  pushNum(cells, `K${row}`, line.expendedHoursToDate, hoursFmt());
  pushNum(cells, `L${row}`, line.expendedDollarsDaily, moneyFmt());
  pushNum(cells, `M${row}`, line.expendedDollarsToDate, moneyFmt());
  pushNum(cells, `N${row}`, line.earnedHoursDaily, hoursFmt());
  pushNum(cells, `O${row}`, line.earnedHoursToDate, hoursFmt());
  pushFormula(cells, `P${row}`, `IF(G${row}=0,0,N${row}/G${row})`, pctFmt());
  pushFormula(cells, `Q${row}`, `IF(G${row}=0,0,O${row}/G${row})`, pctFmt());
  pushFormula(cells, `R${row}`, `D${row}-M${row}`, moneyFmt());
  pushFormula(cells, `S${row}`, `IF(K${row}=0,0,O${row}/K${row})`, factorFmt());
  pushFormula(cells, `T${row}`, `G${row}-O${row}`, hoursFmt());
}

function buildPprSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = [];
  const { lines, first, totalRow, notesRow } = pprLayout(input);
  const earnedNote = pprEarnedNote(scheduleKpiEntered(input.book.schedule));
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", PPR_REPORT_TITLE);
  pushText(cells, "A4", `${PPR_SHEET_ROLE}  ·  Job ${jobNumberOf(input)}  ·  ${yearOf(input)}  ·  ${input.site || ""}`);
  pushText(
    cells,
    "A5",
    [
      `Status Date ${statusDateOf(input) || "—"}`,
      estimateStatusOf(input) ? `${ESTIMATE_STATUS_LABEL}: ${estimateStatusOf(input)}` : "",
      preparedByOf(input) ? `${ESTIMATE_PREPARED_BY_LABEL}: ${preparedByOf(input)}` : "",
      COST_EXPORT_PRODUCER,
    ]
      .filter(Boolean)
      .join("  ·  "),
  );
  pushText(cells, "A6", sampleLabel(input) || "Yellow = Expended  ·  Cyan = Earned  ·  Budget from live estimate pack");
  writePprHeaders(cells);

  const rowOf = new Map<string, number>();
  lines.forEach((line, index) => rowOf.set(line.id, first + index));
  const craftRows = lines.filter((line) => line.lane === "craft" || line.id === "direct-line" || line.id === "direct-unassigned").map((line) => rowOf.get(line.id)!);
  const indirectRows = ["foremen", "support", "staff", "perDiem", "travel", "weather", "onboarding"]
    .map((id) => rowOf.get(id))
    .filter((row): row is number => Boolean(row));
  const matRows = ["materials", "coe", "subs", "rentals"]
    .map((id) => rowOf.get(id))
    .filter((row): row is number => Boolean(row));
  const laborMembers = [...craftRows, ...indirectRows];
  const totalMembers = [rowOf.get("sub-labor"), rowOf.get("sub-mat")].filter((row): row is number => Boolean(row));

  lines.forEach((line, index) => {
    const row = first + index;
    if (line.id === "sub-direct") writePprLine(cells, row, line, craftRows);
    else if (line.id === "sub-labor") writePprLine(cells, row, line, laborMembers);
    else if (line.id === "sub-mat") writePprLine(cells, row, line, matRows);
    else if (line.kind === "total") writePprLine(cells, row, line, totalMembers);
    else writePprLine(cells, row, line);
  });

  pushText(cells, `A${notesRow}`, "Notes");
  pushText(cells, `B${notesRow}`, [input.book.notes.trim(), earnedNote].filter(Boolean).join("  ·  "));
  const merges = [
    "A1:T1",
    "A2:T2",
    "A3:T3",
    "A4:T4",
    "A5:T5",
    "A6:T6",
    "A7:A9",
    "B7:D7",
    "E7:G7",
    "H7:I7",
    "J7:K7",
    "L7:M7",
    "N7:O7",
    "P7:Q7",
    "R7:T7",
    "B8:D8",
    "E8:G8",
    "H8:I8",
    "J8:K8",
    "L8:M8",
    "N8:O8",
    "P8:Q8",
    "R8:T8",
    `B${notesRow}:T${notesRow}`,
  ];
  return {
    name: COST_XLSX_SHEETS.ppr,
    cells,
    merges,
    headerRows: [...PPR_HEADER_ROWS],
    chrome: "ppr",
    freeze: { xSplit: 1, ySplit: 9 },
    printTitlesRow: "7:9",
    fitToHeight: 1,
    comments: [{ ref: `A${totalRow}`, text: earnedNote }],
  };
}

function buildCurveSheet(input: CostReportXlsxInput, curve: CostCurvePoint[]): WorkbookSheet {
  const cells: SheetCell[] = [];
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", "Hours S-curve  ·  steel = live-pack estimate  ·  amber = T3 Export 16 spent");
  pushText(cells, "A6", "Date");
  pushText(cells, "B6", "Est hours");
  pushText(cells, "C6", "Act hours");
  pushText(cells, "D6", "Cum est hours");
  pushText(cells, "E6", "Cum act hours");
  pushText(cells, "F6", "Est headcount");
  pushText(cells, "G6", "Act headcount");
  if (!curve.length) {
    pushText(cells, "A7", "Paste T3 Export 16 (event_dt + Units) or set crew dates to draw the S-curve.");
  }
  curve.forEach((point, index) => {
    const row = 7 + index;
    pushText(cells, `A${row}`, point.date);
    pushNum(cells, `B${row}`, point.estHours, hoursFmt());
    pushNum(cells, `C${row}`, point.actHours, hoursFmt());
    pushFormula(cells, `D${row}`, index === 0 ? `B${row}` : `D${row - 1}+B${row}`, hoursFmt());
    pushFormula(cells, `E${row}`, index === 0 ? `C${row}` : `E${row - 1}+C${row}`, hoursFmt());
    pushNum(cells, `F${row}`, point.estHeadcount, hoursFmt());
    pushNum(cells, `G${row}`, point.actHeadcount, hoursFmt());
  });
  const lastData = curve.length ? 6 + curve.length : 7;
  const captionRow = lastData + 2;
  const footnoteRow = captionRow + 16;
  pushText(cells, `A${captionRow}`, "Cumulative hours — estimate vs actuals");
  pushText(
    cells,
    `A${footnoteRow}`,
    "Steel = live-pack estimate  ·  Amber = T3 Export 16 Units  ·  chart-ready columns D / E",
  );
  return {
    name: COST_XLSX_SHEETS.curve,
    cells,
    merges: ["A1:G1", "A2:G2", "A3:G3", `A${captionRow}:G${captionRow}`, `A${footnoteRow}:G${footnoteRow}`],
    headerRows: [6],
  };
}

function turnipHeaders(kind: "15" | "16", paste: TurnipPaste) {
  if (paste.headers?.length) return paste.headers;
  return kind === "15" ? [...TURNIP15_HEADERS] : [...TURNIP16_HEADERS];
}

function colLetterFromIndex(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildTurnipSheet(
  name: string,
  subtitle: string,
  kind: "15" | "16",
  input: CostReportXlsxInput,
  paste: TurnipPaste,
): WorkbookSheet {
  const cells: SheetCell[] = [];
  const headers = turnipHeaders(kind, paste);
  const lastCol = colLetterFromIndex(Math.max(headers.length, 1));
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", `${subtitle}  ·  Status Date ${statusDateOf(input) || "—"}`);
  headers.forEach((header, index) => {
    pushText(cells, `${colLetterFromIndex(index + 1)}6`, header);
  });
  const grid = paste.grid?.length
    ? paste.grid
    : paste.rows.map((row) =>
        kind === "15"
          ? [
              row.code,
              row.craft,
              String(row.hours || ""),
              String(row.dollars || ""),
              String(row.pdDollars || ""),
              String(row.otherUnits || ""),
              String(moneyOf(row)),
            ]
          : [
              row.date,
              row.craft,
              row.employee,
              String(row.hours || ""),
              String(row.st || ""),
              String(row.ot || ""),
              String(row.dt || ""),
              row.code,
              String(row.headcount || ""),
            ],
      );
  if (!grid.length) {
    pushText(cells, "A7", "No paste on this estimate yet. Upload stays on the desk — not in git.");
  }
  grid.forEach((row, index) => {
    const excelRow = 7 + index;
    row.forEach((value, col) => {
      const ref = `${colLetterFromIndex(col + 1)}${excelRow}`;
      const header = headers[col] ?? "";
      if (looksNumericHeader(header) && value !== "" && Number.isFinite(Number(String(value).replace(/[^0-9.-]/g, "")))) {
        const n = Number(String(value).replace(/[^0-9.-]/g, ""));
        pushNum(cells, ref, n, /dollar|amount|\$/i.test(header) ? moneyFmt() : hoursFmt());
      } else {
        pushText(cells, ref, value);
      }
    });
  });
  return {
    name,
    cells,
    merges: [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`],
    headerRows: [6],
  };
}

function moneyOf(row: { dollars: number; pdDollars?: number }) {
  return Math.round((row.dollars + (row.pdDollars || 0)) * 100) / 100;
}

function looksNumericHeader(header: string) {
  return /units|dollars|amount|hours|headcount|qty|\$|chargecode|^code$/i.test(header);
}

function buildLogSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = [];
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", "Dated daily report log");
  pushText(cells, "A6", "Status date");
  pushText(cells, "B6", "Saved");
  pushText(cells, "C6", "Forecast $");
  pushText(cells, "D6", "Expended $");
  pushText(cells, "E6", "Budget hours");
  pushText(cells, "F6", "Expended hours");
  pushText(cells, "G6", "Notes");
  const shots = snapshotList(input.book);
  if (!shots.length) {
    pushText(cells, "A7", "No saved days yet. Set the status date and save on the desk.");
  }
  shots.forEach((shot, index) => {
    const row = 7 + index;
    pushText(cells, `A${row}`, shot.statusDate);
    pushText(cells, `B${row}`, new Date(shot.savedAt).toISOString().slice(0, 19).replace("T", " "));
    pushNum(cells, `C${row}`, shot.budget.total, moneyFmt());
    pushNum(cells, `D${row}`, shot.actuals.dollars, moneyFmt());
    pushNum(cells, `E${row}`, shot.budget.hours, hoursFmt());
    pushNum(cells, `F${row}`, shot.actuals.hours, hoursFmt());
    pushText(cells, `G${row}`, shot.notes);
  });
  return {
    name: COST_XLSX_SHEETS.log,
    cells,
    merges: ["A1:G1", "A2:G2", "A3:G3"],
    headerRows: [6],
  };
}

function rowsForIds(rowOf: Map<string, number>, ids: string[]) {
  return ids.map((id) => rowOf.get(id) ?? 0).filter((row) => row > 0);
}

/** Chart source tables start on row 7 so instrument chrome (rows 1–6) cannot eat them. */
const CHART_DATA_FIRST = 7;

function writePairTable(
  cells: SheetCell[],
  labelCol: string,
  budgetCol: string,
  actualCol: string,
  labelHeader: string,
  items: Array<{ label: string; budget: string; actual: string }>,
) {
  pushText(cells, `${labelCol}6`, labelHeader);
  pushText(cells, `${budgetCol}6`, "Forecast $");
  pushText(cells, `${actualCol}6`, "Expended $");
  items.forEach((item, index) => {
    const row = CHART_DATA_FIRST + index;
    pushText(cells, `${labelCol}${row}`, item.label);
    pushFormula(cells, `${budgetCol}${row}`, item.budget, moneyFmt());
    pushFormula(cells, `${actualCol}${row}`, item.actual, moneyFmt());
  });
}

function laneItems(rowOf: Map<string, number>, lanes: Array<{ label: string; id: string }>) {
  return lanes.map((lane) => {
    const row = rowOf.get(lane.id) ?? 0;
    return {
      label: lane.label,
      budget: row ? pprSheetRef(`D${row}`) : "0",
      actual: row ? pprSheetRef(`M${row}`) : "0",
    };
  });
}

function buildChartDataSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = [];
  const rowOf = pprRowById(input);
  const vendors = subcontractorSlices(input);
  const hours = craftHoursSlices(input.book.export16);
  const headcounts = craftHeadcountSlices(input.book.export16);
  const crafts = pprCraftEntries(input);
  const subsRow = rowOf.get("subs") ?? 0;

  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", "Chart source — hidden helper");
  pushText(cells, "A3", "Ranges referenced by the Charts dashboard and Hrs S-curve.");

  pushText(cells, "A6", "Vendor");
  pushText(cells, "B6", "Amount");
  if (vendors.length) {
    vendors.forEach((slice, index) => {
      const row = CHART_DATA_FIRST + index;
      pushText(cells, `A${row}`, slice.vendor);
      pushNum(cells, `B${row}`, slice.amount, moneyFmt());
    });
  } else {
    pushText(cells, `A${CHART_DATA_FIRST}`, "Subcontractors");
    pushFormula(cells, `B${CHART_DATA_FIRST}`, subsRow ? pprSheetRef(`D${subsRow}`) : "0", moneyFmt());
  }

  writePairTable(
    cells,
    "D",
    "E",
    "F",
    "Cost element",
    JOB_MIX.map((element) => ({
      label: element.label,
      budget: pprSumFormula("D", rowsForIds(rowOf, element.ids)),
      actual: pprSumFormula("M", rowsForIds(rowOf, element.ids)),
    })),
  );

  writePairTable(
    cells,
    "H",
    "I",
    "J",
    "Direct craft",
    crafts.map((craft) => ({
      label: craft.label,
      budget: pprSheetRef(`D${craft.row}`),
      actual: pprSheetRef(`M${craft.row}`),
    })),
  );

  writePairTable(cells, "L", "M", "N", "Indirect", laneItems(rowOf, INDIRECT_LANES));
  writePairTable(cells, "P", "Q", "R", "Per diem / travel", laneItems(rowOf, PD_TRAVEL_LANES));
  writePairTable(cells, "T", "U", "V", "Equipment / rentals", laneItems(rowOf, EQUIP_RENTAL_LANES));
  writePairTable(cells, "X", "Y", "Z", "Materials / other", laneItems(rowOf, MATERIALS_LANES));

  pushText(cells, "AB6", "Craft");
  pushText(cells, "AC6", "Hours");
  pushText(cells, "AD6", "Headcount");
  const craftNames = hours.length ? hours.map((item) => item.craft) : headcounts.map((item) => item.craft);
  const uniqueCrafts = craftNames.length ? craftNames : ["Craft hours"];
  uniqueCrafts.forEach((name, index) => {
    const row = CHART_DATA_FIRST + index;
    const hour = hours.find((item) => item.craft === name)?.hours ?? 0;
    const hc = headcounts.find((item) => item.craft === name)?.headcount ?? 0;
    pushText(cells, `AB${row}`, name);
    pushNum(cells, `AC${row}`, hour, hoursFmt());
    pushNum(cells, `AD${row}`, hc, hoursFmt());
  });

  return {
    name: COST_XLSX_SHEETS.chartData,
    cells,
    headerRows: [6],
    veryHidden: true,
  };
}

function buildChartsSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = [];
  const { totalRow } = pprLayout(input);
  pushText(cells, "A1", COST_EXPORT_BRAND);
  pushText(cells, "A2", jobLine(input) || COST_REPORT_NOUN);
  pushText(cells, "A3", PPR_REPORT_TITLE);
  pushText(cells, "A4", `${PPR_SHEET_ROLE}  ·  Job ${jobNumberOf(input)}  ·  ${yearOf(input)}  ·  ${input.site || ""}`);
  pushText(
    cells,
    "A5",
    [
      `Status Date ${statusDateOf(input) || "—"}`,
      estimateStatusOf(input) ? `${ESTIMATE_STATUS_LABEL}: ${estimateStatusOf(input)}` : "",
      preparedByOf(input) ? `${ESTIMATE_PREPARED_BY_LABEL}: ${preparedByOf(input)}` : "",
    ]
      .filter(Boolean)
      .join("  ·  "),
  );
  pushText(cells, "A6", sampleLabel(input) || COST_EXPORT_CONFIDENTIAL);
  pushText(cells, "A7", "Full job cost board — Direct, Indirect, Per diem/travel, Equipment, Rentals, Subs, Materials, hours. PPR field grid follows.");
  pushText(cells, "A8", "Current Forecast $");
  pushText(cells, "C8", "Dollars Expended To Date");
  pushText(cells, "E8", "Physical % Complete");
  pushText(cells, "G8", "Hours To Go");
  pushFormula(cells, "A9", pprSheetRef(`D${totalRow}`), moneyFmt());
  pushFormula(cells, "C9", pprSheetRef(`M${totalRow}`), moneyFmt());
  pushFormula(cells, "E9", pprSheetRef(`Q${totalRow}`), pctFmt());
  pushFormula(cells, "G9", pprSheetRef(`T${totalRow}`), hoursFmt());
  pushText(
    cells,
    "A70",
    "Steel = live-pack forecast  ·  Amber = Turnip expended  ·  Every major PPR cost lane has a graph. Dense field grid is on Total Project PPR.",
  );
  pushText(cells, "X70", "board");
  return {
    name: COST_XLSX_SHEETS.charts,
    cells,
    merges: ["A1:X1", "A2:X2", "A3:X3", "A4:X4", "A5:X5", "A6:X6", "A7:X7", "A70:W70"],
    headerRows: [8],
    chrome: "cover",
    freeze: { ySplit: 6 },
    printTitlesRow: "1:6",
    fitToHeight: 2,
  };
}

function countOrOne(n: number) {
  return Math.max(1, n);
}

function tileAnchor(col: number, row: number): Pick<ChartEmbed, "fromCol" | "fromRow" | "toCol" | "toRow"> {
  const width = 8;
  const height = 15;
  const top = 9;
  return {
    fromCol: col * width,
    fromRow: top + row * height,
    toCol: (col + 1) * width,
    toRow: top + (row + 1) * height,
  };
}

function doughnutEmbed(title: string, catCol: string, valCol: string, last: number, anchor: Pick<ChartEmbed, "fromCol" | "fromRow" | "toCol" | "toRow">, slices: number): ChartEmbed {
  return {
    kind: "doughnut",
    title,
    sheetName: COST_XLSX_SHEETS.charts,
    catRef: chartDataRange(catCol, CHART_DATA_FIRST, last),
    series: [{ name: title, valRef: chartDataRange(valCol, CHART_DATA_FIRST, last) }],
    ...anchor,
    showVal: true,
    showPercent: true,
    showCatName: false,
    valFormat: "$#,##0",
    sliceCount: slices,
  };
}

function pairBarEmbed(title: string, catCol: string, budgetCol: string, actualCol: string, last: number, anchor: Pick<ChartEmbed, "fromCol" | "fromRow" | "toCol" | "toRow">): ChartEmbed {
  return {
    kind: "bar",
    title,
    sheetName: COST_XLSX_SHEETS.charts,
    catRef: chartDataRange(catCol, CHART_DATA_FIRST, last),
    series: [
      { name: "Current Forecast $", nameRef: chartDataRange(budgetCol, 6, 6), valRef: chartDataRange(budgetCol, CHART_DATA_FIRST, last), color: CHART_STEEL },
      { name: "Expended $", nameRef: chartDataRange(actualCol, 6, 6), valRef: chartDataRange(actualCol, CHART_DATA_FIRST, last), color: CHART_AMBER },
    ],
    ...anchor,
    showVal: true,
    valFormat: "$#,##0",
    barDir: "col",
    grouping: "clustered",
  };
}

export function costReportChartEmbeds(input: CostReportXlsxInput, curve: CostCurvePoint[]): ChartEmbed[] {
  const vendors = countOrOne(subcontractorSlices(input).length);
  const mix = JOB_MIX.length;
  const directs = countOrOne(pprCraftEntries(input).length);
  const hours = countOrOne(craftHoursSlices(input.book.export16).length);
  const headcounts = countOrOne(craftHeadcountSlices(input.book.export16).length);
  const last = (n: number) => CHART_DATA_FIRST - 1 + n;
  const embeds: ChartEmbed[] = [
    doughnutEmbed("Job cost mix — Current Forecast by area", "D", "E", last(mix), tileAnchor(0, 0), mix),
    pairBarEmbed("Forecast vs Expended — all cost areas", "D", "E", "F", last(mix), tileAnchor(1, 0)),
    doughnutEmbed("Direct craft labor — by craft (Forecast $)", "H", "I", last(directs), tileAnchor(2, 0), directs),
    doughnutEmbed("Indirect labor — Foremen / Support / Staff", "L", "M", last(INDIRECT_LANES.length), tileAnchor(0, 1), INDIRECT_LANES.length),
    pairBarEmbed("Per diem and travel — Forecast vs Expended", "P", "Q", "R", last(PD_TRAVEL_LANES.length), tileAnchor(1, 1)),
    doughnutEmbed("Subcontractor costs — live pack by vendor", "A", "B", last(vendors), tileAnchor(2, 1), vendors),
    pairBarEmbed("Equipment and rentals — COE vs 3rd Party", "T", "U", "V", last(EQUIP_RENTAL_LANES.length), tileAnchor(0, 2)),
    doughnutEmbed("Materials and other reimbursables — Forecast $", "X", "Y", last(MATERIALS_LANES.length), tileAnchor(1, 2), MATERIALS_LANES.length),
    doughnutEmbed("Where the money went — expended by area", "D", "F", last(mix), tileAnchor(2, 2), mix),
    {
      kind: "bar",
      title: "Hours by craft — T3 Export 16 Units",
      sheetName: COST_XLSX_SHEETS.charts,
      catRef: chartDataRange("AB", CHART_DATA_FIRST, last(hours)),
      series: [{ name: "Hours", valRef: chartDataRange("AC", CHART_DATA_FIRST, last(hours)), color: CHART_AMBER }],
      ...tileAnchor(0, 3),
      showVal: true,
      valFormat: "#,##0.0",
      barDir: "col",
    },
    {
      kind: "bar",
      title: "Peak headcount by craft — T3 Export 16",
      sheetName: COST_XLSX_SHEETS.charts,
      catRef: chartDataRange("AB", CHART_DATA_FIRST, last(headcounts)),
      series: [{ name: "Headcount", valRef: chartDataRange("AD", CHART_DATA_FIRST, last(headcounts)), color: CHART_STEEL }],
      ...tileAnchor(1, 3),
      showVal: true,
      valFormat: "#,##0",
      barDir: "col",
    },
  ];
  const range = curveRange(curve);
  if (range && range.lastRow >= range.firstRow + 1) {
    const sCurve: Omit<ChartEmbed, "sheetName" | "fromCol" | "fromRow" | "toCol" | "toRow"> = {
      kind: "line",
      title: "Hours S-curve — live-pack estimate vs T3 Export 16 actuals",
      catRef: curveSheetRange("A", range.firstRow, range.lastRow),
      series: [
        { name: "Estimate hours", valRef: curveSheetRange("D", range.firstRow, range.lastRow), color: CHART_STEEL },
        { name: "Actual hours", valRef: curveSheetRange("E", range.firstRow, range.lastRow), color: CHART_AMBER },
      ],
      valFormat: "#,##0.0",
      catFormat: "YYYY-MM-DD",
    };
    embeds.push({ ...sCurve, sheetName: COST_XLSX_SHEETS.charts, ...tileAnchor(2, 3) });
    embeds.push({
      ...sCurve,
      sheetName: COST_XLSX_SHEETS.curve,
      fromCol: 0,
      fromRow: range.fromRow,
      toCol: 7,
      toRow: range.toRow,
    });
  }
  return embeds;
}

export function buildCostReportWorkbook(input: CostReportXlsxInput): WorkbookSheet[] {
  const curve =
    input.curve ??
    buildCostCurve([], costActualsFromPastes(input.book.export15, input.book.export16, input.book.statusDate), input.book.statusDate);
  return [
    buildChartsSheet(input),
    buildCoverSheet(input),
    buildPprSheet(input),
    buildCurveSheet(input, curve),
    buildLogSheet(input),
    buildTurnipSheet(COST_XLSX_SHEETS.export15, TURNIP15_TITLE, "15", input, input.book.export15),
    buildTurnipSheet(COST_XLSX_SHEETS.export16, TURNIP16_TITLE, "16", input, input.book.export16),
    buildChartDataSheet(input),
  ];
}

export function costReportXlsxFilename(input: { site?: string; title?: string; statusDate?: string }) {
  const site = slugify((input.site || "").split("—")[0] || "");
  const title = slugify(input.title || "cost-ppr");
  const date = (input.statusDate || "").replace(/[^0-9-]/g, "") || "open";
  return `${["hit-squad", site, title, "ppr", date].filter(Boolean).join("-")}.xlsx`;
}

function curveRange(curve: CostCurvePoint[]) {
  if (!curve.length) return null;
  const lastRow = 6 + curve.length;
  return {
    firstRow: 7,
    lastRow,
    fromRow: lastRow + 1,
    toRow: lastRow + 17,
  };
}

export async function costReportToXlsx(input: CostReportXlsxInput): Promise<Uint8Array> {
  const sheets = buildCostReportWorkbook(input);
  const bytes = await buildWorkbook(sheets, { companyLogo: input.companyLogo });
  if (!bytes.byteLength) throw new Error("empty-workbook");
  const curve =
    input.curve ??
    buildCostCurve([], costActualsFromPastes(input.book.export15, input.book.export16, input.book.statusDate), input.book.statusDate);
  return embedWorkbookCharts(bytes, costReportChartEmbeds(input, curve));
}

export { pprTotalLine };
