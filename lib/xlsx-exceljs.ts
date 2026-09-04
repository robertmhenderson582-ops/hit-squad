/**
 * ExcelJS .xlsx writer — Excel-365-safe package + Hit Squad client styling.
 * Chrome only. Does not compute estimate dollars. Money stays in
 * estimate-xlsx / estimate-desk-total / shared desk libs.
 * Standing ripple rule is RETROACTIVE (excel-ripple.ts): Look paint already
 * on this branch (TOTAL bars, Rate Tables chrome, wrap, center, drop .0)
 * must not invent catalogs or disconnect math from those libs.
 */

import ExcelJS from "exceljs";
import { evaluateWorkbook } from "./xlsx-eval.ts";
import { colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF102226";
const MUTED_TEXT = "FF3D4F54";
const GRID = "FF8AA3A1";
const BLACK = "FF000000";
export const STEEL = "FF0F5F6D";
export const STEEL_DEEP = "FF083943";
export const AMBER_FLARE = "FFE38B2A";
const PLATE_WASH = "FFE4EBE9";
const PLATE_WASH_DEEP = "FFDCE6E4";

const FMT_CURRENCY = "$#,##0.00";
/** Whole hours/counts as 9 / 2,752; fraction only when present (9.5). */
export const FMT_HOURS = "#,##0.##";
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
/** Empty B–K on HC/HPS rows — not yellow voids. Desk mint plate. */
export const LABOR_HC_HPS_CLEAR = "FFE7EEEC";
export const LABOR_HOURS_LABEL = STEEL;
export const LABOR_PD_LABEL = AMBER_FLARE;
export const LABOR_DAYSHIFT_BANNER = "FFC5D9D6";
export const LABOR_NIGHTSHIFT_BANNER = STEEL_DEEP;
export const LABOR_SPACER = "FFB7C8C6";
export const LABOR_CAGE_WASH_A = "FFD5E3E1";
export const LABOR_CAGE_WASH_B = "FFC4D6D4";
export const LABOR_DAY_WASH = "FFF2F6F5";
export const SUMMARY_SECTION = STEEL;
export const SUMMARY_TOTAL = AMBER_FLARE;
export const SUMMARY_ZEBRA_A = "FFE7EEEC";
export const SUMMARY_ZEBRA_B = "FFDCE8E6";

/** Compact 9pt subtitle row. Grows only when the merged A1–last header is too narrow. */
export const HEADER_META_LINE_HEIGHT = 16;
/** Two wrapped lines of Calibri 9 — keeps the header stack, no giant single-line merge. */
export const HEADER_META_WRAP_HEIGHT = 28;

export const LABOR_COL_WIDTHS: Record<string, number> = {
  A: 10,
  B: 13,
  C: 24,
  D: 14,
  // ExcelJS omits width=9 (treats it as the default and drops the col). 9.01 persists as ~9.
  E: 9.01,
  F: 9.01,
  G: 8.5,
  H: 8.5,
  I: 8.5,
  J: 8.5,
  K: 10,
};
/** Wide enough for 10.5 after optional-decimal format. Width 3 made `9.0` into ##. */
export const LABOR_DAY_COL_WIDTH = 4;
export const SUMMARY_COL_A_WIDTH = 28;
export const LABOR_DATE_FIRST_COL = 12;

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
  if (/man-hours|\bmh\b|total billable/.test(lower)) return FMT_HOURS;
  if (/pd days/.test(lower)) return FMT_HOURS;
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

export { EXCEL_RIPPLE_RULE } from "./excel-ripple.ts";
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
  const type = cells.find((cell) => cell.ref === `F${row}`);
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

function applyHeaderMetaLayout(ws: ExcelJS.Worksheet, bandLastCol: number) {
  for (const row of [2, 3] as const) {
    const cell = ws.getCell(row, 1);
    cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
    ws.getRow(row).height = headerMetaHeight(String(cell.value ?? ""), headerBandWidth(ws, bandLastCol));
  }
}

function isLaborSheet(name: string) {
  return name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support";
}

/** Yellow HC / HPS / PD day-grid cells — the only unlocked edit surface. */
export function isLaborDayInput(sheet: WorkbookSheet, row: number, colNum: number): boolean {
  if (!isLaborSheet(sheet.name) || colNum < LABOR_DATE_FIRST_COL) return false;
  const kind = laborRowKind(sheet.cells, row);
  return kind === "hc" || kind === "hps" || kind === "pd";
}

function columnWidth(col: string, header: string | undefined, sheetName: string): number {
  const lower = (header ?? "").toLowerCase();
  const colNum = colIndex(col);
  if (isLaborSheet(sheetName) && colNum >= 12) return LABOR_DAY_COL_WIDTH;
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
  if (/\$|amount|total|cost|rate|freight|markup|each|bill|bw|pd/.test(lower)) return 12;
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
    exCell.font = { size: 9, color: { argb: STEEL_DEEP }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH);
    exCell.alignment = { vertical: "middle", wrapText: true };
    return;
  }
  if (row === 3) {
    exCell.font = { size: 9, italic: true, color: { argb: MUTED_TEXT }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH_DEEP);
    exCell.alignment = { vertical: "middle", wrapText: true };
    return;
  }
  if (row === 4 || row === 5) {
    exCell.font = { size: 9, color: { argb: MUTED_TEXT }, name: "Calibri" };
    exCell.fill = solid(PLATE_WASH);
    exCell.alignment = { wrapText: false };
    return;
  }
  if (row === 6) {
    exCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 9 };
    exCell.fill = solid(STEEL_DEEP);
    exCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    exCell.border = {
      bottom: { style: "medium", color: { argb: AMBER_FLARE } },
    };
    return;
  }
  exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  if (isSummary && row >= 7 && (colNum === 2 || colNum === 3)) {
    exCell.alignment = { horizontal: "right" };
  }
}

function applyTotalStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 11 };
  exCell.fill = solid(SUMMARY_TOTAL);
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
      if (col === 1) {
        cell.font = { bold: true, color: { argb: STEEL_DEEP }, name: "Calibri", size: 10 };
      }
    }
  }
  for (const row of sectionRows) {
    for (let col = 1; col <= lastColNum; col += 1) applySectionStyle(ws.getCell(row, col));
  }
}

function applyAdderStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
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
    vertical: "middle",
    horizontal: "center",
    wrapText: Boolean(cell.alignment?.wrapText),
    ...extra,
  };
}

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
    for (let col = 1; col <= 11; col += 1) {
      const cell = ws.getCell(row, col);
      if (kind === "title") {
        if (col === 1) {
          cell.fill = solid(night ? LABOR_NIGHTSHIFT_BANNER : LABOR_DAYSHIFT_BANNER);
          cell.font = {
            bold: true,
            color: { argb: night ? WHITE : DARK_TEXT },
            name: "Calibri",
            size: 9,
          };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        } else {
          cell.fill = solid(LABOR_POSITION_TITLE);
          cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
          centerLaborCell(cell, col === 3 ? { wrapText: true } : {});
        }
      } else if (kind === "hc" || kind === "hps") {
        cell.fill = solid(LABOR_HC_HPS_CLEAR);
        cell.font = { bold: true, color: { argb: STEEL_DEEP }, name: "Calibri", size: 9 };
        if (kind === "hps" && col === 1) {
          cell.alignment = { wrapText: true, vertical: "middle" };
        } else if (col >= 2) {
          centerLaborCell(cell);
        }
      } else if (kind === "hours" || kind === "pd") {
        if (col === 6) {
          cell.fill = solid(kind === "pd" ? LABOR_PD_LABEL : LABOR_HOURS_LABEL);
          cell.font = {
            bold: true,
            color: { argb: kind === "pd" ? DARK_TEXT : WHITE },
            name: "Calibri",
            size: 9,
          };
          centerLaborCell(cell);
        } else {
          const wash = (row - block.start) % 2 === 0 ? LABOR_CAGE_WASH_A : LABOR_CAGE_WASH_B;
          cell.fill = solid(wash);
          cell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
          if (col >= 2) centerLaborCell(cell);
        }
      }
    }
    if (kind === "hc" || kind === "hps") {
      for (let col = 12; col <= lastDateCol; col += 1) {
        const day = ws.getCell(row, col);
        day.fill = solid(LABOR_HC_HPS);
        centerLaborCell(day);
      }
    }
    if (kind === "hours" || kind === "pd") {
      for (let col = 12; col <= lastDateCol; col += 1) {
        const day = ws.getCell(row, col);
        day.fill = solid(LABOR_DAY_WASH);
        centerLaborCell(day);
      }
    }
    if (kind === "hps") ws.getRow(row).height = 28;
  }

  hairGrid(ws, block.start, block.end, 1, 11);
  boxRange(ws, block.start, block.end, 1, 11, "medium");

  if (lastDateCol >= 12) {
    hairGrid(ws, block.start, block.end, 12, lastDateCol);
    for (let row = block.start + 3; row <= block.start + 5; row += 1) {
      for (let col = 12; col <= lastDateCol; col += 1) {
        patchBorder(ws.getCell(row, col), {
          top: edge("hair", GRID),
          bottom: edge("hair", GRID),
        });
        if (col > 12) patchBorder(ws.getCell(row, col), { left: edge("thin", GRID) });
      }
    }
    boxRange(ws, block.start, block.end, 12, lastDateCol, "medium");
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
  if (lastDateCol >= 12) {
    for (let i = 12; i <= lastDateCol; i += 1) {
      ws.getColumn(i).width = LABOR_DAY_COL_WIDTH;
      ws.getColumn(i).alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  ws.getColumn(3).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  for (const col of [2, 4, 5, 6, 7, 8, 9, 10, 11]) {
    ws.getColumn(col).alignment = { horizontal: "center", vertical: "middle" };
  }

  const blocks = sheet.laborBlocks?.length ? sheet.laborBlocks : inferLaborBlocks(sheet.cells, maxRow);
  for (const block of blocks) applyLaborBlockChrome(ws, sheet, block, lastDateCol);

  for (const row of sheet.spacerRows ?? []) {
    for (let col = 1; col <= Math.max(11, lastDateCol); col += 1) {
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
        exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 8 };
      }
    }
  }

  if (lastDateCol >= 12) {
    const first = colLetter(12);
    const last = colLetter(lastDateCol);
    const weekendRule = {
      type: "expression" as const,
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

  for (let col = 12; col <= lastDateCol; col += 1) {
    const header = ws.getCell(6, col);
    header.alignment = { textRotation: 90, vertical: "middle", horizontal: "center", wrapText: false };
    header.numFmt = "D-MMM";
  }
  ws.getRow(6).height = 36;
}

function applySummaryChrome(
  ws: ExcelJS.Worksheet,
  maxRow: number,
  totalRows: Set<number>,
  sectionRows: Set<number>,
) {
  ws.getColumn(1).width = SUMMARY_COL_A_WIDTH;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 12;
  hairGrid(ws, 6, maxRow, 1, 3);
  for (let col = 1; col <= 3; col += 1) {
    patchBorder(ws.getCell(6, col), { bottom: edge("medium", AMBER_FLARE) });
  }
  for (let row = 7; row <= maxRow; row += 1) {
    if (totalRows.has(row) || sectionRows.has(row)) continue;
    const wash = row % 2 === 0 ? SUMMARY_ZEBRA_B : SUMMARY_ZEBRA_A;
    for (let col = 1; col <= 3; col += 1) {
      ws.getCell(row, col).fill = solid(wash);
    }
  }
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
    const ws = wb.addWorksheet(safeName, {
      properties: { tabColor: { argb: tabColorArgb(sheet.name) } },
      pageSetup: {
        orientation: "landscape",
        fitToPage: !labor,
        fitToWidth: labor ? undefined : 1,
        fitToHeight: labor ? undefined : 20,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.65, bottom: 0.65, header: 0.28, footer: 0.28 },
        printTitlesRow: "6:6",
        printTitlesColumn: labor ? "A:K" : undefined,
      },
      headerFooter: {
        oddHeader: printHeader(safeName),
        oddFooter: PRINT_FOOTER,
        evenHeader: printHeader(safeName),
        evenFooter: PRINT_FOOTER,
      },
      views: [
        labor
          ? { state: "frozen", xSplit: 11, ySplit: 6, activeCell: "L7", showGridLines: true }
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

      if (labor && row === 6 && colNum >= 12) {
        exCell.numFmt = "D-MMM";
      }

      const fmt = cellFormat(sheet, headers, col, row, isSummary);
      if (fmt && row >= 7 && cell.type !== "text" && cell.type !== "date") exCell.numFmt = fmt;
      if (labor && row >= 7 && colNum >= 12 && cell.type !== "text") {
        const kind = laborRowKind(sheet.cells, row);
        if (kind === "hc" || kind === "hps" || kind === "pd" || kind === "hours") {
          exCell.numFmt = FMT_HOURS;
        }
      }
      exCell.protection = { locked: !isLaborDayInput(sheet, row, colNum) };
    }

    for (const [col, header] of headers) {
      ws.getColumn(colIndex(col)).width = columnWidth(col, header, sheet.name);
    }
    if (labor) applyLaborChrome(ws, sheet, maxRow, lastColNum, totalRows);
    else if (isSummary) applySummaryChrome(ws, maxRow, totalRows, sectionRows);
    else applyInstrumentChrome(ws, maxRow, lastColNum, totalRows, sectionRows, extraHeaders);

    const totalWidth = labor ? 11 : lastColNum;
    for (const row of totalRows) applyTotalBar(ws, row, totalWidth);

    for (const col of sheet.hiddenCols ?? []) {
      ws.getColumn(col).hidden = true;
      ws.getColumn(col).width = 3;
    }

    ws.getRow(1).height = 22;
    ws.getRow(4).height = 6;
    ws.getRow(5).height = 6;
    applyHeaderMetaLayout(ws, labor ? 11 : isSummary ? 3 : lastColNum);
    if (!labor) ws.getRow(6).height = 20;
    ws.autoFilter = undefined;
    ws.pageSetup.printArea = `A1:${lastCol}${Math.max(maxRow, 7)}`;
    if (labor && lastColNum >= LABOR_DATE_FIRST_COL) {
      for (let row = 7; row <= maxRow; row += 1) {
        if (!isLaborDayInput(sheet, row, LABOR_DATE_FIRST_COL)) continue;
        for (let col = LABOR_DATE_FIRST_COL; col <= lastColNum; col += 1) {
          ws.getCell(row, col).protection = { locked: false };
        }
      }
    }
    await ws.protect(SHEET_PROTECT_PASSWORD, SHEET_PROTECT_OPTIONS);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
