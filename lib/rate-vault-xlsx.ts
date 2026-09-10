/**
 * Rate Vault B-1 Excel export / import.
 * Vault-internal formula check to the site — same credibility bar as
 * estimate Excel, but this file must not import the estimate pack or workbook writer.
 * Hidden row ids + Rate Summary cells are the keys. Excel is never a
 * parallel book: re-import updates the vault preview / rate package.
 * Refuse silent poison (Monroe / Yates, bad money, empty package).
 */

import ExcelJS from "exceljs";
import {
  RATE_VAULT_B1_BURDEN_SHEET,
  RATE_VAULT_B1_CBA_SHEET,
  RATE_VAULT_B1_COMP_SHEET,
  RATE_VAULT_B1_IMPORT_ERROR,
  RATE_VAULT_B1_KIND,
  RATE_VAULT_B1_MARKER,
  RATE_VAULT_B1_PACKAGE_SHEET,
  RATE_VAULT_B1_POISON_ERROR,
  RATE_VAULT_B1_RATE_SHEET,
  RATE_VAULT_B1_REQUIRED_SHEETS,
  RATE_VAULT_B1_SPARE_POSITIONS,
  RATE_VAULT_B1_STATE_SHEET,
  RATE_VAULT_CBA_PLA_RULES,
  RATE_VAULT_CBA_PLA_SECTION,
  RATE_VAULT_STATE_LAW_RULES,
  RATE_VAULT_STATE_LAW_SECTION,
  RATE_VAULT_STATE_LAW_SITES,
  isRateVaultB1ExcelName,
  isRateVaultSiteId,
  looksLikeForeignRateVaultSite,
  rateVaultSiteLabel,
  type RateVaultBurdenLine,
  type RateVaultLane,
  type RateVaultOcipFace,
  type RateVaultPreviewPackage,
  type RateVaultPreviewRow,
  type RateVaultSiteId,
} from "./rate-vault.ts";
import {
  defaultRateVaultClockNote,
  filterPreviewByFace,
  inferRateVaultLane,
  inferRateVaultOcip,
  parseRateVaultPreviewPackage,
  rateVaultCompCheck,
} from "./rate-vault-preview.ts";

export const RATE_VAULT_B1_RATE_HEADERS = [
  "Position",
  "Craft",
  "Local",
  "Group",
  "Sheet",
  "Wage",
  "Fringe",
  "Burden",
  "Bill ST",
  "Bill OT",
  "Bill DT",
  "Lane",
  "OCIP",
  "OT / clock",
  "_id",
] as const;

export const RATE_VAULT_B1_BURDEN_HEADERS = ["Item", "Rate %", "Note", "_id"] as const;

export const RATE_VAULT_B1_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MONEY_FMT = "$#,##0.00";
const PCT_FMT = "0.00";
const SPARE_ID_RE = /^xlsx-spare-/i;

export type RateVaultB1ImportOk = {
  ok: true;
  preview: RateVaultPreviewPackage;
};

export type RateVaultB1ImportFail = {
  ok: false;
  code: "not-vault-b1" | "poison" | "empty" | "invalid" | "ocip-mix";
  error: string;
  needsConfirm?: boolean;
};

const BILL_ST_FORMULA = /^F(\d+)\s*\+\s*G\1\s*\+\s*H\1$/i;

export type RateVaultB1ImportResult = RateVaultB1ImportOk | RateVaultB1ImportFail;

export type RateVaultB1XlsxInput = {
  fileName?: string;
  type?: string;
  data?: string;
  bytes?: Uint8Array | ArrayBuffer;
};

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function text(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value && typeof value === "object") {
    if ("error" in value && (value as { error?: unknown }).error) return "";
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text.trim();
    }
    if ("richText" in value && Array.isArray((value as { richText?: Array<{ text?: string }> }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text || "").join("").trim();
    }
    if ("result" in value) return text((value as { result: unknown }).result);
    if ("hyperlink" in value && "text" in value) return text((value as { text: unknown }).text);
  }
  return String(value).trim();
}

