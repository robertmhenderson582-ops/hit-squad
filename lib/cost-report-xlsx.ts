/**
 * Client-facing Cost / Progress / Performance workbook.
 * Budget cells are values from the live desk pack. Variance / remaining / % spent
 * are Excel formulas. Look chrome is the same Hit Squad instrument path as the
 * estimate export — not Mike’s old Estimate Summary book.
 * Cover + Total Project PPR + Hrs S-curve + Report log are the send package.
 * Turnip 15/16 stay as a polished appendix after the presentation sheets.
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
  snapshotList,
  type CostBudget,
  type CostCurvePoint,
  type CostReportBook,
  type TurnipPaste,
} from "./cost-report.ts";
import { buildWorkbook, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";
import { embedHoursSCurveChart } from "./xlsx-s-curve-chart.ts";
import { slugify } from "./estimate-pack.ts";

export const COST_XLSX_SHEETS = {
  cover: "Cover",
  ppr: "Total Project PPR",
  curve: "Hrs S-curve",
  log: "Report log",
  export15: "Turnip 15",
  export16: "Turnip 16",
} as const;

export const COST_XLSX_CLIENT_SHEETS = [
  COST_XLSX_SHEETS.cover,
  COST_XLSX_SHEETS.ppr,
  COST_XLSX_SHEETS.curve,
  COST_XLSX_SHEETS.log,
] as const;

export const COST_XLSX_APPENDIX_SHEETS = [COST_XLSX_SHEETS.export15, COST_XLSX_SHEETS.export16] as const;

export const COST_EXPORT_BRAND = ESTIMATE_EXPORT_BRAND;
export const COST_EXPORT_PRODUCER = ESTIMATE_EXPORT_PRODUCER;
export const COST_EXPORT_CONFIDENTIAL = "Confidential cost / progress / performance report";

export type CostReportXlsxInput = {
  title?: string;
  client?: string;
  site?: string;
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

function pctFmt() {
  return "0.0%";
}

function quoteSheet(name: string) {
  return /[^A-Za-z0-9]/.test(name) ? `'${name.replaceAll("'", "''")}'` : name;
}

export function pprSheetRef(ref: string) {
  return `${quoteSheet(COST_XLSX_SHEETS.ppr)}!${ref}`;
}

function jobLine(input: CostReportXlsxInput) {
  return [input.title, input.client, input.site].filter((part) => String(part || "").trim()).join("  ·  ");
}

function statusDateOf(input: CostReportXlsxInput) {
  return input.statusDate || input.book.statusDate || "";
}

function estimateStatusOf(input: CostReportXlsxInput) {
  if (input.status == null || String(input.status).trim() === "") return "";
  return clampEstimateStatus(parseEstimateStatus(input.status), Boolean(input.regularClient));
}

function preparedByOf(input: CostReportXlsxInput) {
  return (input.preparedBy || "").replace(/\s+/g, " ").trim();
}

function headerByline(input: CostReportXlsxInput, subtitle: string) {
  const status = estimateStatusOf(input);
  const prepared = preparedByOf(input);
  return [
    subtitle,
    statusDateOf(input) ? `Status date ${statusDateOf(input)}` : "",
    status ? `${ESTIMATE_STATUS_LABEL}: ${status}` : "",
    prepared ? `${ESTIMATE_PREPARED_BY_LABEL}: ${prepared}` : "",
    COST_EXPORT_PRODUCER,
    COST_EXPORT_CONFIDENTIAL,
  ]
    .filter(Boolean)
    .join("  ·  ");
}

function headerBlock(input: CostReportXlsxInput, subtitle: string): SheetCell[] {
  return [
    { ref: "A1", type: "text", value: COST_EXPORT_BRAND },
    { ref: "A2", type: "text", value: jobLine(input) || COST_REPORT_NOUN },
    { ref: "A3", type: "text", value: headerByline(input, subtitle) },
  ];
}

function pprLayout(input: CostReportXlsxInput) {
  const costRow = 7;
  const lineCount = input.budget.lines.length;
  const hoursRow = costRow + 1 + lineCount;
  const totalRow = hoursRow + 1;
  const notesRow = totalRow + 2;
  return { costRow, hoursRow, totalRow, notesRow };
}

function buildCoverSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(input, `${COST_REPORT_NOUN}  ·  client report`);
  const { costRow, hoursRow } = pprLayout(input);
  const status = estimateStatusOf(input);
  const prepared = preparedByOf(input) || COST_EXPORT_PRODUCER;
  pushText(cells, "A6", "Field");
  pushText(cells, "B6", "Detail");
  pushText(cells, "D6", "Snapshot");
  pushText(cells, "E6", "Value");
  const fields: Array<[string, string]> = [
    ["Job", (input.title || "").trim() || COST_REPORT_NOUN],
    ["Client", (input.client || "").trim() || "—"],
    ["Site", (input.site || "").trim() || "—"],
    ["Status date", statusDateOf(input) || "—"],
    ["Estimate status", status || "—"],
    [ESTIMATE_PREPARED_BY_LABEL, prepared],
    ["Notes", input.book.notes.trim() || "—"],
  ];
  fields.forEach(([label, value], index) => {
    const row = 7 + index;
    pushText(cells, `A${row}`, label);
    pushText(cells, `B${row}`, value);
  });
  const snaps: Array<{ label: string; formula: string; fmt: string }> = [
    { label: "Budget $", formula: pprSheetRef(`B${costRow}`), fmt: moneyFmt() },
    { label: "Actual $", formula: pprSheetRef(`C${costRow}`), fmt: moneyFmt() },
    { label: "Variance", formula: "E7-E8", fmt: moneyFmt() },
    { label: "Remaining", formula: "E7-E8", fmt: moneyFmt() },
    { label: "% Spent", formula: "IF(E7=0,0,E8/E7)", fmt: pctFmt() },
    { label: "Budget hours", formula: pprSheetRef(`B${hoursRow}`), fmt: hoursFmt() },
    { label: "Actual hours", formula: pprSheetRef(`C${hoursRow}`), fmt: hoursFmt() },
    { label: "Hours % spent", formula: "IF(E12=0,0,E13/E12)", fmt: pctFmt() },
  ];
  snaps.forEach((snap, index) => {
    const row = 7 + index;
    pushText(cells, `D${row}`, snap.label);
    pushFormula(cells, `E${row}`, snap.formula, snap.fmt);
  });
  pushText(cells, "A16", "Budget from this job’s live estimate pack. Actuals from Turnip 15 / 16 through the status date.");
  return {
    name: COST_XLSX_SHEETS.cover,
    cells,
    merges: ["A1:E1", "A2:E2", "A3:E3", "A16:E16"],
    headerRows: [6],
  };
}

function buildPprSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(
    input,
    `${COST_REPORT_NOUN}  ·  Budget from live estimate pack`,
  );
  const budget = input.budget;
  const actuals = costActualsFromPastes(input.book.export15, input.book.export16, input.book.statusDate);
  const { costRow, hoursRow, totalRow, notesRow } = pprLayout(input);
  pushText(cells, "A6", "Line");
  pushText(cells, "B6", "Budget");
  pushText(cells, "C6", "Actual");
  pushText(cells, "D6", "Variance");
  pushText(cells, "E6", "Remaining");
  pushText(cells, "F6", "% Spent");

  const moneyLines = [
    { label: "Cost $", budget: budget.total, actual: actuals.dollars },
    ...budget.lines.map((line) => ({
      label: line.label,
      budget: line.amount,
      actual: 0,
    })),
  ];
  // Keep cost rollup + live pack lines. Actual dollars sit on Cost $ only
  // (Turnip 16 is a job total, not a split). Line actuals stay 0 so formulas still show.
  let row = costRow;
  for (const line of moneyLines) {
    const actual = line.label === "Cost $" ? actuals.dollars : 0;
    pushText(cells, `A${row}`, line.label);
    pushNum(cells, `B${row}`, line.budget, moneyFmt());
    pushNum(cells, `C${row}`, actual, moneyFmt());
    pushFormula(cells, `D${row}`, `B${row}-C${row}`, moneyFmt());
    pushFormula(cells, `E${row}`, `B${row}-C${row}`, moneyFmt());
    pushFormula(cells, `F${row}`, `IF(B${row}=0,0,C${row}/B${row})`, pctFmt());
    row += 1;
  }
  pushText(cells, `A${hoursRow}`, "Hours");
  pushNum(cells, `B${hoursRow}`, budget.hours, hoursFmt());
  pushNum(cells, `C${hoursRow}`, actuals.hours, hoursFmt());
  pushFormula(cells, `D${hoursRow}`, `B${hoursRow}-C${hoursRow}`, hoursFmt());
  pushFormula(cells, `E${hoursRow}`, `B${hoursRow}-C${hoursRow}`, hoursFmt());
  pushFormula(cells, `F${hoursRow}`, `IF(B${hoursRow}=0,0,C${hoursRow}/B${hoursRow})`, pctFmt());
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `B${totalRow}`, `B${costRow}`, moneyFmt());
  pushFormula(cells, `C${totalRow}`, `C${costRow}`, moneyFmt());
  pushFormula(cells, `D${totalRow}`, `B${totalRow}-C${totalRow}`, moneyFmt());
  pushFormula(cells, `E${totalRow}`, `B${totalRow}-C${totalRow}`, moneyFmt());
  pushFormula(cells, `F${totalRow}`, `IF(B${totalRow}=0,0,C${totalRow}/B${totalRow})`, pctFmt());
  pushText(cells, `A${notesRow}`, "Notes");
  pushText(cells, `B${notesRow}`, input.book.notes.trim() || "—");
  return {
    name: COST_XLSX_SHEETS.ppr,
    cells,
    merges: ["A1:F1", "A2:F2", "A3:F3", `B${notesRow}:F${notesRow}`],
    headerRows: [6, notesRow],
  };
}

function buildCurveSheet(input: CostReportXlsxInput, curve: CostCurvePoint[]): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(
    input,
    "Hours S-curve  ·  steel = live-pack estimate  ·  amber = Turnip 15 actuals",
  );
  pushText(cells, "A6", "Date");
  pushText(cells, "B6", "Est hours");
  pushText(cells, "C6", "Act hours");
  pushText(cells, "D6", "Cum est hours");
  pushText(cells, "E6", "Cum act hours");
  pushText(cells, "F6", "Est headcount");
  pushText(cells, "G6", "Act headcount");
  if (!curve.length) {
    pushText(cells, "A7", "Paste Turnip 15 or set crew dates to draw the S-curve.");
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
    "Steel = live-pack estimate  ·  Amber = Turnip 15 actuals  ·  chart-ready columns D / E",
  );
  return {
    name: COST_XLSX_SHEETS.curve,
    cells,
    merges: ["A1:G1", "A2:G2", "A3:G3", `A${captionRow}:G${captionRow}`, `A${footnoteRow}:G${footnoteRow}`],
    headerRows: [6],
  };
}

function buildTurnipSheet(name: string, subtitle: string, input: CostReportXlsxInput, paste: TurnipPaste): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(input, subtitle);
  pushText(cells, "A6", "Date");
  pushText(cells, "B6", "Craft");
  pushText(cells, "C6", "Employee");
  pushText(cells, "D6", "ST");
  pushText(cells, "E6", "OT");
  pushText(cells, "F6", "DT");
  pushText(cells, "G6", "Hours");
  pushText(cells, "H6", "Dollars");
  pushText(cells, "I6", "Headcount");
  if (!paste.rows.length) {
    pushText(cells, "A7", "No paste on this estimate yet. Upload stays on the desk — not in git.");
  }
  paste.rows.forEach((row, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, row.date);
    pushText(cells, `B${excelRow}`, row.craft);
    pushText(cells, `C${excelRow}`, row.employee);
    pushNum(cells, `D${excelRow}`, row.st, hoursFmt());
    pushNum(cells, `E${excelRow}`, row.ot, hoursFmt());
    pushNum(cells, `F${excelRow}`, row.dt, hoursFmt());
    pushNum(cells, `G${excelRow}`, row.hours, hoursFmt());
    pushNum(cells, `H${excelRow}`, row.dollars, moneyFmt());
    pushNum(cells, `I${excelRow}`, row.headcount, hoursFmt());
  });
  return {
    name,
    cells,
    merges: ["A1:I1", "A2:I2", "A3:I3"],
    headerRows: [6],
  };
}

function buildLogSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(input, "Dated daily report log");
  pushText(cells, "A6", "Status date");
  pushText(cells, "B6", "Saved");
  pushText(cells, "C6", "Budget $");
  pushText(cells, "D6", "Actual $");
  pushText(cells, "E6", "Budget hours");
  pushText(cells, "F6", "Actual hours");
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

export function buildCostReportWorkbook(input: CostReportXlsxInput): WorkbookSheet[] {
  const curve =
    input.curve ??
    buildCostCurve([], costActualsFromPastes(input.book.export15, input.book.export16, input.book.statusDate), input.book.statusDate);
  return [
    buildCoverSheet(input),
    buildPprSheet(input),
    buildCurveSheet(input, curve),
    buildLogSheet(input),
    buildTurnipSheet(
      COST_XLSX_SHEETS.export15,
      "Appendix  ·  Turnip T3 Export 15 hours  ·  internal paste",
      input,
      input.book.export15,
    ),
    buildTurnipSheet(
      COST_XLSX_SHEETS.export16,
      "Appendix  ·  Turnip T3 Export 16 dollars  ·  internal paste",
      input,
      input.book.export16,
    ),
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
  const range = curveRange(curve);
  if (!range || range.lastRow < range.firstRow + 1) return bytes;
  return embedHoursSCurveChart(bytes, {
    sheetName: COST_XLSX_SHEETS.curve,
    firstRow: range.firstRow,
    lastRow: range.lastRow,
    fromCol: 0,
    fromRow: range.fromRow,
    toCol: 7,
    toRow: range.toRow,
    title: "Hours S-curve — estimate vs actuals",
  });
}
