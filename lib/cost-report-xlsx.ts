/**
 * Client-facing Cost / Progress / Performance workbook.
 * Budget cells are values from the live desk pack. Variance / remaining / % spent
 * are Excel formulas. Look chrome is the same Hit Squad instrument path as the
 * estimate export — not Mike’s old Estimate Summary book.
 */
import { ESTIMATE_EXPORT_BRAND, ESTIMATE_EXPORT_PRODUCER } from "./estimate-xlsx.ts";
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
import { slugify } from "./estimate-pack.ts";

export const COST_XLSX_SHEETS = {
  ppr: "Cost PPR",
  curve: "Hrs S-curve",
  export15: "Turnip 15",
  export16: "Turnip 16",
  log: "Report log",
} as const;

export const COST_EXPORT_BRAND = ESTIMATE_EXPORT_BRAND;
export const COST_EXPORT_PRODUCER = ESTIMATE_EXPORT_PRODUCER;

export type CostReportXlsxInput = {
  title?: string;
  client?: string;
  site?: string;
  statusDate?: string;
  budget: CostBudget;
  book: CostReportBook;
  curve?: CostCurvePoint[];
  preparedBy?: string;
};

function pushText(cells: SheetCell[], ref: string, value: string) {
  if (value) cells.push({ ref, type: "text", value });
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

function headerBlock(input: CostReportXlsxInput, subtitle: string): SheetCell[] {
  const job = [input.title, input.client, input.site].filter((part) => String(part || "").trim()).join("  ·  ");
  const by = input.preparedBy ? `Prepared by ${input.preparedBy}` : COST_EXPORT_PRODUCER;
  return [
    { ref: "A1", type: "text", value: COST_EXPORT_BRAND },
    { ref: "A2", type: "text", value: job || COST_REPORT_NOUN },
    { ref: "A3", type: "text", value: `${subtitle}  ·  ${by}` },
  ];
}

function buildPprSheet(input: CostReportXlsxInput): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(
    input,
    `${COST_REPORT_NOUN}  ·  Status ${input.statusDate || input.book.statusDate}  ·  Budget from live estimate pack`,
  );
  const budget = input.budget;
  const actuals = costActualsFromPastes(input.book.export15, input.book.export16, input.book.statusDate);
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
      actual: line.id === "labor" ? 0 : 0,
    })),
  ];
  // Keep cost rollup + live pack lines. Actual dollars sit on Cost $ only
  // (Turnip 16 is a job total, not a split). Line actuals stay 0 so formulas still show.
  let row = 7;
  const costRow = row;
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
  const hoursRow = row;
  pushText(cells, `A${row}`, "Hours");
  pushNum(cells, `B${row}`, budget.hours, hoursFmt());
  pushNum(cells, `C${row}`, actuals.hours, hoursFmt());
  pushFormula(cells, `D${row}`, `B${row}-C${row}`, hoursFmt());
  pushFormula(cells, `E${row}`, `B${row}-C${row}`, hoursFmt());
  pushFormula(cells, `F${row}`, `IF(B${row}=0,0,C${row}/B${row})`, pctFmt());
  row += 1;
  pushText(cells, `A${row}`, "TOTAL");
  pushFormula(cells, `B${row}`, `B${costRow}`, moneyFmt());
  pushFormula(cells, `C${row}`, `C${costRow}`, moneyFmt());
  pushFormula(cells, `D${row}`, `B${row}-C${row}`, moneyFmt());
  pushFormula(cells, `E${row}`, `B${row}-C${row}`, moneyFmt());
  pushFormula(cells, `F${row}`, `IF(B${row}=0,0,C${row}/B${row})`, pctFmt());
  void hoursRow;
  return {
    name: COST_XLSX_SHEETS.ppr,
    cells,
    merges: ["A1:F1", "A2:F2", "A3:F3"],
    headerRows: [6],
  };
}

function buildCurveSheet(input: CostReportXlsxInput, curve: CostCurvePoint[]): WorkbookSheet {
  const cells: SheetCell[] = headerBlock(input, "Hours and headcount S-curve  ·  estimate vs actuals");
  pushText(cells, "A6", "Date");
  pushText(cells, "B6", "Est hours");
  pushText(cells, "C6", "Act hours");
  pushText(cells, "D6", "Cum est hours");
  pushText(cells, "E6", "Cum act hours");
  pushText(cells, "F6", "Est headcount");
  pushText(cells, "G6", "Act headcount");
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
  return {
    name: COST_XLSX_SHEETS.curve,
    cells,
    merges: ["A1:G1", "A2:G2", "A3:G3"],
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
  snapshotList(input.book).forEach((shot, index) => {
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
    buildPprSheet(input),
    buildCurveSheet(input, curve),
    buildTurnipSheet(COST_XLSX_SHEETS.export15, "Turnip T3 Export 15 hours", input, input.book.export15),
    buildTurnipSheet(COST_XLSX_SHEETS.export16, "Turnip T3 Export 16 dollars", input, input.book.export16),
    buildLogSheet(input),
  ];
}

export function costReportXlsxFilename(input: { site?: string; title?: string; statusDate?: string }) {
  const site = slugify((input.site || "").split("—")[0] || "");
  const title = slugify(input.title || "cost-ppr");
  const date = (input.statusDate || "").replace(/[^0-9-]/g, "") || "open";
  return `${[site, title, "cost-ppr", date].filter(Boolean).join("-")}.xlsx`;
}

export async function costReportToXlsx(input: CostReportXlsxInput): Promise<Uint8Array> {
  const sheets = buildCostReportWorkbook(input);
  const bytes = await buildWorkbook(sheets);
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}