function cellHasFormula(cell: ExcelJS.Cell) {
  const raw = cell.value;
  if (cell.formula) return true;
  return Boolean(raw && typeof raw === "object" && "formula" in raw && (raw as { formula?: unknown }).formula);
}

function isExcelError(value: unknown) {
  if (typeof value === "string" && /^#(?:VALUE|REF|N\/A|DIV\/0|NAME|NULL|NUM|GETTING_DATA)!?$/i.test(value.trim())) {
    return true;
  }
  return Boolean(value && typeof value === "object" && "error" in value && (value as { error?: unknown }).error);
}

function readNumber(cell: ExcelJS.Cell): { empty: true } | { ok: true; value: number } | { poison: true } {
  const raw = cell.value;
  if (raw == null || raw === "") return { empty: true };
  if (isExcelError(raw)) return { poison: true };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { poison: true };
    return { ok: true, value: money(raw) };
  }
  if (typeof raw === "boolean") return { ok: true, value: raw ? 1 : 0 };
  if (typeof raw === "string") {
    const cleaned = raw.trim();
    if (!cleaned) return { empty: true };
    if (cleaned.startsWith("=") || isExcelError(cleaned)) return { poison: true };
    const next = Number(cleaned.replace(/[$,%]/g, "").replace(/,/g, ""));
    if (!Number.isFinite(next)) return { poison: true };
    return { ok: true, value: money(next) };
  }
  if (raw && typeof raw === "object") {
    if ("result" in raw) {
      const result = (raw as { result: unknown }).result;
      if (result == null || result === "") return { empty: true };
      if (typeof result === "number" && Number.isFinite(result)) return { ok: true, value: money(result) };
      if (typeof result === "string" && result.trim()) {
        const next = Number(result.replace(/[$,%]/g, "").replace(/,/g, ""));
        if (!Number.isFinite(next)) return { poison: true };
        return { ok: true, value: money(next) };
      }
      return { poison: true };
    }
  }
  return { poison: true };
}

function fail(code: RateVaultB1ImportFail["code"], error: string): RateVaultB1ImportFail {
  return { ok: false, code, error };
}

export function isRateVaultB1SpareId(id: string) {
  return SPARE_ID_RE.test(id);
}

export function rateVaultB1FileName(preview: Pick<RateVaultPreviewPackage, "siteId" | "title">) {
  const site = rateVaultSiteLabel(preview.siteId).replace(/\s+/g, "-") || "P66";
  return `${site}-B1-Rate-Vault.xlsx`;
}

export { isRateVaultB1ExcelName };

function decodeBytes(input: RateVaultB1XlsxInput): Uint8Array | null {
  if (input.bytes) {
    return input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  }
  if (typeof input.data === "string" && input.data.trim()) {
    const compact = input.data.replace(/\s/g, "");
    try {
      return Uint8Array.from(Buffer.from(compact, "base64"));
    } catch {
      return null;
    }
  }
  return null;
}

function sheetByName(workbook: ExcelJS.Workbook, name: string) {
  const needle = name.trim().toLowerCase();
  return workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === needle) ?? null;
}

function parseOcipFace(raw?: string): RateVaultOcipFace | "both" {
  const value = (raw || "").trim().toLowerCase();
  if (value === "ocip" || value === "non-ocip" || value === "both") return value;
  return "both";
}

function packageMap(sheet: ExcelJS.Worksheet) {
  const out = new Map<string, string>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 40) return;
    const key = text(row.getCell(1).value).toLowerCase();
    const value = text(row.getCell(2).value);
    if (key) out.set(key, value);
  });
  return out;
}

function headerIndex(sheet: ExcelJS.Worksheet, expected: readonly string[]) {
  const row = sheet.getRow(1);
  const map = new Map<string, number>();
  row.eachCell((cell, col) => {
    const header = text(cell.value).toLowerCase();
    if (header) map.set(header, col);
  });
  const cols: Record<string, number> = {};
  for (const header of expected) {
    const col = map.get(header.toLowerCase());
    if (col) cols[header] = col;
  }
  return cols;
}

