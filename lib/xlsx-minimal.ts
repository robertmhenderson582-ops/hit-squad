/**
 * Shared estimate export cell types and ExcelJS workbook entrypoint.
 * Live .xlsx bytes come from ExcelJS (`xlsx-exceljs.ts`) — not the homemade
 * sheet XML below. `buildSheetXml` stays for unit tests of escaping only.
 * No workbooks in git.
 */

export const REQUIRED_XLSX_PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
] as const;

const EXCEL_SHEET_NAME_ILLEGAL = /[:\\/?*[\]&]/g;
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/** MS-DOS date/time helper retained for tests. */
export function dosDateTime(now = new Date()): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, now.getFullYear()));
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

export function stripXmlIllegal(value: string): string {
  return value.replace(XML_ILLEGAL, "");
}

/** Text nodes: only & < >. Quotes stay as quotes so Excel does not repair inlineStr. */
export function xmlEscape(value: string): string {
  return stripXmlIllegal(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function xmlAttrEscape(value: string): string {
  return xmlEscape(value).replaceAll('"', "&quot;");
}

/** Excel sheet names cannot contain : \ / ? * [ ] and this package also drops &. */
export function excelSafeSheetName(name = ""): string {
  const cleaned = stripXmlIllegal(name)
    .replace(EXCEL_SHEET_NAME_ILLEGAL, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "");
  const sliced = cleaned.slice(0, 31).replace(/^'+|'+$/g, "");
  return sliced || "Sheet";
}

/** Excel 1900 date system (serial 1 = 1899-12-31). Used only by the test XML helper. */
export function excelDateSerial(value: Date): number {
  const utc = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

export function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export type SheetCell =
  | { ref: string; type: "text"; value: string }
  | { ref: string; type: "number"; value: number }
  | { ref: string; type: "formula"; value: string }
  | { ref: string; type: "date"; value: Date };

export function buildSheetXml(cells: SheetCell[], merges: string[] = []): string {
  const byRow = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    const row = Number(/(\d+)$/.exec(cell.ref)?.[1] || 0);
    const list = byRow.get(row) ?? [];
    list.push(cell);
    byRow.set(row, list);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const rowXml = rows
    .map((row) => {
      const items = (byRow.get(row) ?? [])
        .slice()
        .sort((a, b) => a.ref.localeCompare(b.ref, "en", { numeric: true }));
      const inner = items
        .map((cell) => {
          if (cell.type === "text") {
            return `<c r="${cell.ref}" t="inlineStr"><is><t>${xmlEscape(cell.value)}</t></is></c>`;
          }
          if (cell.type === "number") {
            return `<c r="${cell.ref}"><v>${cell.value}</v></c>`;
          }
          if (cell.type === "date") {
            const serial = excelDateSerial(cell.value);
            return `<c r="${cell.ref}" s="1"><v>${serial}</v></c>`;
          }
          return `<c r="${cell.ref}"><f>${xmlEscape(cell.value)}</f></c>`;
        })
        .join("");
      return `<row r="${row}">${inner}</row>`;
    })
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowXml}</sheetData>${mergeXml}</worksheet>`
  );
}

export type WorkbookSheet = {
  name: string;
  cells: SheetCell[];
  merges?: string[];
  /** 1-based columns to hide (labor block-id, etc.). */
  hiddenCols?: number[];
  /** Labor date columns: JS weekday 0 = Sunday, 6 = Saturday. */
  weekendCols?: Array<{ col: number; weekday: 0 | 6 }>;
  /** 7-row position blocks on Staff / Foremen / Direct / Support (title…PD). */
  laborBlocks?: Array<{ start: number; end: number }>;
  /** Gray break rows between position blocks. */
  spacerRows?: number[];
  /** Extra column-header rows (Rate Tables sections). Row 6 is always a header. */
  headerRows?: number[];
  /** Job setup phase runs on labor rows 4–5 (day-grid columns). */
  phaseBar?: Array<{ startCol: number; endCol: number; phaseId: string }>;
  /** Support Bill as field — label + value rows in column C under Position. */
  billAs?: Array<{ labelRow: number; valueRow: number }>;
};

export async function buildWorkbook(sheets: WorkbookSheet[]): Promise<Uint8Array> {
  const { buildWorkbookExcel } = await import("./xlsx-exceljs.ts");
  return buildWorkbookExcel(sheets);
}

export async function buildXlsx(sheetName: string, cells: SheetCell[], merges: string[] = []): Promise<Uint8Array> {
  return buildWorkbook([{ name: sheetName, cells, merges }]);
}

export function downloadXlsx(filename: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
