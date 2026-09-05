/**
 * ExcelJS .xlsx writer — Excel-365-safe package + Hit Squad client styling.
 * Chrome only. Does not compute estimate dollars. Money stays in
 * estimate-xlsx / estimate-desk-total / shared desk libs.
 * Standing ripple rule is RETROACTIVE (excel-ripple.ts): Look paint already
 * on this branch (TOTAL bars, Rate Tables chrome, wrap, center, hour integers,
 * phase bar) must not invent catalogs or disconnect math from those libs.
 * Phase-bar fills come from phase-schedule (desk globals), not sample dates.
 * Phase bar is a locked view of Job setup. The Job setup sheet is the edit card.
 * Unused columns past the used range are hidden. Unused rows below TOTAL
 * collapse (defaultRowHeight 0 + zeroHeight) so no white band remains.
 * Leftover white cells in the used band get Hit Squad teal, not mint/gray.
 * Craft sheets group A–J with native Excel column outline (+/−). No VBA / not xlsm.
 * Day-grid header is weekday (row 5) over day-of-month (row 6), white on teal.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { evaluateWorkbook } from "./xlsx-eval.ts";
import { isPhaseId, PHASE_TONE_BAND_INK, PHASE_TONE_FILLS } from "./phase-schedule.ts";
import { colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF102226";
const GRID = "FF8AA3A1";
const BLACK = "FF000000";
export const STEEL = "FF0F5F6D";
export const STEEL_DEEP = "FF083943";
export const AMBER_FLARE = "FFE38B2A";
/** Header / void / cage chrome — Hit Squad teal, not mint-gray plate. */
const PLATE_WASH = STEEL;
const PLATE_WASH_DEEP = STEEL_DEEP;

const FMT_CURRENCY = "$#,##0.00";
/**
 * Hour cells: Excel integer thousands. `#,##0.##` paints `1,192.` —
 * the decimal point stays when `#` has nothing to show. Never use a
 * `.` in this format. Dollars stay $#,##0.00.
 */
export const FMT_HOURS = "#,##0";
const FMT_INTEGER = "#,##0";
const FMT_PERCENT = "0.0%";
const FMT_DATE = "YYYY-MM-DD";

/** Sat/Sun day-grid fill. Robert’s CAT 2: WEEKDAY=7 or 1 → #C9C9C9. Clock math unchanged. */
export const LABOR_WEEKEND_FILL = "FFC9C9C9";
export const LABOR_SAT_HEADER = LABOR_WEEKEND_FILL;
export const LABOR_SAT_BODY = LABOR_WEEKEND_FILL;
export const LABOR_SUN_HEADER = LABOR_WEEKEND_FILL;
export const LABOR_SUN_BODY = LABOR_WEEKEND_FILL;

export const LABOR_POSITION_TITLE = STEEL;
export const LABOR_HC_HPS = "FFFFFF00";
/** Empty A–J on HC/HPS rows — teal chrome; yellow stays on the day HC/HPS cells. */
export const LABOR_HC_HPS_CLEAR = STEEL;
export const LABOR_HOURS_LABEL = STEEL;
export const LABOR_PD_LABEL = AMBER_FLARE;
export const LABOR_DAYSHIFT_BANNER = STEEL;
export const LABOR_NIGHTSHIFT_BANNER = STEEL_DEEP;
export const LABOR_SPACER = STEEL_DEEP;
export const LABOR_CAGE_WASH_A = STEEL;
export const LABOR_CAGE_WASH_B = STEEL_DEEP;
/** ST/OT/DT weekday day cells — teal, not mint. Weekend gray still wins. PD count is yellow like HC. */
export const LABOR_DAY_WASH = STEEL;
/** Leftover empty cells in the used band — teal, not mint/white. */
export const SHEET_VOID_WASH = STEEL;
/** Day-of-month in the narrow calendar col. `D-MMM` clipped at 3.2. */
export const LABOR_DATE_NUM_FMT = "d";
export const EXCEL_MAX_COL = 16384;
/** Excel last row. Unused rows below content collapse via defaultRowHeight 0 + zeroHeight. */
export const EXCEL_MAX_ROW = 1048576;
/** Explicit height for used rows so defaultRowHeight 0 does not flatten live data. */
export const USED_ROW_HEIGHT = 16;
export const SUMMARY_SECTION = STEEL;
export const SUMMARY_TOTAL = AMBER_FLARE;
export const SUMMARY_ZEBRA_A = STEEL;
export const SUMMARY_ZEBRA_B = STEEL_DEEP;

/** Compact 9pt subtitle row. Grows only when the merged A1–last header is too narrow. */
export const HEADER_META_LINE_HEIGHT = 16;
/** Two wrapped lines of Calibri 9 — keeps the header stack, no giant single-line merge. */
export const HEADER_META_WRAP_HEIGHT = 28;

export const LABOR_COL_WIDTHS: Record<string, number> = {
  // Shift next to Position — no Billable column.
  A: 11,
  B: 32,
  // `$10,343,765.44` hashes at 15. 16 is the tightest full-currency floor.
  C: 16,
  D: 12,
  // ExcelJS omits width=9 (treats it as the default and drops the col). 9.01 persists as ~9.
  E: 9.01,
  F: 10,
  G: 10,
  H: 10,
  I: 10,
  J: 16,
};
/** Explicit cell xf — column alignment alone does not center Excel number cells. */
export const LABOR_CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: false,
};
/** Same width on every day col (K through last date). 3 made `9.5` into ##; 3.2 persists. */
export const LABOR_DAY_COL_WIDTH = 3.2;
/** A–J one line + unrotated day-of-month. */
export const LABOR_HEADER_ROW_HEIGHT = 22;
/** Every craft HC/HPS/ST/OT/DT/PD/title row — no wrap-driven spikes. */
export const LABOR_DATA_ROW_HEIGHT = 16;
/** Two short Job setup phase-bar rows above the date header. */
export const LABOR_PHASE_ROW_HEIGHT = 14;
export const SUMMARY_COL_A_WIDTH = 28;
export const LABOR_DATE_FIRST_COL = 11;
/** Frozen instrument columns A–J (Shift through Labor $). */
export const LABOR_INSTRUMENT_LAST_COL = 10;
/** Native Excel column group on A–J (outline +/−). No VBA. */
export const LABOR_INSTRUMENT_OUTLINE_LEVEL = 1;

/** Empty password: Review → Unprotect Sheet with no prompt. Formula cells stay locked. */
export const SHEET_PROTECT_PASSWORD = "";
export const SHEET_PROTECT_OPTIONS: Partial<ExcelJS.WorksheetProtection> = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertColumns: false,
  insertRows: false,
  insertHyperlinks: false,
  deleteColumns: false,
  deleteRows: false,
  sort: false,
  autoFilter: false,
  pivotTables: false,
};
/** Craft sheets: Format columns must stay on so the A–J outline +/− works when protected. */
export const LABOR_SHEET_PROTECT_OPTIONS: Partial<ExcelJS.WorksheetProtection> = {
  ...SHEET_PROTECT_OPTIONS,
  formatColumns: true,
};

const FORBIDDEN_CLIENT_COPY = /field trial|forgebook|not a release/i;

function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRef(ref: string): { col: string; row: number; colNum: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return { col: "A", row: 1, colNum: 1 };
  return { col: match[1], row: Number(match[2]), colNum: colIndex(match[1]) };
}