function scanWorkbookHay(workbook: ExcelJS.Workbook, fileName: string) {
  const parts = [fileName];
  for (const sheet of workbook.worksheets) {
    parts.push(sheet.name);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 30) return;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > 12) return;
        const value = text(cell.value);
        if (value) parts.push(value);
      });
    });
  }
  return parts.join(" · ");
}

function nextImportId(position: string, index: number) {
  const slug = position
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `rv-import-${slug || "row"}-${index + 1}`;
}

function applyMoneyStyle(cell: ExcelJS.Cell) {
  cell.numFmt = MONEY_FMT;
}

function applyHeader(row: ExcelJS.Row, headers: readonly string[]) {
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
  });
}

export async function rateVaultPreviewToXlsx(
  preview: RateVaultPreviewPackage,
  options: { ocipFace?: RateVaultOcipFace } = {},
): Promise<{
  fileName: string;
  bytes: Uint8Array;
}> {
  const face = options.ocipFace;
  const exported = face ? filterPreviewByFace(preview, face) : preview;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hit Squad Rate Vault";
  workbook.created = new Date();

  const pack = workbook.addWorksheet(RATE_VAULT_B1_PACKAGE_SHEET);
  pack.getCell("A1").value = RATE_VAULT_B1_MARKER;
  pack.getCell("A1").font = { bold: true };
  const meta: Array<[string, string | boolean]> = [
    ["kind", RATE_VAULT_B1_KIND],
    ["siteId", exported.siteId],
    ["title", exported.title],
    ["revision", exported.revision || ""],
    ["packageId", exported.id],
    ["writesRateBook", false],
    ["extractedFrom", exported.extractedFrom],
    ["fixture", exported.fixture],
    ["effective", exported.effective || ""],
    ["sourceId", exported.sourceId || ""],
    ["sourceTitle", exported.sourceTitle],
    ["note", exported.note],
    ["ocipFace", face || exported.ocipFace || "both"],
    ["requiredSheets", RATE_VAULT_B1_REQUIRED_SHEETS.join("|")],
  ];
  meta.forEach(([key, value], index) => {
    const row = index + 2;
    pack.getCell(`A${row}`).value = key;
    pack.getCell(`B${row}`).value = typeof value === "boolean" ? String(value) : value;
  });
  pack.getCell("A18").value =
    "This workbook is the formula check to the site. Edit Rate Summary / Burden Summary offline, then drop the file back on Rate Vault. Preview updates from this book — not a parallel copy. CBA / PLA, State law, and COMP Check are read-only. Live Rate Tables stay off until Publish is wired.";
  pack.getColumn(1).width = 18;
  pack.getColumn(2).width = 72;

  const rates = workbook.addWorksheet(RATE_VAULT_B1_RATE_SHEET);
  applyHeader(rates.getRow(1), RATE_VAULT_B1_RATE_HEADERS);
  exported.rows.forEach((row, index) => {
    const r = index + 2;
    rates.getCell(`A${r}`).value = row.position;
    rates.getCell(`B${r}`).value = row.craft;
    rates.getCell(`C${r}`).value = row.local || "";
    rates.getCell(`D${r}`).value = row.group;
    rates.getCell(`E${r}`).value = row.sheet;
    rates.getCell(`F${r}`).value = row.wage;
    rates.getCell(`G${r}`).value = row.fringe;
    rates.getCell(`H${r}`).value = row.burden;
    rates.getCell(`I${r}`).value = { formula: `F${r}+G${r}+H${r}`, result: row.billRate };
    if (row.billOt != null) rates.getCell(`J${r}`).value = row.billOt;
    if (row.billDt != null) rates.getCell(`K${r}`).value = row.billDt;
    rates.getCell(`L${r}`).value = row.lane;
    rates.getCell(`M${r}`).value = row.ocip ? "OCIP" : "non-OCIP";
    rates.getCell(`N${r}`).value = row.clockNote;
    rates.getCell(`O${r}`).value = row.id;
    for (const col of ["F", "G", "H", "I", "J", "K"] as const) applyMoneyStyle(rates.getCell(`${col}${r}`));
  });
  for (let i = 0; i < RATE_VAULT_B1_SPARE_POSITIONS; i += 1) {
    const r = exported.rows.length + 2 + i;
    rates.getCell(`O${r}`).value = `xlsx-spare-${i + 1}`;
  }
  rates.getColumn(15).hidden = true;
  [22, 16, 10, 16, 18, 12, 12, 12, 12, 12, 12, 10, 10, 22, 18].forEach((width, index) => {
    rates.getColumn(index + 1).width = width;
  });

  const burden = workbook.addWorksheet(RATE_VAULT_B1_BURDEN_SHEET);
  applyHeader(burden.getRow(1), RATE_VAULT_B1_BURDEN_HEADERS);
  exported.burden.forEach((line, index) => {
    const r = index + 2;
    burden.getCell(`A${r}`).value = line.label;
    burden.getCell(`B${r}`).value = line.ratePct;
    burden.getCell(`B${r}`).numFmt = PCT_FMT;
    burden.getCell(`C${r}`).value = line.note;
    burden.getCell(`D${r}`).value = line.id;
  });
  const totalRow = exported.burden.length + 2;
  const lastData = Math.max(exported.burden.length + 1, 2);
  burden.getCell(`A${totalRow}`).value = "Total";
  burden.getCell(`A${totalRow}`).font = { bold: true };
  burden.getCell(`B${totalRow}`).value = {
    formula: `SUM(B2:B${lastData})`,
    result: money(exported.burden.reduce((sum, line) => sum + line.ratePct, 0)),
  };
  burden.getCell(`B${totalRow}`).numFmt = PCT_FMT;
  burden.getColumn(4).hidden = true;
  [28, 12, 48, 18].forEach((width, index) => {
    burden.getColumn(index + 1).width = width;
  });

  addCompCheckSheet(workbook, exported);
  addReadOnlyRulesSheet(workbook, RATE_VAULT_B1_CBA_SHEET, RATE_VAULT_CBA_PLA_SECTION.title, [
    RATE_VAULT_CBA_PLA_SECTION.note,
    ...RATE_VAULT_CBA_PLA_RULES.map((rule) => `${rule.label} — captured on the vault later; this tab is read-only.`),
  ]);
  addReadOnlyRulesSheet(workbook, RATE_VAULT_B1_STATE_SHEET, RATE_VAULT_STATE_LAW_SECTION.title, [
    RATE_VAULT_STATE_LAW_SECTION.note,
    ...RATE_VAULT_STATE_LAW_SITES.map((row) => `${row.site} — ${row.state}`),
    ...RATE_VAULT_STATE_LAW_RULES.map((rule) => `${rule.label} — captured on the vault later; this tab is read-only.`),
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return { fileName: rateVaultB1FileName(exported), bytes: new Uint8Array(buffer) };
}

function addCompCheckSheet(workbook: ExcelJS.Workbook, preview: RateVaultPreviewPackage) {
  const check = rateVaultCompCheck(preview);
  const lastRate = Math.max(preview.rows.length + 1, 2);
  const sheet = workbook.addWorksheet(RATE_VAULT_B1_COMP_SHEET);
  sheet.getCell("A1").value = "COMP check — key totals from this Rate Vault B-1 (not the giant COMP xlsm)";
  sheet.getCell("A1").font = { bold: true };
  const lines: Array<[string, ExcelJS.CellValue]> = [
    ["Positions", { formula: `COUNTA('${RATE_VAULT_B1_RATE_SHEET}'!A2:A${lastRate})`, result: check.positions }],
    ["Wage total", { formula: `SUM('${RATE_VAULT_B1_RATE_SHEET}'!F2:F${lastRate})`, result: check.wageTotal }],
    ["Fringe total", { formula: `SUM('${RATE_VAULT_B1_RATE_SHEET}'!G2:G${lastRate})`, result: check.fringeTotal }],
    ["Burden $ total", { formula: `SUM('${RATE_VAULT_B1_RATE_SHEET}'!H2:H${lastRate})`, result: check.burdenTotal }],
    ["Bill ST total", { formula: `SUM('${RATE_VAULT_B1_RATE_SHEET}'!I2:I${lastRate})`, result: check.billTotal }],
    ["Burden stack %", { formula: `'${RATE_VAULT_B1_BURDEN_SHEET}'!B${preview.burden.length + 2}`, result: check.burdenPct }],
  ];
  lines.forEach(([label, value], index) => {
    const row = index + 3;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`B${row}`).value = value;
  });
  sheet.getCell("A10").value = "Site reconcile: these formulas pull Rate Summary / Burden Summary. Typed-over guts fail import.";
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 22;
  void sheet.protect("", { selectLockedCells: true, selectUnlockedCells: true });
}

function addReadOnlyRulesSheet(workbook: ExcelJS.Workbook, name: string, title: string, lines: string[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true };
  sheet.getCell("A2").value = "Read-only rule summary. Edit wages / fringes / burden on Rate Summary only.";
  lines.forEach((line, index) => {
    sheet.getCell(`A${index + 4}`).value = line;
  });
  sheet.getColumn(1).width = 88;
  void sheet.protect("", { selectLockedCells: true, selectUnlockedCells: true });
}

function billFormulaText(cell: ExcelJS.Cell) {
  if (cell.formula) return String(cell.formula).replace(/^=/, "").trim();
  const raw = cell.value;
  if (raw && typeof raw === "object" && "formula" in raw && (raw as { formula?: unknown }).formula) {
    return String((raw as { formula: string }).formula).replace(/^=/, "").trim();
  }
  return "";
}

function billRateForRow(cell: ExcelJS.Cell, wage: number, fringe: number, burden: number): { ok: true; value: number } | { poison: true } {
  if (cellHasFormula(cell)) {
    const formula = billFormulaText(cell);
    if (!BILL_ST_FORMULA.test(formula)) return { poison: true };
    return { ok: true, value: money(wage + fringe + burden) };
  }
  const typed = readNumber(cell);
  if ("ok" in typed) return { ok: true, value: typed.value };
  if ("empty" in typed) return { ok: true, value: money(wage + fringe + burden) };
  return { poison: true };
}

function optionalMoney(cell: ExcelJS.Cell): { ok: true; value: number | null } | { poison: true } {
  const read = readNumber(cell);
  if ("empty" in read) return { ok: true, value: null };
  if ("poison" in read) return { poison: true };
  if (read.value < 0) return { poison: true };
  return { ok: true, value: read.value };
}

function requiredMoney(cell: ExcelJS.Cell): { ok: true; value: number } | { poison: true } {
  const read = readNumber(cell);
  if ("empty" in read) return { ok: true, value: 0 };
  if ("poison" in read) return { poison: true };
  if (read.value < 0) return { poison: true };
  return { ok: true, value: read.value };
}

export async function parseRateVaultB1Xlsx(input: RateVaultB1XlsxInput): Promise<RateVaultB1ImportResult> {
  const fileName = input.fileName || "";
  const bytes = decodeBytes(input);
  if (!bytes?.byteLength) return fail("not-vault-b1", RATE_VAULT_B1_IMPORT_ERROR);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return fail("not-vault-b1", RATE_VAULT_B1_IMPORT_ERROR);
  }

  const packSheet = sheetByName(workbook, RATE_VAULT_B1_PACKAGE_SHEET);
  const marker = packSheet ? text(packSheet.getCell("A1").value) : "";
  if (!packSheet || marker !== RATE_VAULT_B1_MARKER) {
    return fail("not-vault-b1", RATE_VAULT_B1_IMPORT_ERROR);
  }

  const hay = scanWorkbookHay(workbook, fileName);
  if (looksLikeForeignRateVaultSite(hay)) {
    return fail("poison", "Monroe / Yates books stay out of Rate Vault. The package was not applied.");
  }

  const meta = packageMap(packSheet);
  const kind = meta.get("kind") || "";
  if (kind && kind !== RATE_VAULT_B1_KIND) {
    return fail("poison", RATE_VAULT_B1_POISON_ERROR);
  }
  const siteRaw = meta.get("siteid") || "";
  if (siteRaw && looksLikeForeignRateVaultSite(siteRaw)) {
    return fail("poison", "That site is not in this vault. The package was not applied.");
  }
  if (siteRaw && !isRateVaultSiteId(siteRaw)) {
    return fail("poison", "That site is not in this vault. The package was not applied.");
  }
  const siteId = (isRateVaultSiteId(siteRaw) ? siteRaw : "wood-river") as RateVaultSiteId;
  const required = (meta.get("requiredsheets") || "")
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of required) {
    if (!sheetByName(workbook, name)) {
      return fail("invalid", `Sheet "${name}" was renamed or removed. The package was not applied.`);
    }
  }

  const rateSheet = sheetByName(workbook, RATE_VAULT_B1_RATE_SHEET);
  if (!rateSheet) return fail("invalid", "Rate Summary is missing. The package was not applied.");
  const rateCols = headerIndex(rateSheet, RATE_VAULT_B1_RATE_HEADERS);
  if (!rateCols.Position || !rateCols.Wage || !rateCols.Fringe || !rateCols.Burden || !rateCols["Bill ST"]) {
    return fail("invalid", "Rate Summary headers do not match a Rate Vault B-1 export. The package was not applied.");
  }

  const rows: RateVaultPreviewRow[] = [];
  let poison: RateVaultB1ImportFail | null = null;
  const lastRate = rateSheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRate; rowNumber += 1) {
    const row = rateSheet.getRow(rowNumber);
    const position = text(row.getCell(rateCols.Position).value);
    const wageCell = row.getCell(rateCols.Wage);
    const fringeCell = row.getCell(rateCols.Fringe);
    const burdenCell = row.getCell(rateCols.Burden);
    const wageRead = readNumber(wageCell);
    const fringeRead = readNumber(fringeCell);
    const burdenRead = readNumber(burdenCell);
    const emptyRow =
      !position &&
      "empty" in wageRead &&
      "empty" in fringeRead &&
      "empty" in burdenRead;
    if (emptyRow) continue;
    if (!position) {
      poison = fail("invalid", "A rate row is missing a position. The package was not applied.");
      break;
    }
    const wage = requiredMoney(wageCell);
    const fringe = requiredMoney(fringeCell);
    const burdenAmt = requiredMoney(burdenCell);
    if ("poison" in wage || "poison" in fringe || "poison" in burdenAmt) {
      poison = fail("invalid", "A rate cell is not a valid number. The package was not applied.");
      break;
    }
    const billOt = optionalMoney(row.getCell(rateCols["Bill OT"] || 10));
    const billDt = optionalMoney(row.getCell(rateCols["Bill DT"] || 11));
    if ("poison" in billOt || "poison" in billDt) {
      poison = fail("invalid", "A bill rate cell is not a valid number. The package was not applied.");
      break;
    }
    const bill = billRateForRow(row.getCell(rateCols["Bill ST"]), wage.value, fringe.value, burdenAmt.value);
    if ("poison" in bill) {
      poison = fail("invalid", "Bill ST formula guts are broken. The package was not applied.");
      break;
    }
    const hiddenId = text(row.getCell(rateCols._id || 15).value);
    const id = hiddenId && !isRateVaultB1SpareId(hiddenId) ? hiddenId : nextImportId(position, rows.length);
    const sheet = text(row.getCell(rateCols.Sheet || 5).value) || RATE_VAULT_B1_RATE_SHEET;
    const group = text(row.getCell(rateCols.Group || 4).value) || "Rate Summary";
    const craft = text(row.getCell(rateCols.Craft || 2).value) || "Craft";
    const laneRaw = text(row.getCell(rateCols.Lane || 12).value).toLowerCase();
    const lane: RateVaultLane = laneRaw === "merit" || laneRaw === "union" ? laneRaw : inferRateVaultLane({ craft, group, sheet });
    const ocipRaw = text(row.getCell(rateCols.OCIP || 13).value);
    const ocip = ocipRaw ? /ocip/i.test(ocipRaw) && !/non-ocip/i.test(ocipRaw) : inferRateVaultOcip({ group, sheet });
    rows.push({
      id,
      sheet,
      group,
      craft,
      local: text(row.getCell(rateCols.Local || 3).value) || null,
      position,
      wage: wage.value,
      fringe: fringe.value,
      burden: burdenAmt.value,
      billRate: bill.value,
      billOt: billOt.value,
      billDt: billDt.value,
      lane,
      ocip,
      clockNote: text(row.getCell(rateCols["OT / clock"] || 14).value) || defaultRateVaultClockNote(lane),
    });
  }
  if (poison) return poison;
  if (!rows.length) return fail("empty", "That workbook has no rate positions. The package was not applied.");

  const burdenLines: RateVaultBurdenLine[] = [];
  const burdenSheet = sheetByName(workbook, RATE_VAULT_B1_BURDEN_SHEET);
  if (burdenSheet) {
    const burdenCols = headerIndex(burdenSheet, RATE_VAULT_B1_BURDEN_HEADERS);
    const lastBurden = burdenSheet.rowCount;
    for (let rowNumber = 2; rowNumber <= lastBurden; rowNumber += 1) {
      const row = burdenSheet.getRow(rowNumber);
      const label = text(row.getCell(burdenCols.Item || 1).value);
      if (!label || /^total$/i.test(label)) continue;
      const pct = requiredMoney(row.getCell(burdenCols["Rate %"] || 2));
      if ("poison" in pct) {
        return fail("invalid", "A burden rate is not a valid number. The package was not applied.");
      }
      const hiddenId = text(row.getCell(burdenCols._id || 4).value);
      burdenLines.push({
        id: hiddenId || `burden-${burdenLines.length + 1}`,
        label,
        ratePct: pct.value,
        note: text(row.getCell(burdenCols.Note || 3).value),
      });
    }
  }

  const title = meta.get("title") || `${rateVaultSiteLabel(siteId)} B-1`;
  const parsed = parseRateVaultPreviewPackage({
    id: meta.get("packageid") || `${siteId}-b1-preview`,
    title,
    siteId,
    sourceId: meta.get("sourceid") || null,
    sourceTitle: meta.get("sourcetitle") || title,
    effective: meta.get("effective") || null,
    revision: meta.get("revision") || null,
    extractedFrom: "vault-xlsx-import",
    note:
      "Imported from a Rate Vault B-1 Excel export. This book is the vault package — not a parallel copy. Live Rate Tables stay off.",
    writesRateBook: false,
    fixture: false,
    ocipFace: parseOcipFace(meta.get("ocipface")),
    sheets: [
      { name: RATE_VAULT_B1_RATE_SHEET, kind: "rate-summary" },
      { name: RATE_VAULT_B1_BURDEN_SHEET, kind: "burden-summary" },
      { name: RATE_VAULT_B1_COMP_SHEET, kind: "other" },
      { name: RATE_VAULT_B1_CBA_SHEET, kind: "other" },
      { name: RATE_VAULT_B1_STATE_SHEET, kind: "other" },
    ],
    burden: burdenLines,
    rows,
  });
  if ("error" in parsed) return fail("invalid", parsed.error);
  return {
    ok: true,
    preview: {
      ...parsed,
      fixture: false,
      extractedFrom: "vault-xlsx-import",
      writesRateBook: false,
    },
  };
}
