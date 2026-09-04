/** ExcelJS .xlsx writer — Excel-365-safe package + Hit Squad client styling. */

import ExcelJS from "exceljs";
import { colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

const BRAND_STEEL = "FF0F3D44";
const HEADER_STEEL = "FF163038";
const BRAND_AMBER = "FFF0C14B";
const BAND_FILL = "FFE8EEF0";
const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF102226";
const MUTED_TEXT = "FF3D4F54";
const RULE = "FF0F5F6D";

const FMT_CURRENCY = "$#,##0.00";
const FMT_HOURS = "#,##0.0";
const FMT_INTEGER = "#,##0";
const FMT_PERCENT = "0.0%";
const FMT_DATE = "YYYY-MM-DD";

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

export const EXCEL_UNIT_FORMATS = {
  currency: FMT_CURRENCY,
  hours: FMT_HOURS,
  integer: FMT_INTEGER,
  percent: FMT_PERCENT,
  date: FMT_DATE,
} as const;

function tabColorArgb(name: string): string {
  if (name === "Summary Page") return BRAND_STEEL;
  if (name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support" || name === "Laydown") {
    return "FF1F8A96";
  }
  if (name.includes("Rental") || name === "COE" || name === "Tensioning Torquing equipment") return "FFC49214";
  if (name === "Rate Tables") return BRAND_STEEL;
  if (name.includes("Subcontractor") || name === "Staff Travel Cost" || name === "Misc Costs") return "FF0F5F6D";
  return "FF0F5F6D";
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
  const header = headers.get(col) ?? (isSummary && col === "B" ? "Amount $" : "");
  return formatForHeader(header);
}

function isTotalRow(cells: SheetCell[], row: number): boolean {
  const label = cells.find((cell) => cell.ref === `A${row}`);
  return label?.type === "text" && /^(TOTAL|ESTIMATE TOTAL|MAN-HOURS)/i.test(label.value);
}

function laborRowKind(cells: SheetCell[], row: number): "title" | "hc" | "hps" | "pd" | "hours" | "" {
  const shift = cells.find((cell) => cell.ref === `A${row}`);
  const type = cells.find((cell) => cell.ref === `F${row}`);
  if (type?.type === "text" && type.value === "TITLE") return "title";
  if (shift?.type === "text" && /DAYSHIFT|NIGHTSHIFT/i.test(shift.value)) return "title";
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
  const merges = [`A1:${lastCol}1`];
  if (cells.some((cell) => cell.ref === "A3")) merges.push(`A3:${lastCol}3`);
  return merges;
}

function isLaborSheet(name: string) {
  return name === "Staff" || name === "Foremen" || name === "Direct" || name === "Support";
}

function columnWidth(col: string, header: string | undefined, sheetName: string): number {
  const lower = (header ?? "").toLowerCase();
  const colNum = colIndex(col);
  if (isLaborSheet(sheetName) && colNum >= 12) return 7;
  if (col === "A") {
    if (sheetName === "Summary Page") return 36;
    if (isLaborSheet(sheetName)) return 28;
    if (/position|craft|item|vendor|phase|kind/.test(lower) || !header) return 32;
    return 24;
  }
  if (/description|scope/.test(lower)) return 30;
  if (/position|vendor|phase|item/.test(lower)) return 26;
  if (/man-hours|\bmh\b/.test(lower)) return 14;
  if (/headcount|qty|periods|travelers|miles|count|lane|shift/.test(lower)) return 12;
  if (/hrs|hours|days/.test(lower)) return 12;
  if (/\$|amount|total|cost|rate|freight|markup|each|bill|bw|pd/.test(lower)) return 14;
  return 12;
}

function applyRowStyle(
  exCell: ExcelJS.Cell,
  row: number,
  maxRow: number,
  isSummary: boolean,
  colNum: number,
  skipBand = false,
) {
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
    exCell.border = {
      bottom: { style: "medium", color: { argb: BRAND_AMBER } },
    };
    return;
  }
  if (row >= 7 && row < maxRow && (row - 7) % 2 === 1) {
    if (!skipBand) exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
    exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  } else if (row >= 7) {
    exCell.font = { color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  }
  if (isSummary && row >= 7 && (colNum === 2 || colNum === 3)) {
    exCell.alignment = { horizontal: "right" };
  }
}

function applyTotalStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 11 };
  exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_AMBER } };
  exCell.border = { top: { style: "medium", color: { argb: RULE } } };
}

