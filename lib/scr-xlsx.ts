/**
 * Client-submittable Scope Change Request Excel.
 * Same family as Estimate export: company / PROJECT CONTROLS brand, Prepared by,
 * status, confidential line, faded logo splash via buildWorkbook. Money comes
 * from the live FCR/SCR packet — this file does not invent rates or dollars.
 */
import {
  addLogRow,
  emptyFcrPacket,
  fcrSummary,
  logRowScope,
  parseFcrPacket,
  scrAttachmentNames,
  SCR_TYPE_LABELS,
  seedScopeIdLabel,
  scrSign,
  scrWhyText,
  type FcrLogRow,
  type FcrPacket,
  type FcrScr,
} from "./change-order-packet.ts";
import { PHASE_NAMES } from "./phase-schedule.ts";
import { scrShiftLabel } from "./scr-rates.ts";
import { clampEstimateStatus, parseEstimateStatus } from "./estimate-status.ts";
import { slugify } from "./estimate-pack.ts";
import {
  ESTIMATE_EXPORT_CONFIDENTIAL,
  ESTIMATE_PREPARED_BY_LABEL,
  ESTIMATE_STATUS_LABEL,
  estimateCompanyName,
  estimateExportBrand,
  estimateExportProducer,
  exporterDisplayName,
} from "./estimate-xlsx.ts";
import { yieldToUi } from "./ui-yield.ts";
import { evaluateWorkbook } from "./xlsx-eval.ts";
import { buildWorkbook, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

export const SCR_EXPORT_ERROR = "Could not export the SCR. Try again.";
export const SCR_DOCUMENT_TITLE = "SCOPE CHANGE REQUEST";
export const SCR_ESTIMATE_TITLE = "SCOPE CHANGE ESTIMATE";
export const SCR_TOTAL_LABEL = "SCR TOTAL $";
export const SCR_HOURS_LABEL = "Scope-change hours";
export const SCR_COST_LABEL = "Scope-change $";
export const SCR_EXPORT_CONFIDENTIAL = "Confidential scope change request";
export const SCR_ATTACHMENTS_LABEL = "Backup attachments";
export const SCR_ATTACHMENTS_NOTE = "files live in the desk pack";
export const SCR_HIT_SQUAD_NUMBER_LABEL = "Hit Squad SCR #";
export const SCR_CLIENT_ID_LABEL = "Client SCR ID";
export const SCR_TYPE_LABEL = "Type";
export const SCR_ISSUE_LABEL = "SCR issue";
export const SCR_WHY_LABEL = "Why this is an SCR";
export const SCR_PHASE_LABEL = "Phase";
export const SCR_SHIFT_LABEL = "Schedule impact";
export const SCR_CREDIT_NOTE = "Credit / deletion totals are signed.";

export const SCR_XLSX_SHEETS = {
  cover: "Cover",
  estimate: "SCR Estimate",
  log: "Change Orders log",
} as const;

export type ScrXlsxInput = {
  title?: string;
  client?: string;
  site?: string;
  packet?: FcrPacket | unknown;
  preparedBy?: string | null;
  status?: string | null;
  regularClient?: boolean;
  companyName?: string | null;
  companyLogo?: string | null;
  selectedId?: string;
};

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pushText(cells: SheetCell[], ref: string, value: string) {
  if (value) cells.push({ ref, type: "text", value });
}

function pushNum(cells: SheetCell[], ref: string, value: number, numFmt?: string) {
  cells.push(numFmt ? { ref, type: "number", value: money(value), numFmt } : { ref, type: "number", value: money(value) });
}

function pushFormula(cells: SheetCell[], ref: string, value: string, numFmt?: string) {
  cells.push(numFmt ? { ref, type: "formula", value, numFmt } : { ref, type: "formula", value });
}

function moneyFmt() {
  return "$#,##0.00;($#,##0.00)";
}

function hoursFmt() {
  return "#,##0.00";
}

function quoteSheet(name: string) {
  return /[^A-Za-z0-9]/.test(name) ? `'${name.replaceAll("'", "''")}'` : name;
}

function sheetRef(sheet: string, ref: string) {
  return `${quoteSheet(sheet)}!${ref}`;
}

function nCell(ref: string) {
  return `N(${ref})`;
}

function producedLabel(when = new Date()) {
  const stamp = when.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return `Produced ${stamp}`;
}

function companyOf(input: ScrXlsxInput) {
  return estimateCompanyName({
    companyName: input.companyName,
    client: input.client,
    site: input.site,
    title: input.title,
  });
}

function jobLine(input: ScrXlsxInput) {
  return [input.title || "Estimate", input.client, input.site].filter((part) => String(part || "").trim()).join("  ·  ");
}

function statusOf(input: ScrXlsxInput) {
  if (input.status == null || String(input.status).trim() === "") return "";
  return clampEstimateStatus(parseEstimateStatus(input.status), Boolean(input.regularClient));
}

function preparedOf(input: ScrXlsxInput) {
  return exporterDisplayName(input.preparedBy, null) || "";
}

function packetOf(input: ScrXlsxInput): FcrPacket {
  return parseFcrPacket(input.packet ?? emptyFcrPacket());
}

function headerByline(input: ScrXlsxInput, when = new Date()) {
  const status = statusOf(input);
  const prepared = preparedOf(input);
  const stamp = status ? `${ESTIMATE_STATUS_LABEL}: ${status}` : "";
  const who = prepared ? `${ESTIMATE_PREPARED_BY_LABEL}: ${prepared}` : "";
  return [stamp, who, estimateExportProducer(companyOf(input)), SCR_EXPORT_CONFIDENTIAL, producedLabel(when)]
    .filter(Boolean)
    .join("  ·  ");
}

function titleBlock(cells: SheetCell[], input: ScrXlsxInput, lastCol: string, when = new Date()) {
  pushText(cells, "A1", estimateExportBrand(companyOf(input)));
  pushText(cells, "A2", jobLine(input));
  pushText(cells, "A3", headerByline(input, when));
  return [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`] as string[];
}

function logLabel(row: FcrLogRow) {
  const scr = row.scr.trim() || "Untitled";
  const type = SCR_TYPE_LABELS[row.scrType] || row.scrType;
  const issue = row.scope.trim();
  return issue ? `${scr}  ·  ${type}  ·  ${issue}` : `${scr}  ·  ${type}`;
}

function scopeIdLabelOf(input: ScrXlsxInput, packet: FcrPacket) {
  return seedScopeIdLabel(input.client, input.site, packet.scopeIdLabel);
}

function phaseName(row: FcrLogRow) {
  if (!row.phaseId) return "—";
  const named = PHASE_NAMES[row.phaseId as keyof typeof PHASE_NAMES];
  return named || row.phaseId;
}

function scheduleLine(row: FcrLogRow) {
  if (!row.scheduleImpact) return "None — phase default";
  return scrShiftLabel(row.shiftId) || row.shiftId || "—";
}

export function scrXlsxFilename(input: Pick<ScrXlsxInput, "site" | "title" | "client" | "companyName"> = {}) {
  const company = slugify(companyOf(input));
  const site = slugify((input.site || "").split("—")[0] || "");
  const title = slugify(input.title || "");
  const base = [company, site, title, "scr"].filter(Boolean).join("-") || `${company || "estimate"}-scr`;
  return `${base}.xlsx`;
}

type BuiltSection = {
  titleRow: number;
  hoursRef: string;
  costRef: string;
  laborRef: string;
  claimsRef: string;
  totalRef: string;
};

type ScrEstimateSheet = WorkbookSheet & {
  sections: BuiltSection[];
  packetHoursRef: string;
  packetTotalRef: string;
};

function writeCraftTable(cells: SheetCell[], startRow: number, row: FcrLogRow) {
  const header = startRow;
  const sign = scrSign(row.scrType);
  pushText(cells, `A${header}`, "CRAFT");
  pushText(cells, `B${header}`, "HOURS");
  pushText(cells, `C${header}`, "$/HR");
  pushText(cells, `D${header}`, "LABOR $");
  const lines = row.craftLines.length ? row.craftLines : [];
  const first = header + 1;
  lines.forEach((line, index) => {
    const r = first + index;
    pushText(cells, `A${r}`, line.craft || "—");
    pushNum(cells, `B${r}`, line.hours, hoursFmt());
    pushNum(cells, `C${r}`, line.rate, moneyFmt());
    pushFormula(cells, `D${r}`, `${sign}*(${nCell(`B${r}`)}*${nCell(`C${r}`)})`, moneyFmt());
  });
  const last = lines.length ? first + lines.length - 1 : header;
  const laborRow = last + 1;
  pushText(cells, `A${laborRow}`, "Craft labor");
  if (lines.length) pushFormula(cells, `D${laborRow}`, `SUM(D${first}:D${last})`, moneyFmt());
  else pushNum(cells, `D${laborRow}`, 0, moneyFmt());
  return { header, first, last, laborRow };
}

function writeClaimTable(cells: SheetCell[], startRow: number, row: FcrLogRow) {
  const header = startRow;
  const sign = scrSign(row.scrType);
  pushText(cells, `A${header}`, "TYPE");
  pushText(cells, `B${header}`, "DESCRIPTION");
  pushText(cells, `C${header}`, "HOURS");
  pushText(cells, `D${header}`, "$");
  const lines = row.claimLines.length ? row.claimLines : [];
  const first = header + 1;
  lines.forEach((line, index) => {
    const r = first + index;
    pushText(cells, `A${r}`, line.type || "—");
    pushText(cells, `B${r}`, line.description || "—");
    pushNum(cells, `C${r}`, line.hours, hoursFmt());
    pushNum(cells, `D${r}`, sign * Math.max(0, Number(line.amount) || 0), moneyFmt());
  });
  const last = lines.length ? first + lines.length - 1 : header;
  const claimsRow = last + 1;
  pushText(cells, `A${claimsRow}`, "Claimable costs");
  if (lines.length) pushFormula(cells, `D${claimsRow}`, `SUM(D${first}:D${last})`, moneyFmt());
  else pushNum(cells, `D${claimsRow}`, 0, moneyFmt());
  return { header, first, last, claimsRow };
}

function writeAttachmentList(cells: SheetCell[], startRow: number, row: FcrLogRow) {
  pushText(cells, `A${startRow}`, `${SCR_ATTACHMENTS_LABEL} (${SCR_ATTACHMENTS_NOTE})`);
  const names = scrAttachmentNames(row);
  if (!names.length) {
    pushText(cells, `A${startRow + 1}`, "None");
    return { header: startRow, lastRow: startRow + 1 };
  }
  names.forEach((name, index) => {
    pushText(cells, `A${startRow + 1 + index}`, name);
  });
  return { header: startRow, lastRow: startRow + names.length };
}

function writeScrSection(cells: SheetCell[], startRow: number, row: FcrLogRow, scopeIdLabel: string): BuiltSection {
  const titleRow = startRow;
  const scope = logRowScope(row);
  pushText(cells, `A${titleRow}`, logLabel(row));
  pushText(cells, `A${titleRow + 1}`, `${SCR_HIT_SQUAD_NUMBER_LABEL} ${row.scr || "—"}  ·  ${SCR_CLIENT_ID_LABEL} ${row.clientScrId || "—"}  ·  ${row.status}`);
  pushText(cells, `A${titleRow + 2}`, `${SCR_TYPE_LABEL}: ${SCR_TYPE_LABELS[row.scrType] || row.scrType}  ·  ${scopeIdLabel} ${row.scopeId || "—"}`);
  pushText(cells, `A${titleRow + 3}`, `${SCR_PHASE_LABEL}: ${phaseName(row)}  ·  ${SCR_SHIFT_LABEL}: ${scheduleLine(row)}`);
  pushText(cells, `A${titleRow + 4}`, `${SCR_ISSUE_LABEL}: ${row.scope || "—"}`);
  pushText(cells, `A${titleRow + 5}`, `${SCR_WHY_LABEL}: ${scrWhyText(row) || "—"}`);
  if (row.scrType === "Credit") pushText(cells, `A${titleRow + 6}`, SCR_CREDIT_NOTE);
  const hoursRow = titleRow + 7;
  pushText(cells, `A${hoursRow}`, SCR_HOURS_LABEL);
  const hoursRef = `B${hoursRow}`;
  pushNum(cells, hoursRef, scope.hours, hoursFmt());
  pushText(cells, `C${hoursRow}`, SCR_COST_LABEL);
  const costRef = `D${hoursRow}`;

  pushText(cells, `A${titleRow + 9}`, "Craft labor — hours × locked schedule-aware composite $/hr. No ST / OT / DT columns.");
  const craft = writeCraftTable(cells, titleRow + 10, row);
  const claimHeader = craft.laborRow + 2;
  pushText(cells, `A${claimHeader - 1}`, "Claimable costs — Material, Subcontractor, Third-party rental, and other pass-throughs");
  const claims = writeClaimTable(cells, claimHeader, row);
  const attachments = writeAttachmentList(cells, claims.claimsRow + 2, row);
  const totalRow = attachments.lastRow + 2;
  pushText(cells, `A${totalRow}`, SCR_TOTAL_LABEL);
  const laborRef = `D${craft.laborRow}`;
  const claimsRef = `D${claims.claimsRow}`;
  const totalRef = `D${totalRow}`;
  if (scope.hasLines) {
    pushFormula(cells, totalRef, `${nCell(laborRef)}+${nCell(claimsRef)}`, moneyFmt());
    pushFormula(cells, costRef, totalRef, moneyFmt());
  } else {
    pushNum(cells, costRef, scope.cost, moneyFmt());
    pushFormula(cells, totalRef, nCell(costRef), moneyFmt());
  }
  return { titleRow, hoursRef, costRef, laborRef, claimsRef, totalRef };
}

function buildEstimateSheet(input: ScrXlsxInput, packet: FcrPacket, when = new Date()): ScrEstimateSheet {
  const cells: SheetCell[] = [];
  const merges = titleBlock(cells, input, "D", when);
  pushText(cells, "A5", SCR_ESTIMATE_TITLE);
  merges.push("A5:D5");
  const scopeIdLabel = scopeIdLabelOf(input, packet);
  const rows = packet.log.length ? packet.log : [addLogRow(emptyFcrPacket()).log[0]!];
  const headerRows = [5];
  const sections: BuiltSection[] = [];
  let cursor = 7;
  rows.forEach((row, index) => {
    if (index > 0) cursor += 2;
    const section = writeScrSection(cells, cursor, row, scopeIdLabel);
    sections.push(section);
    headerRows.push(section.titleRow, section.titleRow + 10);
    cursor = Number(/(\d+)$/.exec(section.totalRef)?.[1] || cursor) + 1;
  });
  const packetRow = cursor + 1;
  pushText(cells, `A${packetRow}`, SCR_TOTAL_LABEL);
  if (sections.length) {
    pushFormula(cells, `D${packetRow}`, sections.map((section) => nCell(section.totalRef)).join("+"), moneyFmt());
    pushFormula(cells, `B${packetRow}`, sections.map((section) => nCell(section.hoursRef)).join("+"), hoursFmt());
  } else {
    pushNum(cells, `D${packetRow}`, 0, moneyFmt());
    pushNum(cells, `B${packetRow}`, 0, hoursFmt());
  }
  return {
    name: SCR_XLSX_SHEETS.estimate,
    cells,
    merges,
    headerRows,
    chrome: "instrument",
    freeze: { ySplit: 3 },
    printTitlesRow: "1:3",
    sections,
    packetHoursRef: `B${packetRow}`,
    packetTotalRef: `D${packetRow}`,
  };
}

function buildCoverSheet(
  input: ScrXlsxInput,
  packet: FcrPacket,
  estimate: ScrEstimateSheet,
  when = new Date(),
): WorkbookSheet {
  const cells: SheetCell[] = [];
  const merges = titleBlock(cells, input, "E", when);
  pushText(cells, "A5", SCR_DOCUMENT_TITLE);
  merges.push("A5:E5");
  pushText(cells, "A6", "Client-submittable proof of scope-change hours, composite craft labor, and claimable costs.");
  merges.push("A6:E6");
  pushText(cells, "A8", "Field");
  pushText(cells, "B8", "Detail");
  pushText(cells, "D8", "SCR snapshot");
  pushText(cells, "E8", "Value");
  const prepared = preparedOf(input) || estimateExportProducer(companyOf(input));
  const fields: Array<[string, string]> = [
    ["Client", (input.client || "").trim() || "—"],
    ["Job", (input.title || "").trim() || "Estimate"],
    ["Site", (input.site || "").trim() || "—"],
    ["Estimate status", statusOf(input) || "—"],
    [ESTIMATE_PREPARED_BY_LABEL, prepared],
    ["TA / RM", packet.scr.taRm.trim() || "—"],
    ["MOC", packet.scr.moc.trim() || "—"],
    ["SAP", packet.scr.sap.trim() || "—"],
    ["Cost note", packet.scr.costNote.trim() || "—"],
    ["Schedule", packet.scr.scheduleNote.trim() || "—"],
    ["Sign-off", packet.scr.signOff.trim() || "—"],
  ];
  fields.forEach(([label, value], index) => {
    const row = 9 + index;
    pushText(cells, `A${row}`, label);
    pushText(cells, `B${row}`, value);
  });
  const snaps: Array<{ label: string; formula: string; fmt: string }> = [
    { label: "Change Orders", formula: String(packet.log.length), fmt: "#,##0" },
    { label: SCR_HOURS_LABEL, formula: sheetRef(SCR_XLSX_SHEETS.estimate, estimate.packetHoursRef), fmt: hoursFmt() },
    { label: "Craft labor $", formula: estimate.sections.map((section) => sheetRef(SCR_XLSX_SHEETS.estimate, section.laborRef)).join("+") || "0", fmt: moneyFmt() },
    { label: "Claimable costs $", formula: estimate.sections.map((section) => sheetRef(SCR_XLSX_SHEETS.estimate, section.claimsRef)).join("+") || "0", fmt: moneyFmt() },
    { label: SCR_TOTAL_LABEL, formula: sheetRef(SCR_XLSX_SHEETS.estimate, estimate.packetTotalRef), fmt: moneyFmt() },
  ];
  snaps.forEach((snap, index) => {
    const row = 9 + index;
    pushText(cells, `D${row}`, snap.label);
    if (/^[0-9]+$/.test(snap.formula)) pushNum(cells, `E${row}`, Number(snap.formula), snap.fmt);
    else pushFormula(cells, `E${row}`, snap.formula, snap.fmt);
  });
  const foot = 9 + Math.max(fields.length, snaps.length) + 2;
  pushText(
    cells,
    `A${foot}`,
    `${SCR_EXPORT_CONFIDENTIAL}. Same chrome as the estimate Excel package — ${estimateExportProducer(companyOf(input))}. ${ESTIMATE_EXPORT_CONFIDENTIAL}.`,
  );
  merges.push(`A${foot}:E${foot}`);
  return {
    name: SCR_XLSX_SHEETS.cover,
    cells,
    merges,
    headerRows: [8],
    chrome: "cover",
    freeze: { ySplit: 6 },
    printTitlesRow: "1:6",
    fitToHeight: 1,
  };
}

function buildLogSheet(input: ScrXlsxInput, packet: FcrPacket, estimate: ScrEstimateSheet, when = new Date()): WorkbookSheet {
  const cells: SheetCell[] = [];
  const merges = titleBlock(cells, input, "H", when);
  pushText(cells, "A5", "Change Orders log");
  merges.push("A5:H5");
  const header = 7;
  [
    "Hit Squad SCR #",
    "Client SCR ID",
    "Type",
    "Status",
    "Scope ID",
    "SCR issue",
    "Hours",
    "$",
  ].forEach((label, index) => {
    pushText(cells, `${String.fromCharCode(65 + index)}${header}`, label);
  });
  packet.log.forEach((row, index) => {
    const r = header + 1 + index;
    const section = estimate.sections[index];
    pushText(cells, `A${r}`, row.scr || "—");
    pushText(cells, `B${r}`, row.clientScrId || "—");
    pushText(cells, `C${r}`, SCR_TYPE_LABELS[row.scrType] || row.scrType);
    pushText(cells, `D${r}`, row.status);
    pushText(cells, `E${r}`, row.scopeId || "—");
    pushText(cells, `F${r}`, row.scope || "—");
    if (section) {
      pushFormula(cells, `G${r}`, sheetRef(SCR_XLSX_SHEETS.estimate, section.hoursRef), hoursFmt());
      pushFormula(cells, `H${r}`, sheetRef(SCR_XLSX_SHEETS.estimate, section.costRef), moneyFmt());
    } else {
      const scope = logRowScope(row);
      pushNum(cells, `G${r}`, scope.hours, hoursFmt());
      pushNum(cells, `H${r}`, scope.cost, moneyFmt());
    }
  });
  if (!packet.log.length) pushText(cells, `A${header + 1}`, "No Change Orders on this job yet.");
  return {
    name: SCR_XLSX_SHEETS.log,
    cells,
    merges,
    headerRows: [7],
    chrome: "instrument",
    freeze: { ySplit: 7 },
    printTitlesRow: "1:7",
  };
}

export function buildScrWorkbook(input: ScrXlsxInput = {}, when = new Date()): WorkbookSheet[] {
  const packet = packetOf(input);
  const estimate = buildEstimateSheet(input, packet, when);
  const cover = buildCoverSheet(input, packet, estimate, when);
  const log = buildLogSheet(input, packet, estimate, when);
  return [cover, { ...estimate, name: excelSafeSheetName(estimate.name) }, { ...log, name: excelSafeSheetName(log.name) }].map(
    (sheet) => ({ ...sheet, name: excelSafeSheetName(sheet.name) }),
  );
}

export function scrWorkbookTotal(sheets: WorkbookSheet[]) {
  const estimate = sheets.find((sheet) => sheet.name === SCR_XLSX_SHEETS.estimate);
  const labels =
    estimate?.cells.filter((cell) => cell.type === "text" && cell.value === SCR_TOTAL_LABEL && cell.ref.startsWith("A")) ?? [];
  const label = labels.at(-1);
  if (!estimate || !label) return 0;
  const row = label.ref.slice(1);
  return money(Number(evaluateWorkbook(sheets).evalAt(estimate.name, `D${row}`)) || 0);
}

export async function scrToXlsx(input: ScrXlsxInput = {}): Promise<Uint8Array> {
  await yieldToUi();
  const packet = packetOf(input);
  const sheets = buildScrWorkbook({ ...input, packet });
  if (!sheets.length) throw new Error("empty-workbook");
  const excel = scrWorkbookTotal(sheets);
  const desk = money(fcrSummary(packet).scrCost);
  if (excel !== desk) throw new Error("scr-total-mismatch");
  const company = companyOf(input);
  const bytes = await buildWorkbook(sheets, {
    companyLogo: input.companyLogo,
    companyName: company,
  });
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}

export type { FcrScr };