function headerByColumn(cells: SheetCell[], row: number): Map<string, string> {
  const map = new Map<string, string>();
  for (const cell of cells) {
    const parsed = parseRef(cell.ref);
    if (parsed.row !== row || cell.type !== "text") continue;
    map.set(parsed.col, cell.value);
  }
  return map;
}

function maxHeaderCol(cells: SheetCell[], rows: number | readonly number[] = 6): string {
  const wanted = new Set(typeof rows === "number" ? [rows] : rows);
  let max = 1;
  for (const cell of cells) {
    const parsed = parseRef(cell.ref);
    if (wanted.has(parsed.row)) max = Math.max(max, parsed.colNum);
  }
  return colLetter(max);
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function edge(style: ExcelJS.BorderStyle, color = BLACK): ExcelJS.Border {
  return { style, color: { argb: color } };
}

function patchBorder(cell: ExcelJS.Cell, patch: Partial<ExcelJS.Borders>) {
  const current = (cell.border ?? {}) as ExcelJS.Borders;
  cell.border = {
    top: patch.top ?? current.top,
    bottom: patch.bottom ?? current.bottom,
    left: patch.left ?? current.left,
    right: patch.right ?? current.right,
    diagonal: current.diagonal,
  };
}

function boxRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  style: ExcelJS.BorderStyle = "medium",
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = ws.getCell(row, col);
      if (row === startRow) patchBorder(cell, { top: edge(style) });
      if (row === endRow) patchBorder(cell, { bottom: edge(style) });
      if (col === startCol) patchBorder(cell, { left: edge(style) });
      if (col === endCol) patchBorder(cell, { right: edge(style) });
    }
  }
}

function hairGrid(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      patchBorder(ws.getCell(row, col), {
        top: edge("hair", GRID),
        bottom: edge("hair", GRID),
        left: edge("hair", GRID),
        right: edge("hair", GRID),
      });
    }
  }
}