function applyAdderStyle(exCell: ExcelJS.Cell) {
  exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
  exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3D6" } };
}

function printHeader(sheetName: string): string {
  const safe = sheetName.replace(/&/g, "and").slice(0, 24);
  return `&L&B HIT SQUAD / PROJECT CONTROLS &C ${safe} &R Confidential`;
}

const PRINT_FOOTER = "&L Produced by Hit Squad Project Controls &C &D &R Page &P of &N";

export function clientCopyIsClean(value: string): boolean {
  return !FORBIDDEN_CLIENT_COPY.test(value);
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
    const lastCol = maxHeaderCol(sheet.cells);
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
          : { state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true },
      ],
    });

    const merges = sheet.merges?.length ? sheet.merges : defaultMerges(sheet.cells);
    for (const merge of merges) ws.mergeCells(merge);

    const headers = headerByColumn(sheet.cells, 6);
    const maxRow = Math.max(1, ...sheet.cells.map((cell) => parseRef(cell.ref).row));
    const totalRows = new Set<number>();
    const adderRows = new Set<number>();
    for (let row = 7; row <= maxRow + 1; row += 1) {
      if (isTotalRow(sheet.cells, row)) totalRows.add(row);
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
        exCell.value = { formula: cell.value };
      }

      if (totalRows.has(row)) applyTotalStyle(exCell);
      else if (adderRows.has(row)) applyAdderStyle(exCell);
      else applyRowStyle(exCell, row, maxRow, isSummary, colNum, labor);

      if (labor && !totalRows.has(row)) {
        const kind = laborRowKind(sheet.cells, row);
        if (kind === "title") {
          exCell.font = { bold: true, color: { argb: DARK_TEXT }, name: "Calibri", size: 10 };
          exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
        } else if (kind === "hc" || kind === "hps") {
          exCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E6" } };
        }
      }

      if (labor && row === 6 && colNum >= 12) {
        exCell.numFmt = "D-MMM";
      }

      const fmt = cellFormat(sheet, headers, col, row, isSummary);
      if (fmt && row >= 7 && cell.type !== "text" && cell.type !== "date") exCell.numFmt = fmt;
      if (labor && row >= 7 && colNum >= 12 && cell.type !== "text") {
        const kind = laborRowKind(sheet.cells, row);
        if (kind === "hc" || kind === "pd") exCell.numFmt = FMT_INTEGER;
        else if (kind === "hps" || kind === "hours") exCell.numFmt = FMT_HOURS;
      }
    }

    for (const [col, header] of headers) {
      ws.getColumn(colIndex(col)).width = columnWidth(col, header, sheet.name);
    }
    if (labor) {
      const lastColNum = colIndex(lastCol);
      for (let i = 12; i <= lastColNum; i += 1) ws.getColumn(i).width = 7;
      ws.getColumn(1).width = 28;
      ws.getColumn(3).width = 26;
    }
    for (const col of sheet.hiddenCols ?? []) {
      ws.getColumn(col).hidden = true;
      ws.getColumn(col).width = 3;
    }
    if (isSummary) {
      ws.getColumn(1).width = 36;
      ws.getColumn(2).width = 16;
      ws.getColumn(3).width = 14;
    }

    ws.getRow(1).height = 22;
    ws.getRow(6).height = 20;
    ws.autoFilter = undefined;
    ws.pageSetup.printArea = `A1:${lastCol}${Math.max(maxRow, 7)}`;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
