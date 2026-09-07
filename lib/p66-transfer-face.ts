/**
 * P66-shaped transfer face for Rodeo export.
 *
 * Source of truth: Hit Squad live pack (Robert look-alike).
 * This face is filled FROM the pack so Robert can copy-paste into the
 * official Madison Turnaround Contractor Estimate Template.
 * It is not the locked official xlsx and does not clone that binary.
 *
 * Family B (P66 RODEO ESTIMATE WORKBOOK) stays a separate later face.
 */

import { deskPackageTotal, type DeskPackageInput } from "./estimate-desk-total.ts";
import { otherCostTotals } from "./other-cost.ts";
import { isRodeoSite, rodeoBucketTotals, rodeoLaborLines, type RodeoCrew } from "./rodeo-form.ts";
import { perDiemDollarsFromCrew } from "./shahan-wood-river.ts";
import { equipmentTotals, thirdPartyCost } from "./equipment-sheet.ts";
import type { ContractorGoldenBuckets } from "./wake-golden.ts";
import { bucketSum, materialsTotal, moneyEqual } from "./wake-golden.ts";
import { excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

export const P66_TRANSFER_SUMMARY = "P66 SUMMARY";
export const P66_TRANSFER_DIRECT = "P66 Direct";
export const P66_TRANSFER_INDIRECT = "P66 Indirect";
export const P66_TRANSFER_NOTE =
  "Hit Squad estimate fills this P66-shaped face. Copy-paste into the official contractor template. Not the locked official file.";

export type P66TransferTotals = ContractorGoldenBuckets & {
  unit: string;
  contractor: string;
  block: string;
};

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function p66TransferSheetNames() {
  return [P66_TRANSFER_SUMMARY, P66_TRANSFER_DIRECT, P66_TRANSFER_INDIRECT];
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

function cell(ref: string, value: string | number): SheetCell {
  return typeof value === "number" ? { ref, type: "number", value } : { ref, type: "text", value };
}

function buildSummarySheet(totals: P66TransferTotals): WorkbookSheet {
  const cells: SheetCell[] = [
    cell("A1", "HIT SQUAD / PROJECT CONTROLS"),
    cell("A2", P66_TRANSFER_NOTE),
    cell("A3", "UNIT"),
    cell("B3", totals.unit),
    cell("A4", "CONTRACTOR"),
    cell("B4", totals.contractor),
    cell("A5", "BLOCK / EVENT"),
    cell("B5", totals.block),
    cell("A7", "DESCRIPTION"),
    cell("B7", "CRAFT HOURS"),
    cell("C7", "CRAFT $"),
    cell("D7", "NON-CRAFT HOURS"),
    cell("E7", "NON-CRAFT $"),
    cell("F7", "PER DIEM"),
    cell("G7", "MOB / DEMOB"),
    cell("H7", "MATERIALS"),
    cell("I7", "EQUIPMENT"),
    cell("J7", "3RD PARTY"),
    cell("K7", "OTHER"),
    cell("L7", "TOTAL HRS"),
    cell("M7", "TOTAL $"),
    cell("A8", "DIRECT LABOR (DC.L)"),
    cell("B8", totals.directHours),
    cell("C8", totals.directDollars),
    cell("L8", totals.directHours),
    cell("M8", totals.directDollars),
    cell("A9", "INDIRECT LABOR (IC.L)"),
    cell("D9", totals.indirectHours),
    cell("E9", totals.indirectDollars),
    cell("L9", totals.indirectHours),
    cell("M9", totals.indirectDollars),
    cell("A10", "PER DIEM (IC.L)"),
    cell("F10", totals.perDiem),
    cell("M10", totals.perDiem),
    cell("A11", "MOB / DEMOB (IC.L)"),
    cell("G11", totals.mobDemob),
    cell("M11", totals.mobDemob),
    cell("A12", "MATERIALS"),
    cell("H12", money(totals.materialsDirect + totals.materialsIndirect)),
    cell("M12", money(totals.materialsDirect + totals.materialsIndirect)),
    cell("A13", "EQUIPMENT (RC.O)"),
    cell("I13", totals.equipment),
    cell("M13", totals.equipment),
    cell("A14", "THIRD PARTY (IC.O)"),
    cell("J14", totals.thirdParty),
    cell("M14", totals.thirdParty),
    cell("A15", "OTHER"),
    cell("K15", totals.other),
    cell("M15", totals.other),
    cell("A17", "TOTALS"),
    cell("B17", totals.directHours),
    cell("C17", totals.directDollars),
    cell("D17", totals.indirectHours),
    cell("E17", totals.indirectDollars),
    cell("F17", totals.perDiem),
    cell("G17", totals.mobDemob),
    cell("H17", money(totals.materialsDirect + totals.materialsIndirect)),
    cell("I17", totals.equipment),
    cell("J17", totals.thirdParty),
    cell("K17", totals.other),
    cell("L17", totals.totalHours),
    cell("M17", totals.grandTotal),
    cell("A19", "DIRECT RATE"),
    cell("B19", totals.directRate),
    cell("A20", "INDIRECT RATE"),
    cell("B20", totals.indirectRate),
    cell("A21", "ALL IN"),
    cell("B21", totals.allInRate),
  ];
  return { name: excelSafeSheetName(P66_TRANSFER_SUMMARY), cells };
}

function buildLaborSheet(name: string, totals: P66TransferTotals, bucket: "direct" | "indirect"): WorkbookSheet {
  const hours = bucket === "direct" ? totals.directHours : totals.indirectHours;
  const dollars = bucket === "direct" ? totals.directDollars : totals.indirectDollars;
  const rate = bucket === "direct" ? totals.directRate : totals.indirectRate;
  const cells: SheetCell[] = [
    cell("A1", bucket === "direct" ? "1. DIRECT LABOR (DC.L)" : "2. INDIRECT LABOR (IC.L)"),
    cell("A2", P66_TRANSFER_NOTE),
    cell("A3", "UNIT"),
    cell("B3", totals.unit),
    cell("A5", "CRAFT / RESOURCE"),
    cell("B5", "HOURS"),
    cell("C5", "COMPOSITE RATE"),
    cell("D5", "AMOUNT"),
    cell("A6", bucket === "direct" ? "Direct (time on tools)" : "Indirect (Foreman and above)"),
    cell("B6", hours),
    cell("C6", rate),
    cell("D6", dollars),
    cell("A8", "TOTALS"),
    cell("B8", hours),
    cell("C8", rate),
    cell("D8", dollars),
  ];
  return { name: excelSafeSheetName(name), cells };
}

export function buildP66TransferFaceSheets(totals: P66TransferTotals): WorkbookSheet[] {
  return [
    buildSummarySheet(totals),
    buildLaborSheet(P66_TRANSFER_DIRECT, totals, "direct"),
    buildLaborSheet(P66_TRANSFER_INDIRECT, totals, "indirect"),
  ];
}

export function readP66SummaryTotals(sheet: { cells: SheetCell[] }): Pick<P66TransferTotals, "totalHours" | "grandTotal" | "directHours" | "indirectHours"> {
  const map = new Map(sheet.cells.map((cell) => [cell.ref, cell]));
  const num = (ref: string) => {
    const cell = map.get(ref);
    return cell && cell.type === "number" ? cell.value : 0;
  };
  return {
    directHours: num("B8"),
    indirectHours: num("D9"),
    totalHours: num("L17"),
    grandTotal: num("M17"),
  };
}