/** Map column header labels to unmistakable Excel number formats. */
export function formatForHeader(header: string): string | undefined {
  const lower = header.trim().toLowerCase();
  if (lower.includes("%") || lower === "markup %") return FMT_PERCENT;
  if (/man-hours|\bmh\b|total billable|^billable$/.test(lower)) return FMT_HOURS;
  if (/^(pd|pd #|pd count)$|pd days/.test(lower) && !/\$/.test(lower)) return FMT_HOURS;
  if (/hrs|hours/.test(lower) && !/\$/.test(lower)) return FMT_HOURS;
  if (/headcount|qty|periods|travelers|\bcount\b/.test(lower)) return FMT_INTEGER;
  if (lower === "miles") return FMT_INTEGER;
  if (
    /\$|amount|cost|freight|each|markup|bill|bw|\/ mile|rate|total|pd \$|st \$|ot \$|dt \$/.test(lower) &&
    !/hrs|hours|man-hours|\bmh\b/.test(lower)
  ) {
    return FMT_CURRENCY;
  }
  return undefined;
}

/** Summary rollup column B uses the line label in column A, not the sheet header. */
export function summaryLineFormat(lineLabel: string): string {
  const lower = lineLabel.trim().toLowerCase();
  if (/hours|man-hours|\bmh\b/.test(lower) && !/\$/.test(lower)) return FMT_HOURS;
  return FMT_CURRENCY;
}

export { EXCEL_JOB_SETUP_IMPORT_PARKED, EXCEL_RIPPLE_RULE } from "./excel-ripple.ts";
export const EXCEL_UNIT_FORMATS = {
  currency: FMT_CURRENCY,
  hours: FMT_HOURS,
  integer: FMT_INTEGER,
  percent: FMT_PERCENT,
  date: FMT_DATE,
} as const;

function tabColorArgb(name: string): string {
  if (name === "Summary Page") return STEEL_DEEP;
  if (name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support" || name === "Laydown") {
    return STEEL;
  }
  if (name.includes("Rental") || name === "COE" || name === "Tensioning Torquing equipment") return AMBER_FLARE;
  if (name === "Rate Tables") return STEEL_DEEP;
  if (name.includes("Subcontractor") || name === "Staff Travel Cost" || name === "Misc Costs") return "FF1A7A88";
  return STEEL;
}

function labelByRow(cells: SheetCell[], row: number): string | undefined {
  const cell = cells.find((item) => item.ref === `A${row}`);
  return cell?.type === "text" ? cell.value : undefined;
}

function cellFormat(
  sheet: WorkbookSheet,
  headers: Map<string, string>,
  col: string,
  row: number,
  isSummary: boolean,
): string | undefined {
  if (isSummary && col === "C" && row >= 7) return FMT_HOURS;
  if (isSummary && col === "B" && row >= 7) {
    return summaryLineFormat(labelByRow(sheet.cells, row) ?? "Amount $");
  }
  const headerRow = sheet.headerRows?.length ? nearestHeaderRow(sheet.cells, row, sheet.headerRows) : 6;
  const local = headerRow === 6 ? headers : headerByColumn(sheet.cells, headerRow);
  const header = local.get(col) ?? (isSummary && col === "B" ? "Amount $" : "");
  return formatForHeader(header);
}

function isTotalRow(cells: SheetCell[], row: number): boolean {
  const label = cells.find((cell) => cell.ref === `A${row}`);
  return label?.type === "text" && /^(TOTAL|ESTIMATE TOTAL|MAN-HOURS)/i.test(label.value);
}

function isSectionRow(cells: SheetCell[], row: number): boolean {
  const label = cells.find((cell) => cell.ref === `A${row}`);
  return (
    label?.type === "text" && /^(Labor \$|Large tools|Third-party rental)/i.test(label.value)
  );
}

function nearestHeaderRow(cells: SheetCell[], row: number, extra: number[] = []): number {
  const headers = new Set<number>([6, ...extra]);
  for (const cell of cells) {
    if (cell.type !== "text") continue;
    if (!/COMP BW \$|ST Bill \$|Daily \$/.test(cell.value)) continue;
    headers.add(parseRef(cell.ref).row);
  }
  let best = 6;
  for (const header of headers) {
    if (header < row && header >= best) best = header;
  }
  return best;
}

function laborRowKind(cells: SheetCell[], row: number): "title" | "hc" | "hps" | "pd" | "hours" | "" {
  const shift = cells.find((cell) => cell.ref === `A${row}`);
  const type = cells.find((cell) => cell.ref === `E${row}`);
  if (shift?.type === "text" && /DAYSHIFT|NIGHTSHIFT/i.test(shift.value)) return "title";
  if (type?.type === "text" && type.value === "TITLE") return "title";
  if (type?.type === "text" && type.value === "HC") return "hc";
  if (type?.type === "text" && type.value === "HPS") return "hps";
  if (type?.type === "text" && type.value === "PD") return "pd";
  if (type?.type === "text" && /^(ST|OT|DT)$/.test(type.value)) return "hours";
  return "";
}

function isAdderRow(cells: SheetCell[], row: number): boolean {
  const label = cells.find((cell) => cell.ref === `A${row}`);
  return (
    label?.type === "text" &&
    /contingency|cba increase|m\.o\.r\.e|6\.5% markup|6% /i.test(label.value)
  );
}

function defaultMerges(cells: SheetCell[]): string[] {
  const lastCol = maxHeaderCol(cells);
  return [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`];
}

function headerBandWidth(ws: ExcelJS.Worksheet, lastCol: number): number {
  let width = 0;
  for (let col = 1; col <= lastCol; col += 1) {
    width += Number(ws.getColumn(col).width) || 11;
  }
  return width;
}

/** One Excel width unit ≈ one Calibri 11 character. Size 9 is close enough to wrap before clip. */
export function headerMetaHeight(text: string, colWidth: number): number {
  const fit = Math.max(8, colWidth);
  if (!text || text.length <= fit) return HEADER_META_LINE_HEIGHT;
  const lines = Math.min(3, Math.ceil(text.length / fit));
  return HEADER_META_LINE_HEIGHT + (lines - 1) * 12;
}

function applyHeaderMetaLayout(ws: ExcelJS.Worksheet, bandLastCol: number, wrap = true) {
  for (const row of [2, 3] as const) {
    const cell = ws.getCell(row, 1);
    cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: wrap };
    ws.getRow(row).height = wrap
      ? headerMetaHeight(String(cell.value ?? ""), headerBandWidth(ws, bandLastCol))
      : HEADER_META_LINE_HEIGHT;
  }
}

function isLaborSheet(name: string) {
  return name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support";
}

/** Yellow HC / HPS / PD count day-grid — same unlocked edit surface as HC. */
export function isLaborDayInput(sheet: WorkbookSheet, row: number, colNum: number): boolean {
  if (!isLaborSheet(sheet.name) || colNum < LABOR_DATE_FIRST_COL) return false;
  const kind = laborRowKind(sheet.cells, row);
  return kind === "hc" || kind === "hps" || kind === "pd" || kind === "hours";
}

/** Hard count/HPS plugs only — empty unused day cells stay teal, not yellow. */
function isLaborCountInputCell(cell: ExcelJS.Cell): boolean {
  return typeof cell.value === "number";
}

/** Support Bill as value in column B — unlocked so an estimator can set it offline. */
export function isLaborBillAsInput(sheet: WorkbookSheet, row: number, colNum: number): boolean {
  return colNum === 2 && (sheet.billAs?.some((slot) => slot.valueRow === row) ?? false);
}

/** Position title cell — unlocked for the Shahan list dropdown. */
export function isLaborPositionInput(sheet: WorkbookSheet, row: number, colNum: number): boolean {
  return colNum === 2 && (sheet.laborBlocks?.some((block) => block.start === row) ?? false);
}

function columnWidth(col: string, header: string | undefined, sheetName: string): number {
  const lower = (header ?? "").toLowerCase();
  const colNum = colIndex(col);
  if (isLaborSheet(sheetName) && colNum >= LABOR_DATE_FIRST_COL) return LABOR_DAY_COL_WIDTH;
  if (isLaborSheet(sheetName) && LABOR_COL_WIDTHS[col] != null) return LABOR_COL_WIDTHS[col];
  if (col === "A") {
    if (sheetName === "Summary Page") return SUMMARY_COL_A_WIDTH;
    if (/position|craft|item|vendor|phase|kind/.test(lower) || !header) return 28;
    return 22;
  }
  if (/description|scope/.test(lower)) return 28;
  if (/position|vendor|phase|item/.test(lower)) return 24;
  if (/man-hours|\bmh\b/.test(lower)) return 12;
  if (/headcount|qty|periods|travelers|miles|count|lane|shift/.test(lower)) return 10;
  if (/hrs|hours|days/.test(lower)) return 10;
  if (/\$|amount|total|cost|rate|freight|markup|each|bill|bw|pd/.test(lower)) return 18;
  return 11;
}

function applyRowStyle(
  exCell: ExcelJS.Cell,
  row: number,
  _maxRow: number,
  isSummary: boolean,
  colNum: number,
) {
  if (row === 1) {
    exCell.font = { bold: true, size: 14, color: { argb: WHITE }, name: "Calibri" };
    exCell.fill = solid(STEEL);
    exCell.alignment = { vertical: "middle" };
    exCell.border = { bottom: edge("medium", AMBER_FLARE) };
    return;
  }
  if (row === 2) {
    exCell.font = { size: 9, color: { argb: WHITE }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH);
    exCell.alignment = { vertical: "middle", wrapText: true };
    return;
  }
  if (row === 3) {
    exCell.font = { size: 9, italic: true, color: { argb: WHITE }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH_DEEP);
    exCell.alignment = { vertical: "middle", wrapText: true };
    return;
  }
  if (row === 4 || row === 5) {
    exCell.font = { size: 9, color: { argb: WHITE }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH);
    exCell.alignment = { wrapText: false };
    return;
  }
  if (row === 6) {
    exCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 9 };
    exCell.fill = solid(STEEL_DEEP);
    exCell.alignment = { ...LABOR_CENTER };
    exCell.border = {
      bottom: { style: "medium", color: { argb: AMBER_FLARE } },
    };
    return;
  }
  exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  if (isSummary && row >= 7 && colNum === 2) {
    exCell.alignment = { horizontal: "right" };
  }
  if (isSummary && row >= 7 && colNum === 3) {
    exCell.alignment = { ...LABOR_CENTER };
  }
}

function applyTotalStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 11 };
  exCell.fill = solid(SUMMARY_TOTAL);
  exCell.alignment = { ...LABOR_CENTER };
  exCell.border = {
    top: edge("medium"),
    bottom: edge("medium"),
    left: edge("hair", GRID),
    right: edge("hair", GRID),
  };
}

function applySectionStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
  exCell.fill = solid(SUMMARY_SECTION);
}

function applyTotalBar(ws: ExcelJS.Worksheet, row: number, lastColNum: number) {
  for (let col = 1; col <= lastColNum; col += 1) {
    applyTotalStyle(ws.getCell(row, col));
  }
}

/** Rate Tables / cost tabs: steel header stack + zebra, no plain white grid. */
function applyInstrumentChrome(
  ws: ExcelJS.Worksheet,
  maxRow: number,
  lastColNum: number,
  totalRows: Set<number>,
  sectionRows: Set<number> = new Set(),
  headerRows: Set<number> = new Set([6]),
) {
  for (let row = 1; row <= 5; row += 1) {
    for (let col = 1; col <= lastColNum; col += 1) {
      applyRowStyle(ws.getCell(row, col), row, maxRow, false, col);
    }
  }
  hairGrid(ws, 6, maxRow, 1, lastColNum);
  for (const headerRow of headerRows) {
    for (let col = 1; col <= lastColNum; col += 1) {
      applyRowStyle(ws.getCell(headerRow, col), 6, maxRow, false, col);
      patchBorder(ws.getCell(headerRow, col), { bottom: edge("medium", AMBER_FLARE) });
    }
  }
  for (let row = 7; row <= maxRow; row += 1) {
    if (totalRows.has(row) || sectionRows.has(row) || headerRows.has(row)) continue;
    const wash = row % 2 === 0 ? LABOR_CAGE_WASH_B : LABOR_CAGE_WASH_A;
    for (let col = 1; col <= lastColNum; col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(wash);
      cell.font = {
        bold: col === 1,
        color: { argb: WHITE },
        name: "Calibri",
        size: 10,
      };
    }
  }
  for (const row of sectionRows) {
    for (let col = 1; col <= lastColNum; col += 1) applySectionStyle(ws.getCell(row, col));
  }
}

function applyAdderStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
}

function printHeader(sheetName: string): string {
  const safe = sheetName.replace(/&/g, "and").slice(0, 24);
  return `&L&B HIT SQUAD / PROJECT CONTROLS &C ${safe} &R Confidential`;
}

const PRINT_FOOTER = "&L Produced by Hit Squad Project Controls &C &D &R Page &P of &N";

export function clientCopyIsClean(value: string): boolean {
  return !FORBIDDEN_CLIENT_COPY.test(value);
}

function inferLaborBlocks(cells: SheetCell[], maxRow: number): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  for (let row = 7; row <= maxRow; row += 1) {
    if (laborRowKind(cells, row) !== "title") continue;
    blocks.push({ start: row, end: row + 6 });
  }
  return blocks;
}

function centerLaborCell(cell: ExcelJS.Cell, extra: Partial<ExcelJS.Alignment> = {}) {
  cell.alignment = {
    ...LABOR_CENTER,
    ...extra,
    horizontal: extra.horizontal ?? "center",
    vertical: extra.vertical ?? "middle",
    wrapText: extra.wrapText ?? false,
  };
}

function cellLooksNumeric(cell: ExcelJS.Cell): boolean {
  const value = cell.value as { formula?: string; result?: unknown; sharedFormula?: string } | number | string | null;
  if (typeof value === "number") return true;
  if (value && typeof value === "object" && (value.formula != null || value.sharedFormula != null || value.result != null)) {
    return true;
  }
  return false;
}

/** Last write: numFmt then center, so Excel does not keep a dangling `.` or right-align. */
function pinHoursAndMoney(
  ws: ExcelJS.Worksheet,
  sheet: WorkbookSheet,
  lastCol: number,
  maxRow: number,
  labor: boolean,
  isSummary: boolean,
) {
  const headers = headerByColumn(sheet.cells, 6);
  for (let row = 7; row <= maxRow; row += 1) {
    const kind = labor ? laborRowKind(sheet.cells, row) : "";
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = ws.getCell(row, col);
      let fmt = cellFormat(sheet, headers, colLetter(col), row, isSummary);
      if (labor && col >= LABOR_DATE_FIRST_COL && (kind === "hc" || kind === "hps" || kind === "pd" || kind === "hours")) {
        fmt = FMT_HOURS;
      }
      if (fmt === FMT_HOURS || fmt === FMT_INTEGER) {
        if (cellLooksNumeric(cell)) cell.numFmt = FMT_HOURS;
        centerLaborCell(cell);
      } else if (fmt === FMT_CURRENCY) {
        if (cellLooksNumeric(cell)) cell.numFmt = FMT_CURRENCY;
        if (isSummary && col === 2) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          centerLaborCell(cell);
        }
      }
    }
  }
  if (labor) {
    for (const [col, width] of Object.entries(LABOR_COL_WIDTHS)) {
      ws.getColumn(colIndex(col)).width = width;
    }
  }
  fitCurrencyColumns(ws, lastCol, maxRow);
}

function numericResult(cell: ExcelJS.Cell): number | undefined {
  const value = cell.value as { result?: unknown } | number | null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof value.result === "number" && Number.isFinite(value.result)) {
    return value.result;
  }
  return undefined;
}

/** Excel hashes (`##########`) when the formatted $ string is wider than the column. */
function fitCurrencyColumns(ws: ExcelJS.Worksheet, lastCol: number, maxRow: number) {
  const needed = new Map<number, number>();
  for (let row = 7; row <= maxRow; row += 1) {
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = ws.getCell(row, col);
      if (cell.numFmt !== FMT_CURRENCY) continue;
      const amount = numericResult(cell);
      if (amount == null) continue;
      const shown = `$${Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      needed.set(col, Math.max(needed.get(col) ?? 14, shown.length + 2));
    }
  }
  for (const [col, width] of needed) {
    const current = Number(ws.getColumn(col).width) || 11;
    if (width > current) ws.getColumn(col).width = width;
  }
}

function pinLaborEvenRows(ws: ExcelJS.Worksheet, sheet: WorkbookSheet, lastDateCol: number, maxRow: number) {
  ws.getRow(4).height = LABOR_PHASE_ROW_HEIGHT;
  ws.getRow(5).height = LABOR_PHASE_ROW_HEIGHT;
  ws.getRow(6).height = LABOR_HEADER_ROW_HEIGHT;
  const spacers = new Set(sheet.spacerRows ?? []);
  for (let row = 4; row <= maxRow; row += 1) {
    for (let col = 1; col <= Math.max(LABOR_INSTRUMENT_LAST_COL, lastDateCol); col += 1) {
      const cell = ws.getCell(row, col);
      const rotation = cell.alignment?.textRotation;
      centerLaborCell(cell, {
        ...(rotation ? { textRotation: rotation } : {}),
        ...(isLaborBillAsInput(sheet, row, col) ? { wrapText: true } : {}),
      });
    }
  }
  for (let row = 7; row <= maxRow; row += 1) {
    ws.getRow(row).height = spacers.has(row) ? 8 : LABOR_DATA_ROW_HEIGHT;
  }
}

/** Last style write — Excel number xfs drop column-only center. */
function pinLaborCraftAlignment(ws: ExcelJS.Worksheet, lastDateCol: number, maxRow: number) {
  const colAlign = { horizontal: "center" as const, vertical: "middle" as const };
  for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
    centerLaborCell(ws.getCell(6, col));
    ws.getColumn(col).alignment = colAlign;
  }
  if (lastDateCol >= LABOR_DATE_FIRST_COL) {
    for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
      centerLaborCell(ws.getCell(5, col));
      centerLaborCell(ws.getCell(6, col));
      ws.getColumn(col).alignment = colAlign;
    }
  }
  for (let row = 7; row <= maxRow; row += 1) {
    for (let col = 1; col <= Math.max(LABOR_INSTRUMENT_LAST_COL, lastDateCol); col += 1) {
      centerLaborCell(ws.getCell(row, col));
    }
  }
}

/** A Shift + B Position + F–J hour/money totals — merged title→PD. Skip per-row fills. */
const LABOR_BLOCK_VOID_COL_NUMS = new Set([1, 2, 6, 7, 8, 9, 10]);
/** C Subtotal $ + D Rate — merged title through HPS. */
const LABOR_TITLE_BAND_COL_NUMS = new Set([3, 4]);

function applyLaborBlockChrome(
  ws: ExcelJS.Worksheet,
  sheet: WorkbookSheet,
  block: { start: number; end: number },
  lastDateCol: number,
) {
  const shift = sheet.cells.find((cell) => cell.ref === `A${block.start}`);
  const night = shift?.type === "text" && /NIGHTSHIFT/i.test(shift.value);

  for (let row = block.start; row <= block.end; row += 1) {
    const kind = laborRowKind(sheet.cells, row);
    for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
      if (LABOR_BLOCK_VOID_COL_NUMS.has(col)) continue;
      if (LABOR_TITLE_BAND_COL_NUMS.has(col) && row <= block.start + 2) continue;
      const cell = ws.getCell(row, col);
      if (kind === "title") {
        if (col === 1) {
          cell.fill = solid(night ? LABOR_NIGHTSHIFT_BANNER : LABOR_DAYSHIFT_BANNER);
          cell.font = {
            bold: true,
            color: { argb: WHITE },
            name: "Calibri",
            size: 9,
          };
          centerLaborCell(cell);
        } else {
          cell.fill = solid(LABOR_POSITION_TITLE);
          cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
          centerLaborCell(cell);
        }
      } else if (kind === "hc" || kind === "hps") {
        cell.fill = solid(LABOR_HC_HPS_CLEAR);
        cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 9 };
        centerLaborCell(cell);
      } else if (kind === "pd") {
        if (col === 5) {
          cell.fill = solid(LABOR_PD_LABEL);
          cell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 9 };
          centerLaborCell(cell);
        } else if (col === 3 || col === 4) {
          const wash = (row - block.start) % 2 === 0 ? LABOR_CAGE_WASH_A : LABOR_CAGE_WASH_B;
          cell.fill = solid(wash);
          cell.font = { color: { argb: WHITE }, name: "Calibri", size: 10 };
          centerLaborCell(cell);
        } else {
          cell.fill = solid(LABOR_HC_HPS_CLEAR);
          cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 9 };
          centerLaborCell(cell);
        }
      } else if (kind === "hours") {
        if (col === 5) {
          cell.fill = solid(LABOR_HOURS_LABEL);
          cell.font = {
            bold: true,
            color: { argb: WHITE },
            name: "Calibri",
            size: 9,
          };
          centerLaborCell(cell);
        } else {
          const wash = (row - block.start) % 2 === 0 ? LABOR_CAGE_WASH_A : LABOR_CAGE_WASH_B;
          cell.fill = solid(wash);
          cell.font = { color: { argb: WHITE }, name: "Calibri", size: 10 };
          centerLaborCell(cell);
        }
      }
    }
    if (kind === "hc" || kind === "hps" || kind === "pd") {
      for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
        const day = ws.getCell(row, col);
        if (isLaborCountInputCell(day)) day.fill = solid(LABOR_HC_HPS);
        centerLaborCell(day);
      }
    } else {
      for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
        const day = ws.getCell(row, col);
        day.fill = solid(LABOR_DAY_WASH);
        centerLaborCell(day);
      }
    }
  }

  for (const col of LABOR_BLOCK_VOID_COL_NUMS) {
    if (col === 1) continue;
    const cell = ws.getCell(block.start, col);
    cell.fill = solid(LABOR_POSITION_TITLE);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    centerLaborCell(cell);
  }
  const shiftCell = ws.getCell(block.start, 1);
  shiftCell.fill = solid(night ? LABOR_NIGHTSHIFT_BANNER : LABOR_DAYSHIFT_BANNER);
  shiftCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 9 };
  centerLaborCell(shiftCell);
  for (const col of LABOR_TITLE_BAND_COL_NUMS) {
    const cell = ws.getCell(block.start, col);
    cell.fill = solid(LABOR_POSITION_TITLE);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    centerLaborCell(cell);
  }
  const billAs = sheet.billAs?.find((slot) => slot.labelRow >= block.start && slot.valueRow <= block.end);
  if (billAs) {
    const label = ws.getCell(billAs.labelRow, 2);
    label.fill = solid(STEEL_DEEP);
    label.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 8 };
    centerLaborCell(label);
    const value = ws.getCell(billAs.valueRow, 2);
    value.fill = solid(STEEL);
    value.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    centerLaborCell(value, { wrapText: true });
  }

  hairGrid(ws, block.start, block.end, 1, LABOR_INSTRUMENT_LAST_COL);
  boxRange(ws, block.start, block.end, 1, LABOR_INSTRUMENT_LAST_COL, "medium");

  if (lastDateCol >= LABOR_DATE_FIRST_COL) {
    hairGrid(ws, block.start, block.end, LABOR_DATE_FIRST_COL, lastDateCol);
    for (let row = block.start + 3; row <= block.start + 5; row += 1) {
      for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
        patchBorder(ws.getCell(row, col), {
          top: edge("hair", GRID),
          bottom: edge("hair", GRID),
        });
        if (col > LABOR_DATE_FIRST_COL) patchBorder(ws.getCell(row, col), { left: edge("thin", GRID) });
      }
    }
    boxRange(ws, block.start, block.end, LABOR_DATE_FIRST_COL, lastDateCol, "medium");
  }
}

/** Last fill write on the date grid — yellow entry, weekend gray, mint everywhere else. */
function paintLaborDayCalendar(
  ws: ExcelJS.Worksheet,
  sheet: WorkbookSheet,
  lastDateCol: number,
  maxRow: number,
  totalRows: Set<number>,
) {
  if (lastDateCol < LABOR_DATE_FIRST_COL) return;
  const weekend = new Set((sheet.weekendCols ?? []).map((item) => item.col));
  const spacers = new Set(sheet.spacerRows ?? []);
  for (let row = 7; row <= maxRow; row += 1) {
    const kind = laborRowKind(sheet.cells, row);
    for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
      const cell = ws.getCell(row, col);
      if (spacers.has(row) || totalRows.has(row)) {
        cell.fill = solid(spacers.has(row) ? LABOR_SPACER : SHEET_VOID_WASH);
        continue;
      }
      if (weekend.has(col)) {
        cell.fill = solid(LABOR_WEEKEND_FILL);
        cell.font = { ...(cell.font ?? {}), color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
        continue;
      }
      if ((kind === "hc" || kind === "hps" || kind === "pd") && isLaborCountInputCell(cell)) {
        cell.fill = solid(LABOR_HC_HPS);
        cell.font = { ...(cell.font ?? {}), color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
      } else {
        cell.fill = solid(LABOR_DAY_WASH);
        cell.font = { ...(cell.font ?? {}), color: { argb: WHITE }, name: "Calibri", size: 10 };
      }
    }
  }
}

function applyLaborPhaseBar(ws: ExcelJS.Worksheet, sheet: WorkbookSheet, lastDateCol: number) {
  const bandInk = { argb: PHASE_TONE_BAND_INK };
  for (const row of [4, 5] as const) {
    ws.getRow(row).height = LABOR_PHASE_ROW_HEIGHT;
    for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(PLATE_WASH);
      cell.font = { bold: true, name: "Calibri", size: 9, color: { argb: WHITE } };
      centerLaborCell(cell);
    }
    for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(PLATE_WASH);
      cell.font = { bold: true, name: "Calibri", size: 7, color: { argb: WHITE } };
      centerLaborCell(cell);
    }
  }
  for (const run of sheet.phaseBar ?? []) {
    if (!isPhaseId(run.phaseId)) continue;
    const fillArgb = PHASE_TONE_FILLS[run.phaseId];
    for (let col = run.startCol; col <= run.endCol; col += 1) {
      const cell = ws.getCell(4, col);
      cell.fill = solid(fillArgb);
      cell.font = { bold: true, name: "Calibri", size: 8, color: bandInk };
      centerLaborCell(cell);
    }
  }
}

function applyLaborInstrumentOutline(ws: ExcelJS.Worksheet): void {
  const props = ws.properties as ExcelJS.WorksheetProperties;
  // ExcelJS Column.collapsed is `outlineLevel >= outlineLevelCol`. Keep the
  // sheet threshold above the group so A–J start expanded (no collapsed="1").
  props.outlineLevelCol = LABOR_INSTRUMENT_OUTLINE_LEVEL + 1;
  props.outlineProperties = { summaryBelow: true, summaryRight: true };
  for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
    ws.getColumn(col).outlineLevel = LABOR_INSTRUMENT_OUTLINE_LEVEL;
  }
}

function applyLaborChrome(
  ws: ExcelJS.Worksheet,
  sheet: WorkbookSheet,
  maxRow: number,
  lastDateCol: number,
  totalRows: Set<number>,
) {
  for (const [col, width] of Object.entries(LABOR_COL_WIDTHS)) {
    ws.getColumn(colIndex(col)).width = width;
  }
  applyLaborInstrumentOutline(ws);
  if (lastDateCol >= LABOR_DATE_FIRST_COL) {
    for (let i = LABOR_DATE_FIRST_COL; i <= lastDateCol; i += 1) {
      ws.getColumn(i).width = LABOR_DAY_COL_WIDTH;
      ws.getColumn(i).alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  // Brand + subtitle bands span the day grid so K2:last / K3:last are not a white void.
  for (let row = 1; row <= 3; row += 1) {
    for (let col = 1; col <= Math.max(LABOR_INSTRUMENT_LAST_COL, lastDateCol); col += 1) {
      applyRowStyle(ws.getCell(row, col), row, maxRow, false, col);
    }
  }
  for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
    ws.getColumn(col).alignment = { horizontal: "center", vertical: "middle" };
  }

  const blocks = sheet.laborBlocks?.length ? sheet.laborBlocks : inferLaborBlocks(sheet.cells, maxRow);
  for (const block of blocks) applyLaborBlockChrome(ws, sheet, block, lastDateCol);

  for (const row of sheet.spacerRows ?? []) {
    for (let col = 1; col <= Math.max(LABOR_INSTRUMENT_LAST_COL, lastDateCol); col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(LABOR_SPACER);
      cell.border = {
        top: edge("medium"),
        bottom: edge("medium"),
      };
    }
    ws.getRow(row).height = 8;
  }

  for (const weekend of sheet.weekendCols ?? []) {
    for (let row = 6; row <= maxRow; row += 1) {
      if (totalRows.has(row)) continue;
      if (sheet.spacerRows?.includes(row)) continue;
      const exCell = ws.getCell(row, weekend.col);
      exCell.fill = solid(LABOR_WEEKEND_FILL);
      if (row === 6) {
        exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 7 };
      }
    }
  }

  if (lastDateCol >= LABOR_DATE_FIRST_COL) {
    const first = colLetter(LABOR_DATE_FIRST_COL);
    const last = colLetter(lastDateCol);
    const weekendRule = {
      type: "expression" as const,
      priority: 1,
      formulae: [`OR(WEEKDAY(${first}$6,1)=7,WEEKDAY(${first}$6,1)=1)`],
      style: {
        fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: LABOR_WEEKEND_FILL } },
      },
    };
    ws.addConditionalFormatting({ ref: `${first}6:${last}6`, rules: [weekendRule] });
    for (const block of blocks) {
      ws.addConditionalFormatting({
        ref: `${first}${block.start}:${last}${block.end}`,
        rules: [weekendRule],
      });
    }
  }

  paintLaborDayCalendar(ws, sheet, lastDateCol, maxRow, totalRows);
  const weekendCols = new Set((sheet.weekendCols ?? []).map((item) => item.col));
  for (let col = LABOR_DATE_FIRST_COL; col <= lastDateCol; col += 1) {
    const weekday = ws.getCell(5, col);
    centerLaborCell(weekday);
    weekday.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 7 };
    weekday.fill = solid(STEEL);
    const header = ws.getCell(6, col);
    centerLaborCell(header);
    header.numFmt = LABOR_DATE_NUM_FMT;
    const weekend = weekendCols.has(col);
    header.font = {
      bold: true,
      color: { argb: weekend ? DARK_TEXT : WHITE },
      name: "Calibri",
      size: 9,
    };
    if (!weekend) header.fill = solid(STEEL_DEEP);
  }
  for (let col = 1; col <= LABOR_INSTRUMENT_LAST_COL; col += 1) {
    centerLaborCell(ws.getCell(6, col));
  }
  ws.getRow(6).height = LABOR_HEADER_ROW_HEIGHT;
  applyLaborPhaseBar(ws, sheet, lastDateCol);
}

function applySummaryChrome(
  ws: ExcelJS.Worksheet,
  maxRow: number,
  totalRows: Set<number>,
  sectionRows: Set<number>,
) {
  ws.getColumn(1).width = SUMMARY_COL_A_WIDTH;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 12;
  hairGrid(ws, 6, maxRow, 1, 3);
  for (let col = 1; col <= 3; col += 1) {
    patchBorder(ws.getCell(6, col), { bottom: edge("medium", AMBER_FLARE) });
  }
  for (let row = 7; row <= maxRow; row += 1) {
    if (totalRows.has(row) || sectionRows.has(row)) continue;
    const wash = row % 2 === 0 ? SUMMARY_ZEBRA_B : SUMMARY_ZEBRA_A;
    for (let col = 1; col <= 3; col += 1) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(wash);
      cell.font = { ...(cell.font ?? {}), color: { argb: WHITE }, name: "Calibri", size: 10 };
      if (col === 3) cell.alignment = { ...LABOR_CENTER };
    }
  }
}

function lastVisibleContentCol(sheet: WorkbookSheet, headerLast: number): number {
  const hidden = new Set(sheet.hiddenCols ?? []);
  let last = hidden.has(headerLast) ? 1 : headerLast;
  for (const cell of sheet.cells) {
    const col = parseRef(cell.ref).colNum;
    if (!hidden.has(col)) last = Math.max(last, col);
  }
  return Math.max(1, last);
}

function cellFillArgb(cell: ExcelJS.Cell): string {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  return String(fill?.fgColor?.argb ?? "").replace(/^FF/i, "").toUpperCase();
}

function isBareWhiteCell(cell: ExcelJS.Cell): boolean {
  const argb = cellFillArgb(cell);
  const none = (cell.fill as ExcelJS.FillPattern | undefined)?.pattern === "none";
  return !argb || argb === "FFFFFF" || (argb === "000000" && none);
}

function applySoftUsedBand(ws: ExcelJS.Worksheet, lastCol: number, maxRow: number) {
  for (let row = 1; row <= maxRow; row += 1) {
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = ws.getCell(row, col);
      if (!isBareWhiteCell(cell)) continue;
      cell.fill = solid(row <= 5 ? PLATE_WASH : SHEET_VOID_WASH);
    }
  }
}

function hideUnusedGrid(ws: ExcelJS.Worksheet, _lastVisibleCol: number, lastVisibleRow: number) {
  ws.properties.defaultRowHeight = 0;
  for (let row = 1; row <= lastVisibleRow; row += 1) {
    const excelRow = ws.getRow(row);
    if (!Number(excelRow.height)) excelRow.height = USED_ROW_HEIGHT;
  }
}

function stampSheetCols(xml: string): string {
  const block = xml.match(/<cols>[\s\S]*?<\/cols>/);
  if (!block) return xml;
  type ColInfo = { width: string; hidden: boolean; outlineLevel?: string };
  const byCol = new Map<number, ColInfo>();
  for (const tag of block[0].matchAll(/<col ([^/]+)\/>/g)) {
    const attrs = tag[1];
    const min = Number(/min="(\d+)"/.exec(attrs)?.[1] ?? 0);
    const max = Number(/max="(\d+)"/.exec(attrs)?.[1] ?? 0);
    const width = /width="([^"]+)"/.exec(attrs)?.[1] ?? "9";
    const hidden = /\bhidden="1"/.test(attrs);
    const outlineLevel = /outlineLevel="(\d+)"/.exec(attrs)?.[1];
    for (let col = min; col <= max; col += 1) {
      byCol.set(col, { width, hidden, ...(outlineLevel ? { outlineLevel } : {}) });
    }
  }
  let lastVisible = 1;
  for (const [col, info] of byCol) {
    if (!info.hidden) lastVisible = Math.max(lastVisible, col);
  }
  const firstDay = byCol.get(LABOR_DATE_FIRST_COL);
  const dayGrid =
    lastVisible >= LABOR_DATE_FIRST_COL &&
    !firstDay?.hidden &&
    Math.abs(Number(firstDay?.width) - LABOR_DAY_COL_WIDTH) < 0.05;
  const tags: string[] = [];
  const push = (min: number, max: number, width: string, hidden = false, outlineLevel?: string) => {
    const outline = outlineLevel ? ` outlineLevel="${outlineLevel}"` : "";
    tags.push(
      `<col min="${min}" max="${max}" width="${width}"${hidden ? ' hidden="1"' : ""} customWidth="1"${outline}/>`,
    );
  };
  if (dayGrid) {
    for (let col = 1; col < LABOR_DATE_FIRST_COL; col += 1) {
      const info = byCol.get(col);
      if (!info || info.hidden) continue;
      push(col, col, info.width, false, info.outlineLevel);
    }
    for (let col = LABOR_DATE_FIRST_COL; col <= lastVisible; col += 1) {
      if (byCol.get(col)?.hidden) continue;
      push(col, col, String(LABOR_DAY_COL_WIDTH));
    }
  } else {
    let runStart = 0;
    let runWidth = "";
    const flush = (end: number) => {
      if (runStart) push(runStart, end, runWidth);
      runStart = 0;
    };
    for (let col = 1; col <= lastVisible; col += 1) {
      const info = byCol.get(col);
      if (!info || info.hidden) {
        flush(col - 1);
        continue;
      }
      if (!runStart) {
        runStart = col;
        runWidth = info.width;
      } else if (info.width !== runWidth) {
        flush(col - 1);
        runStart = col;
        runWidth = info.width;
      }
    }
    flush(lastVisible);
  }
  if (lastVisible < EXCEL_MAX_COL) push(lastVisible + 1, EXCEL_MAX_COL, "9", true);
  return xml.replace(/<cols>[\s\S]*?<\/cols>/, `<cols>${tags.join("")}</cols>`);
}

/** Excel still paints a white band under TOTAL unless unused rows are hidden by default. */
async function stampUnusedRowsHidden(buffer: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async("string");
    xml = stampSheetCols(xml);
    const hasInstrumentOutline = /<col[^>]*outlineLevel="1"/.test(xml);
    xml = xml.replace(/<sheetFormatPr\b([^>]*?)\/>/g, (_all, attrs: string) => {
      let next = attrs;
      next = /\bdefaultRowHeight=/.test(next)
        ? next.replace(/defaultRowHeight="[^"]*"/, 'defaultRowHeight="0"')
        : `${next} defaultRowHeight="0"`;
      if (!/\bzeroHeight=/.test(next)) next += ' zeroHeight="1"';
      if (!/\bcustomHeight=/.test(next)) next += ' customHeight="1"';
      if (hasInstrumentOutline) {
        next = /\boutlineLevelCol=/.test(next)
          ? next.replace(/outlineLevelCol="[^"]*"/, 'outlineLevelCol="1"')
          : `${next} outlineLevelCol="1"`;
      }
      return `<sheetFormatPr${next}/>`;
    });
    if (hasInstrumentOutline) {
      xml = xml.replace(/<sheetProtection\b([^>]*)\/>/, (full, attrs: string) => {
        if (/formatColumns=/.test(attrs)) {
          return full.replace(/formatColumns="[^"]*"/, 'formatColumns="1"');
        }
        return full.replace("<sheetProtection", '<sheetProtection formatColumns="1"');
      });
      xml = xml.replace(/<sheetView\b([^>]*)>/, (full, attrs: string) => {
        if (/showOutlineSymbols=/.test(attrs)) {
          return full.replace(/showOutlineSymbols="[^"]*"/, 'showOutlineSymbols="1"');
        }
        return full.replace("<sheetView", '<sheetView showOutlineSymbols="1"');
      });
      if (!xml.includes("<outlinePr")) {
        if (/<sheetPr\b[^>]*\/>/.test(xml)) {
          xml = xml.replace(
            /<sheetPr\b([^>]*)\/>/,
            '<sheetPr$1><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>',
          );
        } else if (/<sheetPr\b/.test(xml)) {
          xml = xml.replace(
            /<sheetPr\b([^>]*)>/,
            '<sheetPr$1><outlinePr summaryBelow="1" summaryRight="1"/>',
          );
        } else {
          xml = xml.replace(
            /<worksheet\b([^>]*)>/,
            '<worksheet$1><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>',
          );
        }
      }
    }
    zip.file(name, xml);
  }
  return new Uint8Array(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }),
  );
}

export async function buildWorkbookExcel(sheets: WorkbookSheet[]): Promise<Uint8Array> {
  const list = sheets.filter((sheet) => sheet.name.trim());
  if (!list.length) throw new Error("empty-workbook");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hit Squad Project Controls";
  wb.lastModifiedBy = "Hit Squad Project Controls";
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  wb.views = [{ x: 0, y: 0, width: 12000, height: 8000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const { evalAt } = evaluateWorkbook(list);
  const used = new Set<string>();
  for (const sheet of list) {
    const raw = excelSafeSheetName(sheet.name);
    let safeName = raw;
    let n = 2;
    while (used.has(safeName.toLowerCase())) {
      const suffix = `-${n}`;
      safeName = `${raw.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
      n += 1;
    }
    used.add(safeName.toLowerCase());

    const isSummary = sheet.name === "Summary Page";
    const labor = isLaborSheet(sheet.name);
    const lastCol = maxHeaderCol(sheet.cells, sheet.headerRows?.length ? sheet.headerRows : 6);
    const lastColNum = colIndex(lastCol);
    const lastVisibleColNum = lastVisibleContentCol(sheet, lastColNum);
    const ws = wb.addWorksheet(safeName, {
      state: sheet.veryHidden ? "veryHidden" : "visible",
      properties: { tabColor: { argb: tabColorArgb(sheet.name) }, defaultRowHeight: 0 },
      pageSetup: {
        orientation: "landscape",
        fitToPage: !labor,
        fitToWidth: labor ? undefined : 1,
        fitToHeight: labor ? undefined : 20,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.65, bottom: 0.65, header: 0.28, footer: 0.28 },
        printTitlesRow: labor ? "4:6" : "6:6",
        printTitlesColumn: labor ? "A:J" : undefined,
      },
      headerFooter: {
        oddHeader: printHeader(safeName),
        oddFooter: PRINT_FOOTER,
        evenHeader: printHeader(safeName),
        evenFooter: PRINT_FOOTER,
      },
      views: [
        labor
          ? { state: "frozen", xSplit: LABOR_INSTRUMENT_LAST_COL, ySplit: 6, activeCell: "K7", showGridLines: false }
          : { state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false },
      ],
    });

    const merges = sheet.merges?.length ? sheet.merges : defaultMerges(sheet.cells);
    for (const merge of merges) ws.mergeCells(merge);

    const headers = headerByColumn(sheet.cells, 6);
    const maxRow = Math.max(1, ...sheet.cells.map((cell) => parseRef(cell.ref).row));
    const totalRows = new Set<number>();
    const adderRows = new Set<number>();
    const sectionRows = new Set<number>();
    const extraHeaders = new Set<number>([6, ...(sheet.headerRows ?? [])]);
    for (let row = 6; row <= maxRow + 1; row += 1) {
      if (isTotalRow(sheet.cells, row)) totalRows.add(row);
      else if (isSectionRow(sheet.cells, row)) sectionRows.add(row);
      else if (isSummary && isAdderRow(sheet.cells, row)) adderRows.add(row);
    }

    for (const cell of sheet.cells) {
      const { col, row, colNum } = parseRef(cell.ref);
      const exCell = ws.getCell(row, colNum);

      if (cell.type === "text") {
        if (!clientCopyIsClean(cell.value)) {
          throw new Error("client-copy-forbidden");
        }
        exCell.value = cell.value;
      } else if (cell.type === "number") {
        exCell.value = cell.value;
      } else if (cell.type === "date") {
        exCell.value = cell.value;
        exCell.numFmt = FMT_DATE;
      } else {
        exCell.value = { formula: cell.value, result: evalAt(sheet.name, cell.ref) };
      }

      if (totalRows.has(row)) applyTotalStyle(exCell);
      else if (sectionRows.has(row)) applySectionStyle(exCell);
      else if (extraHeaders.has(row) && row !== 6) applyRowStyle(exCell, 6, maxRow, isSummary, colNum);
      else if (adderRows.has(row)) applyAdderStyle(exCell);
      else applyRowStyle(exCell, row, maxRow, isSummary, colNum);

      if (labor && row === 6 && colNum >= LABOR_DATE_FIRST_COL) {
        exCell.numFmt = LABOR_DATE_NUM_FMT;
      }

      const fmt = cellFormat(sheet, headers, col, row, isSummary);
      if (fmt && row >= 7 && cell.type !== "text" && cell.type !== "date") exCell.numFmt = fmt;
      if (labor && row >= 7 && colNum >= LABOR_DATE_FIRST_COL && cell.type !== "text") {
        const kind = laborRowKind(sheet.cells, row);
        if (kind === "hc" || kind === "hps" || kind === "pd" || kind === "hours") {
          exCell.numFmt = FMT_HOURS;
        }
      }
      const setupUnlock = sheet.unlocked?.some((item) => item.row === row && item.col === colNum);
      exCell.protection = {
        locked: !(
          isLaborDayInput(sheet, row, colNum) ||
          isLaborBillAsInput(sheet, row, colNum) ||
          isLaborPositionInput(sheet, row, colNum) ||
          setupUnlock
        ),
      };
    }
    for (const rule of sheet.validations ?? []) {
      ws.getCell(rule.sqref).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: rule.formulae,
        showErrorMessage: false,
        showInputMessage: false,
      };
    }

    for (const [col, header] of headers) {
      ws.getColumn(colIndex(col)).width = columnWidth(col, header, sheet.name);
    }
    if (labor) applyLaborChrome(ws, sheet, maxRow, lastVisibleColNum, totalRows);
    else if (isSummary) applySummaryChrome(ws, maxRow, totalRows, sectionRows);
    else applyInstrumentChrome(ws, maxRow, lastVisibleColNum, totalRows, sectionRows, extraHeaders);

    const totalWidth = labor ? LABOR_INSTRUMENT_LAST_COL : lastVisibleColNum;
    for (const row of totalRows) applyTotalBar(ws, row, totalWidth);
    applySoftUsedBand(ws, lastVisibleColNum, maxRow);

    for (const col of sheet.hiddenCols ?? []) {
      ws.getColumn(col).hidden = true;
      ws.getColumn(col).width = 3;
    }
    hideUnusedGrid(ws, lastVisibleColNum, maxRow);
    if (labor && lastVisibleColNum >= LABOR_DATE_FIRST_COL) {
      for (let col = LABOR_DATE_FIRST_COL; col <= lastVisibleColNum; col += 1) {
        if (sheet.hiddenCols?.includes(col)) continue;
        ws.getColumn(col).width = LABOR_DAY_COL_WIDTH;
      }
    }

    ws.getRow(1).height = 22;
    if (labor) {
      ws.getRow(4).height = LABOR_PHASE_ROW_HEIGHT;
      ws.getRow(5).height = LABOR_PHASE_ROW_HEIGHT;
    } else {
      ws.getRow(4).height = 6;
      ws.getRow(5).height = 6;
    }
    applyHeaderMetaLayout(
      ws,
      labor ? Math.max(LABOR_INSTRUMENT_LAST_COL, lastVisibleColNum) : isSummary ? 3 : lastVisibleColNum,
      !labor,
    );
    if (!labor) ws.getRow(6).height = 20;
    ws.autoFilter = undefined;
    ws.pageSetup.printArea = `A1:${colLetter(lastVisibleColNum)}${Math.max(maxRow, 7)}`;
    if (labor && lastVisibleColNum >= LABOR_DATE_FIRST_COL) {
      for (let row = 7; row <= maxRow; row += 1) {
        if (!isLaborDayInput(sheet, row, LABOR_DATE_FIRST_COL)) continue;
        for (let col = LABOR_DATE_FIRST_COL; col <= lastVisibleColNum; col += 1) {
          const cell = ws.getCell(row, col);
          if (!isLaborCountInputCell(cell)) continue;
          cell.protection = { locked: false };
        }
      }
    }
    for (const slot of sheet.billAs ?? []) {
      ws.getCell(slot.valueRow, 2).protection = { locked: false };
    }
    for (const block of sheet.laborBlocks ?? []) {
      ws.getCell(block.start, 2).protection = { locked: false };
    }
    if (labor) {
      pinLaborCraftAlignment(ws, lastVisibleColNum, maxRow);
      applyHeaderMetaLayout(ws, Math.max(LABOR_INSTRUMENT_LAST_COL, lastVisibleColNum), false);
      pinLaborEvenRows(ws, sheet, lastVisibleColNum, maxRow);
    }
    pinHoursAndMoney(ws, sheet, lastVisibleColNum, maxRow, labor, isSummary);
    for (const slot of sheet.billAs ?? []) {
      const value = ws.getCell(slot.valueRow, 2);
      centerLaborCell(value, { wrapText: true });
      value.protection = { locked: false };
    }
    if (labor && lastVisibleColNum >= LABOR_DATE_FIRST_COL) {
      for (let col = LABOR_DATE_FIRST_COL; col <= lastVisibleColNum; col += 1) {
        if (sheet.hiddenCols?.includes(col)) continue;
        ws.getColumn(col).width = LABOR_DAY_COL_WIDTH;
      }
    }
    await ws.protect(SHEET_PROTECT_PASSWORD, labor ? LABOR_SHEET_PROTECT_OPTIONS : SHEET_PROTECT_OPTIONS);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return stampUnusedRowsHidden(new Uint8Array(buffer));
}
