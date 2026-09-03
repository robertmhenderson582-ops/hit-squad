/** ExcelJS .xlsx writer — Excel-365-safe package + Hit Squad client styling. */

import ExcelJS from "exceljs";
import { colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

const BRAND_STEEL = "FF163038";
const HEADER_STEEL = "FF1E4A52";
const BRAND_AMBER = "FFE8C872";
const BAND_FILL = "FFF4F7F8";
const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF163038";
const MUTED_TEXT = "FF5A6A6E";

const FMT_CURRENCY = "$#,##0.00";
const FMT_HOURS = "#,##0.0";
const FMT_INTEGER = "#,##0";
const FMT_PERCENT = "0.0%";

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

function maxHeaderCol(cells: SheetCell[], row = 6): string {
  let max = 1;
  for (const cell of cells) {
    const parsed = parseRef(cell.ref);
    if (parsed.row === row) max = Math.max(max, parsed.colNum);
  }
  return colLetter(max);
}

/** Map column header labels to unmistakable Excel number formats. */
export function formatForHeader(header: string): string | undefined {
  const lower = header.trim().toLowerCase();
  if (lower.includes("%") || lower === "markup %") return FMT_PERCENT;
  if (/pd days/.test(lower)) return FMT_HOURS;
  if (/hrs|hours/.test(lower) && !/\$/.test(lower)) return FMT_HOURS;
  if (/headcount|qty|periods|travelers|\bcount\b/.test(lower)) return FMT_INTEGER;
  if (lower === "miles") return FMT_INTEGER;
  if (
    /\$|amount|cost|freight|each|markup|bill|bw|\/ mile|rate|total|pd \$|st \$|ot \$|dt \$/.test(lower) &&
    !/hrs|hours/.test(lower)
  ) {
    return FMT_CURRENCY;
  }
  return undefined;
}

/** Summary rollup column B uses the line label in column A, not the sheet header. */
export function summaryLineFormat(lineLabel: string): string {
  if (lineLabel.trim().toLowerCase() === "hours") return FMT_HOURS;
  return FMT_CURRENCY;
}

export const EXCEL_UNIT_FORMATS = {
  currency: FMT_CURRENCY,
  hours: FMT_HOURS,
  integer: FMT_INTEGER,
  percent: FMT_PERCENT,
} as const;

function tabColorArgb(name: string): string {
  if (name === "Summary Page") return BRAND_STEEL;
  if (name === "ORG Chart" || name === "Slicer Hrs") return "FF2A7A84";
  if (name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support") return "FF3EC6D4";
  if (name.includes("Rental") || name === "COE" || name === "Tensioning Torquing equipment") return "FFD4A017";
  if (name === "Rate Tables") return BRAND_STEEL;
  if (name.includes("Subcontractor") || name === "Staff Travel Cost" || name === "Misc Costs") return "FF2A7A84";
  return "FF2A7A84";
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
  if (isSummary && col === "B" && row >= 7) {
    return summaryLineFormat(labelByRow(sheet.cells, row) ?? "Amount $");
  }
  const header = headers.get(col) ?? (isSummary && col === "B" ? "Amount $" : "");
  return formatForHeader(header);
}

function isTotalRow(cells: SheetCell[], row: number): boolean {
  const label = cells.find((cell) => cell.ref === `A${row}`);
  return label?.type === "text" && /^(TOTAL|ESTIMATE TOTAL)/i.test(label.value);
}

function defaultMerges(cells: SheetCell[]): string[] {
  const lastCol = maxHeaderCol(cells);
  const merges = [`A1:${lastCol}1`];
  if (cells.some((cell) => cell.ref === "A3")) merges.push(`A3:${lastCol}3`);
  return merges;
}

function columnWidth(col: string, header: string | undefined, sheetName: string): number {
  const lower = (header ?? "").toLowerCase();
  if (col === "A") {
    if (sheetName === "Summary Page") return 34;
    if (/position|craft|item|vendor|phase|kind/.test(lower) || !header) return 30;
    return 24;
  }
  if (/description|scope/.test(lower)) return 28;
  if (/position|vendor|phase|item/.test(lower)) return 26;
  if (/headcount|qty|periods|travelers|miles|count|lane|shift/.test(lower)) return 11;
  if (/hrs|hours|days/.test(lower)) return 11;
  if (/\$|amount|total|cost|rate|freight|markup|each|bill|bw|pd/.test(lower)) return 13;
  return 12;
}

function applyRowStyle(exCell: ExcelJS.Cell, row: number, maxRow: number, isSummary: boolean, colNum: number) {
  if (row === 1) {
    exCell.font = { bold: true, size: 13, color: { argb: WHITE }, name: "Calibri" };
    exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_STEEL } };
    exCell.alignment = { vertical: "middle" };
    return;
  }
  if (row === 2) {
    exCell.font = { size: 9, color: { argb: MUTED_TEXT }, name: "Calibri" };
    return;
  }
  if (row === 3) {
    exCell.font = { bold: true, size: 12, color: { argb: DARK_TEXT }, name: "Calibri" };
    return;
  }
  if (row === 4) {
    exCell.font = { size: 10, color: { argb: DARK_TEXT }, name: "Calibri" };
    exCell.alignment = { wrapText: true };
    return;
  }
  if (row === 5) {
    exCell.font = { size: 9, italic: true, color: { argb: MUTED_TEXT }, name: "Calibri" };
    return;
  }
  if (row === 6) {
    exCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_STEEL } };
    exCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    return;
  }
  if (row >= 7 && row < maxRow && (row - 7) % 2 === 1) {
    exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
    exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
    return;
  }
  if (row >= 7) {
    exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  }
  if (isSummary && row >= 7 && colNum === 2) {
    exCell.alignment = { horizontal: "right" };
  }
}

function applyTotalStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_AMBER } };
  exCell.border = { top: { style: "medium", color: { argb: BRAND_STEEL } } };
}

export async function buildWorkbookExcel(sheets: WorkbookSheet[]): Promise<Uint8Array> {
  const list = sheets.filter((sheet) => sheet.name.trim());
  if (!list.length) throw new Error("empty-workbook");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hit Squad Project Controls";
  wb.lastModifiedBy = "Hit Squad Project Controls";
  wb.created = new Date();
  wb.modified = new Date();

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
    const ws = wb.addWorksheet(safeName, {
      properties: { tabColor: { argb: tabColorArgb(sheet.name) } },
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.45, right: 0.45, top: 0.6, bottom: 0.6, header: 0.25, footer: 0.25 },
        printTitlesRow: "6:6",
      },
      views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }],
    });

    const merges = sheet.merges?.length ? sheet.merges : defaultMerges(sheet.cells);
    for (const merge of merges) ws.mergeCells(merge);

    const headers = headerByColumn(sheet.cells, 6);
    const maxRow = Math.max(1, ...sheet.cells.map((cell) => parseRef(cell.ref).row));
    const totalRows = new Set<number>();
    for (let row = 7; row <= maxRow + 1; row += 1) {
      if (isTotalRow(sheet.cells, row)) totalRows.add(row);
    }

    for (const cell of sheet.cells) {
      const { col, row, colNum } = parseRef(cell.ref);
      const exCell = ws.getCell(row, colNum);

      if (cell.type === "text") exCell.value = cell.value;
      else if (cell.type === "number") exCell.value = cell.value;
      else exCell.value = { formula: cell.value, result: 0 };

      if (totalRows.has(row)) applyTotalStyle(exCell);
      else applyRowStyle(exCell, row, maxRow, isSummary, colNum);

      const fmt = cellFormat(sheet, headers, col, row, isSummary);
      if (fmt && row >= 7 && cell.type !== "text") exCell.numFmt = fmt;
    }

    for (const [col, header] of headers) {
      ws.getColumn(colIndex(col)).width = columnWidth(col, header, sheet.name);
    }
    if (isSummary) {
      ws.getColumn(1).width = 34;
      ws.getColumn(2).width = 16;
    }

    ws.getRow(1).height = 22;
    ws.getRow(6).height = 20;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
