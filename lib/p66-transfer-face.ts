/**
 * Rodeo V1: estimate fills P66-shaped export → Robert pastes into official file.
 *
 * Source = Hit Squad live pack (look-alike).
 * Export includes a P66-shaped transfer face — Madison contractor hours ×
 * composite layout (SUMMARY + Direct/Indirect and money tabs 1–9) filled
 * from that pack. Values sit in official-shaped columns so they are easy
 * to copy into their official workbook.
 * Destination = their official P66 file (manual paste). Do not block
 * wake-up on cloning or protecting the locked official xlsx binary.
 * Auto-write into an official template copy is later, not this draft.
 *
 * Golden: Hit Squad totals ↔ this face ↔ Work Folder fixtures.
 */

import { deskPackageTotal, type DeskPackageInput } from "./estimate-desk-total.ts";
import { otherCostTotals } from "./other-cost.ts";
import { isRodeoSite, rodeoBucketTotals, rodeoLaborLines, type RodeoCrew } from "./rodeo-form.ts";
import { perDiemDollarsFromCrew } from "./shahan-wood-river.ts";
import { equipmentTotals, thirdPartyCost } from "./equipment-sheet.ts";
import type { ContractorGoldenBuckets } from "./wake-golden.ts";
import { bucketSum, materialsTotal, moneyEqual } from "./wake-golden.ts";
import { P66_V1_EXPORT_LINE } from "./p66-v1.ts";
import { excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

export { P66_V1_EXPORT_LINE, WAKE_DOES_NOT_CLONE_OFFICIAL_XLSX } from "./p66-v1.ts";

export const P66_TRANSFER_PASTE_MAP = "P66 Paste Map";
export const P66_TRANSFER_SUMMARY = "P66 SUMMARY";
export const P66_TRANSFER_DIRECT = "P66 1 Direct";
export const P66_TRANSFER_INDIRECT = "P66 2 Indirect";
export const P66_TRANSFER_PER_DIEM = "P66 3 Per Diem";
export const P66_TRANSFER_MOB = "P66 4 Mob Demob";
export const P66_TRANSFER_MATERIALS_DC = "P66 5 Materials DC";
export const P66_TRANSFER_MATERIALS_IC = "P66 6 Materials IC";
export const P66_TRANSFER_EQUIPMENT = "P66 7 Equipment";
export const P66_TRANSFER_THIRD = "P66 8 Third Party";
export const P66_TRANSFER_OTHER = "P66 9 Other";
export const P66_TRANSFER_NOTE =
  "Estimate fills this P66-shaped export. Copy these values into the official P66 file. Not the locked official workbook.";

/** Official Madison contractor SUMMARY columns (family A). */
export const P66_OFFICIAL_SUMMARY_COLUMNS = [
  { col: "A", header: "TAR UNIT NO." },
  { col: "B", header: "DESCRIPTION" },
  { col: "C", header: "CRAFT HOURS" },
  { col: "D", header: "CRAFT AMT" },
  { col: "E", header: "Non-CRAFT HOURS" },
  { col: "F", header: "Non-CRAFT AMT" },
  { col: "G", header: "3. TOTAL PER DIEM AMT" },
  { col: "H", header: "4. MOB / DEMOB AMT" },
  { col: "I", header: "5. TOTAL MATERIAL AMT" },
  { col: "J", header: "6. TOTAL EQUIPMENT AMT" },
  { col: "K", header: "7. TOTAL 3RD PARTY AMT" },
  { col: "L", header: "8. OTHER" },
  { col: "M", header: "TOTAL HRS" },
  { col: "N", header: "TOTAL $" },
] as const;

const FMT_HOURS = "#,##0";
const FMT_MONEY = "$#,##0.00";

export type P66TransferTotals = ContractorGoldenBuckets & {
  unit: string;
  contractor: string;
  block: string;
};

export type P66PasteMapRow = {
  officialTab: string;
  officialField: string;
  value: string | number;
};

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function p66TransferSheetNames() {
  return [
    P66_TRANSFER_PASTE_MAP,
    P66_TRANSFER_SUMMARY,
    P66_TRANSFER_DIRECT,
    P66_TRANSFER_INDIRECT,
    P66_TRANSFER_PER_DIEM,
    P66_TRANSFER_MOB,
    P66_TRANSFER_MATERIALS_DC,
    P66_TRANSFER_MATERIALS_IC,
    P66_TRANSFER_EQUIPMENT,
    P66_TRANSFER_THIRD,
    P66_TRANSFER_OTHER,
  ];
}

export function shouldAttachP66TransferFace(site = "", client = "") {
  return isRodeoSite(site, client);
}

export function p66TotalsFromBuckets(
  buckets: ContractorGoldenBuckets,
  meta: { unit?: string; contractor?: string; block?: string } = {},
): P66TransferTotals {
  return {
    ...buckets,
    unit: meta.unit || "",
    contractor: meta.contractor || "",
    block: meta.block || "",
  };
}

/** Map a live pack onto P66 buckets. Remainder lands in Other so face grand = desk rail. */
export function p66TotalsFromDesk(
  input: DeskPackageInput & { unit?: string; contractor?: string; block?: string },
): P66TransferTotals {
  const site = input.site ?? "";
  const client = input.client ?? "";
  const crew = (input.crew ?? {}) as RodeoCrew;
  const labor = rodeoBucketTotals(rodeoLaborLines(crew, site, client));
  const holidays = Array.isArray(input.jobMeta?.holidays) ? input.jobMeta.holidays ?? [] : [];
  const perDiem = perDiemDollarsFromCrew(
    crew,
    {
      staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
      craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
    },
    site,
    client,
    holidays,
  );
  const other = otherCostTotals(
    { perDiemRate: 0, travel: input.otherCost?.travel ?? [], misc: input.otherCost?.misc ?? [] },
    0,
  );
  const equipment = input.equipment ?? { largeTools: [], thirdParty: [] };
  const tools = equipmentTotals(equipment).largeTools;
  const third = (equipment.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const desk = deskPackageTotal(input);
  const mapped = money(
    labor.directDollars + labor.indirectDollars + perDiem + other.travel + other.misc + tools + third,
  );
  const remainder = money(desk - mapped);
  const totalHours = money(labor.directHours + labor.indirectHours);
  return {
    unit: input.unit || "",
    contractor: input.contractor || "",
    block: input.block || "",
    directHours: labor.directHours,
    directDollars: money(labor.directDollars),
    directRate: labor.directRate,
    indirectHours: labor.indirectHours,
    indirectDollars: money(labor.indirectDollars),
    indirectRate: labor.indirectRate,
    perDiem: money(perDiem),
    mobDemob: money(other.travel),
    materialsDirect: money(other.misc),
    materialsIndirect: 0,
    equipment: money(tools),
    thirdParty: money(third),
    other: remainder,
    totalHours,
    grandTotal: desk,
    allInRate: totalHours > 0 ? money(desk / totalHours) : 0,
  };
}

export function p66FaceMatchesDesk(face: P66TransferTotals, input: DeskPackageInput) {
  return moneyEqual(face.grandTotal, deskPackageTotal(input));
}

export function rodeoFacesLock(input: {
  face: P66TransferTotals;
  desk?: DeskPackageInput;
  golden?: ContractorGoldenBuckets;
}) {
  if (input.desk && !p66FaceMatchesDesk(input.face, input.desk)) return false;
  if (input.golden && !p66FaceMatchesGolden(input.face, input.golden)) return false;
  return Boolean(input.desk || input.golden);
}

export function p66FaceMatchesGolden(face: P66TransferTotals, buckets: ContractorGoldenBuckets) {
  return (
    moneyEqual(face.grandTotal, buckets.grandTotal) &&
    moneyEqual(face.totalHours, buckets.totalHours, 0.05) &&
    moneyEqual(face.directHours, buckets.directHours, 0.05) &&
    moneyEqual(face.indirectHours, buckets.indirectHours, 0.05) &&
    moneyEqual(face.directDollars, buckets.directDollars) &&
    moneyEqual(face.indirectDollars, buckets.indirectDollars) &&
    moneyEqual(face.perDiem, buckets.perDiem) &&
    moneyEqual(face.mobDemob, buckets.mobDemob) &&
    moneyEqual(face.materialsDirect + face.materialsIndirect, materialsTotal(buckets)) &&
    moneyEqual(face.equipment, buckets.equipment) &&
    moneyEqual(face.thirdParty, buckets.thirdParty) &&
    moneyEqual(bucketSum(buckets), buckets.grandTotal)
  );
}

function cell(ref: string, value: string | number, numFmt?: string): SheetCell {
  if (typeof value === "number") {
    return numFmt ? { ref, type: "number", value, numFmt } : { ref, type: "number", value };
  }
  return { ref, type: "text", value };
}

function hours(ref: string, value: number): SheetCell {
  return cell(ref, value, FMT_HOURS);
}

function dollars(ref: string, value: number): SheetCell {
  return cell(ref, value, FMT_MONEY);
}

/** Official-field → value rows Robert can copy one cell at a time. */
export function p66PasteMapRows(totals: P66TransferTotals): P66PasteMapRow[] {
  return [
    { officialTab: "SUMMARY", officialField: "UNIT", value: totals.unit },
    { officialTab: "SUMMARY", officialField: "CONTRACTOR", value: totals.contractor },
    { officialTab: "SUMMARY", officialField: "BLOCK / EVENT", value: totals.block },
    { officialTab: "SUMMARY", officialField: "DIRECT LABOR (DC.L) CRAFT HOURS", value: totals.directHours },
    { officialTab: "SUMMARY", officialField: "DIRECT LABOR (DC.L) CRAFT AMT", value: totals.directDollars },
    { officialTab: "SUMMARY", officialField: "INDIRECT LABOR (IC.L) Non-CRAFT HOURS", value: totals.indirectHours },
    { officialTab: "SUMMARY", officialField: "INDIRECT LABOR (IC.L) Non-CRAFT AMT", value: totals.indirectDollars },
    { officialTab: "SUMMARY", officialField: "PER DIEM (IC.L)", value: totals.perDiem },
    { officialTab: "SUMMARY", officialField: "MOB / DEMOB (IC.L)", value: totals.mobDemob },
    { officialTab: "SUMMARY", officialField: "MATERIALS (DC.M)", value: totals.materialsDirect },
    { officialTab: "SUMMARY", officialField: "MATERIALS (IC.M)", value: totals.materialsIndirect },
    { officialTab: "SUMMARY", officialField: "EQUIPMENT (RC.O)", value: totals.equipment },
    { officialTab: "SUMMARY", officialField: "THIRD PARTY (IC.O)", value: totals.thirdParty },
    { officialTab: "SUMMARY", officialField: "OTHER (SAFETY / TRAINING) (IC.O)", value: totals.other },
    { officialTab: "SUMMARY", officialField: "TOTALS TOTAL HRS", value: totals.totalHours },
    { officialTab: "SUMMARY", officialField: "TOTALS TOTAL $", value: totals.grandTotal },
    { officialTab: "SUMMARY", officialField: "DIRECT RATE", value: totals.directRate },
    { officialTab: "SUMMARY", officialField: "INDIRECT RATE", value: totals.indirectRate },
    { officialTab: "SUMMARY", officialField: "ALL IN", value: totals.allInRate },
    { officialTab: "1", officialField: "TOTALS CRAFT HOURS", value: totals.directHours },
    { officialTab: "1", officialField: "TOTALS DIRECT RATE / HR", value: totals.directRate },
    { officialTab: "1", officialField: "TOTALS CRAFT AMT", value: totals.directDollars },
    { officialTab: "2", officialField: "TOTALS Non-CRAFT HOURS", value: totals.indirectHours },
    { officialTab: "2", officialField: "TOTALS INDIRECT RATE / HR", value: totals.indirectRate },
    { officialTab: "2", officialField: "TOTALS Non-CRAFT AMT", value: totals.indirectDollars },
    { officialTab: "3", officialField: "TOTALS PER DIEM AMT", value: totals.perDiem },
    { officialTab: "4", officialField: "TOTALS MOB / DEMOB AMT", value: totals.mobDemob },
    { officialTab: "5", officialField: "TOTALS DIRECT MATERIALS AMT", value: totals.materialsDirect },
    { officialTab: "6", officialField: "TOTALS INDIRECT MATERIALS AMT", value: totals.materialsIndirect },
    { officialTab: "7", officialField: "TOTALS EQUIPMENT AMT", value: totals.equipment },
    { officialTab: "8", officialField: "TOTALS THIRD PARTY AMT", value: totals.thirdParty },
    { officialTab: "9", officialField: "TOTALS OTHER AMT", value: totals.other },
  ];
}

function buildPasteMapSheet(totals: P66TransferTotals): WorkbookSheet {
  const rows = p66PasteMapRows(totals);
  const cells: SheetCell[] = [
    cell("A1", "HIT SQUAD / PROJECT CONTROLS"),
    cell("A2", P66_V1_EXPORT_LINE),
    cell("A3", P66_TRANSFER_NOTE),
    cell("A4", "Wake-up does not clone or protect their locked official xlsx."),
    cell("A6", "OFFICIAL TAB"),
    cell("B6", "OFFICIAL FIELD"),
    cell("C6", "VALUE"),
    cell("D6", "COPY INTO"),
  ];
  rows.forEach((row, index) => {
    const excelRow = 7 + index;
    const moneyish = typeof row.value === "number" && /AMT|RATE|ALL IN|TOTAL \$|PER DIEM|MOB|MATERIALS|EQUIPMENT|THIRD|OTHER/i.test(row.officialField);
    const hoursish = typeof row.value === "number" && /HOURS|HRS/i.test(row.officialField);
    cells.push(cell(`A${excelRow}`, row.officialTab));
    cells.push(cell(`B${excelRow}`, row.officialField));
    if (typeof row.value === "number") {
      cells.push(hoursish ? hours(`C${excelRow}`, row.value) : moneyish ? dollars(`C${excelRow}`, row.value) : cell(`C${excelRow}`, row.value));
    } else {
      cells.push(cell(`C${excelRow}`, row.value));
    }
    cells.push(cell(`D${excelRow}`, `Official ${row.officialTab} · ${row.officialField}`));
  });
  return { name: excelSafeSheetName(P66_TRANSFER_PASTE_MAP), cells };
}

function buildSummarySheet(totals: P66TransferTotals): WorkbookSheet {
  const unit = totals.unit;
  const cells: SheetCell[] = [
    cell("A1", "HIT SQUAD / PROJECT CONTROLS"),
    cell("A2", P66_TRANSFER_NOTE),
    cell("A3", "UNIT"),
    cell("B3", totals.unit),
    cell("A4", "CONTRACTOR"),
    cell("B4", totals.contractor),
    cell("A5", "BLOCK / EVENT"),
    cell("B5", totals.block),
    ...P66_OFFICIAL_SUMMARY_COLUMNS.map((col) => cell(`${col.col}7`, col.header)),
    cell("P7", "DIRECT RATE"),
    cell("Q7", "INDIRECT RATE"),
    cell("R7", "ALL IN"),
    cell("A8", unit),
    cell("B8", "DIRECT LABOR (DC.L)"),
    hours("C8", totals.directHours),
    dollars("D8", totals.directDollars),
    hours("M8", totals.directHours),
    dollars("N8", totals.directDollars),
    dollars("P8", totals.directRate),
    cell("A9", unit),
    cell("B9", "INDIRECT LABOR (IC.L)"),
    hours("E9", totals.indirectHours),
    dollars("F9", totals.indirectDollars),
    hours("M9", totals.indirectHours),
    dollars("N9", totals.indirectDollars),
    dollars("Q9", totals.indirectRate),
    cell("A10", unit),
    cell("B10", "PER DIEM (IC.L)"),
    dollars("G10", totals.perDiem),
    dollars("N10", totals.perDiem),
    cell("A11", unit),
    cell("B11", "MOB / DEMOB (IC.L)"),
    dollars("H11", totals.mobDemob),
    dollars("N11", totals.mobDemob),
    cell("A12", unit),
    cell("B12", "MATERIALS (DC.M)"),
    dollars("I12", totals.materialsDirect),
    dollars("N12", totals.materialsDirect),
    cell("A13", unit),
    cell("B13", "MATERIALS (IC.M)"),
    dollars("I13", totals.materialsIndirect),
    dollars("N13", totals.materialsIndirect),
    cell("A14", unit),
    cell("B14", "EQUIPMENT (RC.O)"),
    dollars("J14", totals.equipment),
    dollars("N14", totals.equipment),
    cell("A15", unit),
    cell("B15", "THIRD PARTY (IC.O)"),
    dollars("K15", totals.thirdParty),
    dollars("N15", totals.thirdParty),
    cell("A16", unit),
    cell("B16", "OTHER (SAFETY / TRAINING) (IC.O)"),
    dollars("L16", totals.other),
    dollars("N16", totals.other),
    cell("B18", "TOTALS:"),
    hours("C18", totals.directHours),
    dollars("D18", totals.directDollars),
    hours("E18", totals.indirectHours),
    dollars("F18", totals.indirectDollars),
    dollars("G18", totals.perDiem),
    dollars("H18", totals.mobDemob),
    dollars("I18", money(totals.materialsDirect + totals.materialsIndirect)),
    dollars("J18", totals.equipment),
    dollars("K18", totals.thirdParty),
    dollars("L18", totals.other),
    hours("M18", totals.totalHours),
    dollars("N18", totals.grandTotal),
    dollars("P18", totals.directRate),
    dollars("Q18", totals.indirectRate),
    dollars("R18", totals.allInRate),
  ];
  return { name: excelSafeSheetName(P66_TRANSFER_SUMMARY), cells };
}

function moneySheet(name: string, title: string, amount: number, unit: string): WorkbookSheet {
  return {
    name: excelSafeSheetName(name),
    cells: [
      cell("A1", title),
      cell("A2", P66_TRANSFER_NOTE),
      cell("A3", "UNIT"),
      cell("B3", unit),
      cell("A5", "TAR UNIT NO."),
      cell("B5", "DESCRIPTION"),
      cell("C5", "AMOUNT"),
      cell("A6", unit),
      cell("B6", title),
      dollars("C6", amount),
      cell("B8", "TOTALS:"),
      dollars("C8", amount),
    ],
  };
}

function buildLaborSheet(name: string, totals: P66TransferTotals, bucket: "direct" | "indirect"): WorkbookSheet {
  const hoursValue = bucket === "direct" ? totals.directHours : totals.indirectHours;
  const dollarsValue = bucket === "direct" ? totals.directDollars : totals.indirectDollars;
  const rate = bucket === "direct" ? totals.directRate : totals.indirectRate;
  const cells: SheetCell[] = [
    cell("A1", bucket === "direct" ? "1. DIRECT LABOR (DC.L)" : "2. INDIRECT LABOR (IC.L)"),
    cell("A2", P66_TRANSFER_NOTE),
    cell("A3", "UNIT"),
    cell("B3", totals.unit),
    cell("A5", "TAR UNIT NO."),
    cell("B5", bucket === "direct" ? "CRAFT / RESOURCE" : "CRAFT DESCRIPTION"),
    cell("C5", bucket === "direct" ? "CRAFT HOURS" : "Non-CRAFT HOURS"),
    cell("D5", bucket === "direct" ? "DIRECT RATE / HR" : "INDIRECT RATE / HR"),
    cell("E5", bucket === "direct" ? "CRAFT AMT" : "Non-CRAFT AMT"),
    cell("A6", totals.unit),
    cell("B6", bucket === "direct" ? "Direct (time on tools)" : "Indirect (Foreman and above)"),
    hours("C6", hoursValue),
    dollars("D6", rate),
    dollars("E6", dollarsValue),
    cell("B8", "TOTALS:"),
    hours("C8", hoursValue),
    dollars("D8", rate),
    dollars("E8", dollarsValue),
  ];
  return { name: excelSafeSheetName(name), cells };
}

export function buildP66TransferFaceSheets(totals: P66TransferTotals): WorkbookSheet[] {
  return [
    buildPasteMapSheet(totals),
    buildSummarySheet(totals),
    buildLaborSheet(P66_TRANSFER_DIRECT, totals, "direct"),
    buildLaborSheet(P66_TRANSFER_INDIRECT, totals, "indirect"),
    moneySheet(P66_TRANSFER_PER_DIEM, "3. PER DIEM (IC.L)", totals.perDiem, totals.unit),
    moneySheet(P66_TRANSFER_MOB, "4. MOB / DEMOB (IC.L)", totals.mobDemob, totals.unit),
    moneySheet(P66_TRANSFER_MATERIALS_DC, "5. DIRECT MATERIALS (DC.M)", totals.materialsDirect, totals.unit),
    moneySheet(P66_TRANSFER_MATERIALS_IC, "6. INDIRECT MATERIALS (IC.M)", totals.materialsIndirect, totals.unit),
    moneySheet(P66_TRANSFER_EQUIPMENT, "7. EQUIPMENT (RC.O)", totals.equipment, totals.unit),
    moneySheet(P66_TRANSFER_THIRD, "8. THIRD PARTY (IC.O)", totals.thirdParty, totals.unit),
    moneySheet(P66_TRANSFER_OTHER, "9. OTHER (SAFETY / TRAINING) (IC.O)", totals.other, totals.unit),
  ];
}

export function readP66SummaryTotals(sheet: { cells: SheetCell[] }): Pick<
  P66TransferTotals,
  "totalHours" | "grandTotal" | "directHours" | "indirectHours" | "materialsDirect" | "materialsIndirect"
> {
  const map = new Map(sheet.cells.map((item) => [item.ref, item]));
  const num = (ref: string) => {
    const found = map.get(ref);
    return found && found.type === "number" ? found.value : 0;
  };
  return {
    directHours: num("C8"),
    indirectHours: num("E9"),
    materialsDirect: num("I12"),
    materialsIndirect: num("I13"),
    totalHours: num("M18"),
    grandTotal: num("N18"),
  };
}

export function readP66PasteMapValue(sheet: { cells: SheetCell[] }, officialField: string): string | number | undefined {
  const byRef = new Map(sheet.cells.map((item) => [item.ref, item]));
  for (const item of sheet.cells) {
    if (item.type !== "text" || item.value !== officialField) continue;
    const row = item.ref.replace(/^[A-Z]+/, "");
    const value = byRef.get(`C${row}`);
    if (!value) return undefined;
    return value.value;
  }
  return undefined;
}
