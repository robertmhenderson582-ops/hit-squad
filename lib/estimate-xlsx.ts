/**
 * Desk estimate → Excel workbook.
 * Sheet names follow the live CAT 2 / Wood River TM book shape.
 * Content, clocks, and rates follow THIS estimate's site — not a Nathan-only
 * or Wood River-only exporter. Never commit source workbooks to git.
 */

import type { CraftRow } from "./craft-labor.ts";
import {
  billedPeriodCount,
  largeToolAmount,
  THIRD_PARTY_MARKUP,
  thirdPartyCost,
  type EquipmentSheet,
  type LargeToolLine,
  type ThirdPartyLine,
} from "./equipment-sheet.ts";
import { slugify } from "./estimate-pack.ts";
import { ESTIMATE_MARKUP_RATE } from "./estimate-total.ts";
import { boundOtLabel, computeRowHours, type HoursSplit } from "./hours-clock.ts";
import { defaultLaborClass, type LaborClass } from "./labor-class.ts";
import { orgChartBoxLabel, orgChartBoxes, type OrgChartCrew, type OrgChartState } from "./org-chart.ts";
import { crewPositionHeadcount, miscAmount, travelAmount, type OtherCostSheet, type TravelLine } from "./other-cost.ts";
import { PHASE_NAMES, type PhaseId, type PhaseScheduleState } from "./phase-schedule.ts";
import {
  hasShahanBillRate,
  lookupShahanEquipment,
  lookupShahanLabor,
  SHAHAN_NO_RATE_LABEL,
  shahanCrewTitle,
  type JobRates,
  type ShahanLaborRow,
} from "./shahan-wood-river.ts";
import { emptySubSheet, lineAmount, subCardTotal, type SubSheet } from "./subcontractor.ts";
import { bookForSite, wageLookupOpts } from "./wage-lookup.ts";
import { buildWorkbook, colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

export const ESTIMATE_EXPORT_ERROR = "Could not export. Try again.";
export const ESTIMATE_EXPORT_PRODUCER = "Produced by Hit Squad Project Controls";
export const ESTIMATE_EXPORT_BRAND = "HIT SQUAD / PROJECT CONTROLS";

export const ESTIMATE_XLSX_SHEETS = {
  summary: "Summary Page",
  org: "ORG Chart",
  slicer: "Slicer Hrs",
  foremen: "Foremen",
  direct: "Direct",
  support: "Support",
  laydown: "Laydown",
  staff: "Staff",
  rental: "Equipment Rental",
  tension: "Tensioning Torquing equipment",
  crane: "Crane Rental",
  sub: "O&M Crane Subcontractor",
  coe: "COE",
  travel: "Staff Travel Cost",
  misc: "Misc Costs",
  rates: "Rate Tables",
} as const;

export type EstimateXlsxCrew = {
  staff?: CraftRow[];
  generalForeman?: CraftRow[];
  foreman?: CraftRow[];
  direct?: CraftRow[];
  support?: Array<CraftRow & { billedAs?: string }>;
  otAfter8?: boolean;
};

export type EstimateXlsxInput = {
  title?: string;
  client?: string;
  site?: string;
  plantCode?: string;
  crew?: EstimateXlsxCrew;
  schedule?: PhaseScheduleState;
  orgChart?: OrgChartState;
  jobMeta?: Partial<JobRates>;
  equipment?: EquipmentSheet;
  otherCost?: OtherCostSheet;
  subcontractor?: SubSheet;
};

type BuiltSheet = WorkbookSheet & {
  laborTotal?: string;
  pdTotal?: string;
  sheetTotal?: string;
};

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function quoteSheet(name: string) {
  return /[^A-Za-z0-9]/.test(name) ? `'${name.replaceAll("'", "''")}'` : name;
}

export function sheetRef(sheet: string, ref: string) {
  return `${quoteSheet(excelSafeSheetName(sheet))}!${ref}`;
}

function xlsxName(name: string) {
  return excelSafeSheetName(name);
}

export function estimateXlsxFilename(input: { site?: string; title?: string } = {}) {
  const site = slugify((input.site || "").split("—")[0] || "");
  const title = slugify(input.title || "");
  const base = ["hit-squad", site, title].filter(Boolean).join("-") || "hit-squad-estimate";
  return `${base}.xlsx`;
}

function rowHasPosition(row: { position?: string } | undefined) {
  return Boolean(row?.position?.trim());
}

function liveCrewRows(rows: CraftRow[] | undefined) {
  return (rows ?? []).filter(rowHasPosition);
}

function allCrewRows(crew: EstimateXlsxCrew = {}) {
  return [
    ...liveCrewRows(crew.staff),
    ...liveCrewRows(crew.generalForeman),
    ...liveCrewRows(crew.foreman),
    ...liveCrewRows(crew.direct),
    ...liveCrewRows(crew.support),
  ];
}

function rowHours(row: CraftRow, input: EstimateXlsxInput): HoursSplit {
  return computeRowHours(
    row,
    input.site ?? "",
    input.client ?? "",
    Boolean(input.crew?.otAfter8),
    input.plantCode ?? "",
  );
}

type RateKey = {
  title: string;
  laborClass: LaborClass;
};

function rowLaborClass(row: CraftRow): LaborClass {
  return row.laborClassOverride ?? defaultLaborClass(shahanCrewTitle(row));
}

function rateKeyId(key: RateKey) {
  return `${key.title}\0${key.laborClass}`;
}

function billedRow(title: string, site = "", laborClass?: LaborClass | null): ShahanLaborRow | null {
  const resolved = laborClass ?? defaultLaborClass(title);
  return lookupShahanLabor(title, wageLookupOpts(site, { laborClass: resolved }));
}

function wageRow(title: string, site = "", laborClass?: LaborClass | null): ShahanLaborRow | null {
  const book = bookForSite(site);
  if (!book) return null;
  const resolved = laborClass ?? defaultLaborClass(title);
  return lookupShahanLabor(title, { catalog: book.wageCatalog, laborClass: resolved });
}

function usedRateKeys(crew: EstimateXlsxCrew = {}): RateKey[] {
  const seen = new Set<string>();
  const keys: RateKey[] = [];
  for (const row of allCrewRows(crew)) {
    const title = shahanCrewTitle(row);
    if (!title) continue;
    const key = { title, laborClass: rowLaborClass(row) };
    const id = rateKeyId(key);
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push(key);
  }
  return keys;
}

function rateCraftLabel(key: RateKey, keys: RateKey[]) {
  const collisions = keys.filter((item) => item.title === key.title).length > 1;
  return collisions ? `${key.title} · ${key.laborClass}` : key.title;
}

function headerCells(input: EstimateXlsxInput): SheetCell[] {
  const clock = boundOtLabel(input.site ?? "", input.client ?? "", input.plantCode ?? "");
  const who = [input.client, input.site, clock].filter((part) => String(part || "").trim()).join("  ·  ");
  return [
    { ref: "A1", type: "text", value: ESTIMATE_EXPORT_BRAND },
    { ref: "A2", type: "text", value: ESTIMATE_EXPORT_PRODUCER },
    { ref: "A3", type: "text", value: (input.title || "").trim() || "Estimate" },
    { ref: "A4", type: "text", value: who },
  ];
}

function pushText(cells: SheetCell[], ref: string, value: string) {
  if (value) cells.push({ ref, type: "text", value });
}

function pushNum(cells: SheetCell[], ref: string, value: number) {
  cells.push({ ref, type: "number", value: money(value) });
}

function pushFormula(cells: SheetCell[], ref: string, value: string) {
  cells.push({ ref, type: "formula", value });
}

function thirdPartyBucket(item: string): "tension" | "crane" | "rental" {
  const hay = item.toLowerCase();
  if (/tension|torqu|rad gun/.test(hay)) return "tension";
  if (/\bcrane\b|carry deck/.test(hay)) return "crane";
  return "rental";
}

function buildRateSheet(input: EstimateXlsxInput, keys: RateKey[]): BuiltSheet | null {
  if (!keys.length) return null;
  const cells = headerCells(input);
  const headers = ["Craft", "COMP BW", "ST Bill", "OT Bill", "DT Bill", "PD"];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  const site = input.site ?? "";
  keys.forEach((key, index) => {
    const excelRow = 7 + index;
    const billed = billedRow(key.title, site, key.laborClass);
    const wage = wageRow(key.title, site, key.laborClass);
    pushText(cells, `A${excelRow}`, rateCraftLabel(key, keys));
    if (typeof wage?.baseSt === "number" && wage.baseSt > 0) pushNum(cells, `B${excelRow}`, wage.baseSt);
    if (hasShahanBillRate(billed)) {
      pushNum(cells, `C${excelRow}`, billed?.st ?? 0);
      pushNum(cells, `D${excelRow}`, billed?.ot ?? 0);
      pushNum(cells, `E${excelRow}`, billed?.dt ?? 0);
      pushNum(cells, `F${excelRow}`, billed?.pd ?? 0);
    } else {
      pushText(cells, `C${excelRow}`, SHAHAN_NO_RATE_LABEL);
    }
  });
  return { name: ESTIMATE_XLSX_SHEETS.rates, cells };
}

function rateCell(key: RateKey, keys: RateKey[], col: string) {
  const index = keys.findIndex((item) => item.title === key.title && item.laborClass === key.laborClass);
  if (index < 0) return "";
  return sheetRef(ESTIMATE_XLSX_SHEETS.rates, `${col}${7 + index}`);
}

function pdRateFor(input: EstimateXlsxInput, staffPd: boolean) {
  return staffPd ? Number(input.jobMeta?.staffPerDiemRate) || 0 : Number(input.jobMeta?.craftPerDiemRate) || 0;
}

function buildCrewSheet(
  input: EstimateXlsxInput,
  name: string,
  rows: CraftRow[],
  keys: RateKey[],
  staffPdOf: (row: CraftRow) => boolean,
): BuiltSheet | null {
  const live = liveCrewRows(rows);
  if (!live.length) return null;
  const cells = headerCells(input);
  const headers = [
    "Position",
    "Headcount",
    "ST Hrs",
    "OT Hrs",
    "DT Hrs",
    "PD Days",
    "ST Rate",
    "OT Rate",
    "DT Rate",
    "PD Rate",
    "ST $",
    "OT $",
    "DT $",
    "PD $",
    "Total",
  ];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  live.forEach((row, index) => {
    const excelRow = 7 + index;
    const hours = rowHours(row, input);
    const title = shahanCrewTitle(row);
    const key = { title, laborClass: rowLaborClass(row) };
    const billed = billedRow(title, input.site ?? "", key.laborClass);
    pushText(cells, `A${excelRow}`, row.position.trim());
    pushNum(cells, `B${excelRow}`, crewPositionHeadcount(row));
    pushNum(cells, `C${excelRow}`, hours.st);
    pushNum(cells, `D${excelRow}`, hours.ot);
    pushNum(cells, `E${excelRow}`, hours.dt);
    pushNum(cells, `F${excelRow}`, hours.pd);
    if (hasShahanBillRate(billed)) {
      pushFormula(cells, `G${excelRow}`, rateCell(key, keys, "C"));
      pushFormula(cells, `H${excelRow}`, rateCell(key, keys, "D"));
      pushFormula(cells, `I${excelRow}`, rateCell(key, keys, "E"));
      pushFormula(cells, `K${excelRow}`, `C${excelRow}*G${excelRow}`);
      pushFormula(cells, `L${excelRow}`, `D${excelRow}*H${excelRow}`);
      pushFormula(cells, `M${excelRow}`, `E${excelRow}*I${excelRow}`);
    } else {
      pushText(cells, `G${excelRow}`, SHAHAN_NO_RATE_LABEL);
    }
    pushNum(cells, `J${excelRow}`, pdRateFor(input, staffPdOf(row)));
    pushFormula(cells, `N${excelRow}`, `F${excelRow}*J${excelRow}`);
    pushFormula(cells, `O${excelRow}`, `K${excelRow}+L${excelRow}+M${excelRow}`);
  });
  const first = 7;
  const last = 6 + live.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `C${totalRow}`, `SUM(C${first}:C${last})`);
  pushFormula(cells, `D${totalRow}`, `SUM(D${first}:D${last})`);
  pushFormula(cells, `E${totalRow}`, `SUM(E${first}:E${last})`);
  pushFormula(cells, `F${totalRow}`, `SUM(F${first}:F${last})`);
  pushFormula(cells, `K${totalRow}`, `SUM(K${first}:K${last})`);
  pushFormula(cells, `L${totalRow}`, `SUM(L${first}:L${last})`);
  pushFormula(cells, `M${totalRow}`, `SUM(M${first}:M${last})`);
  pushFormula(cells, `N${totalRow}`, `SUM(N${first}:N${last})`);
  pushFormula(cells, `O${totalRow}`, `SUM(O${first}:O${last})`);
  return {
    name,
    cells,
    laborTotal: `O${totalRow}`,
    pdTotal: `N${totalRow}`,
    sheetTotal: `O${totalRow}`,
  };
}

function buildOrgSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const crew: OrgChartCrew = {
    staff: input.crew?.staff,
    generalForeman: input.crew?.generalForeman,
    foreman: input.crew?.foreman,
  };
  const boxes = orgChartBoxes(crew, input.orgChart);
  if (!boxes.length) return null;
  const cells = headerCells(input);
  ["Position", "Name", "Lane", "Shift", "Count", "Reports to"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  const byId = new Map(boxes.map((box) => [box.id, box]));
  boxes.forEach((box, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, box.position);
    pushText(cells, `B${excelRow}`, orgChartBoxLabel(box));
    pushText(cells, `C${excelRow}`, box.lane);
    pushText(cells, `D${excelRow}`, box.shift);
    pushNum(cells, `E${excelRow}`, box.count);
    const parent = box.parentId === "company" ? "Company" : orgChartBoxLabel(byId.get(box.parentId) ?? { ...box, kind: "title", name: "", position: box.parentId });
    pushText(cells, `F${excelRow}`, parent);
  });
  return { name: ESTIMATE_XLSX_SHEETS.org, cells };
}

function phaseHours(input: EstimateXlsxInput, phaseId: PhaseId): HoursSplit {
  const rows = allCrewRows(input.crew);
  return rows.reduce(
    (sum, row) => {
      const part = computeRowHours(
        { ...row, ranges: (row.ranges ?? []).filter((range) => !range.off && range.phaseId === phaseId) },
        input.site ?? "",
        input.client ?? "",
        Boolean(input.crew?.otAfter8),
        input.plantCode ?? "",
      );
      return {
        st: sum.st + part.st,
        ot: sum.ot + part.ot,
        dt: sum.dt + part.dt,
        pd: sum.pd + part.pd,
        hours: sum.hours + part.hours,
        workedDays: sum.workedDays + part.workedDays,
      };
    },
    { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0 },
  );
}

function buildSlicerSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const phases = (input.schedule?.phases ?? []).filter((phase) => phase.on);
  if (!phases.length || !allCrewRows(input.crew).length) return null;
  const rows = phases
    .map((phase) => ({ phase, hours: phaseHours(input, phase.id) }))
    .filter((row) => row.hours.hours > 0);
  if (!rows.length) return null;
  const cells = headerCells(input);
  ["Phase", "ST Hrs", "OT Hrs", "DT Hrs", "Hours"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  rows.forEach((row, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, PHASE_NAMES[row.phase.id] ?? row.phase.name);
    pushNum(cells, `B${excelRow}`, row.hours.st);
    pushNum(cells, `C${excelRow}`, row.hours.ot);
    pushNum(cells, `D${excelRow}`, row.hours.dt);
    pushFormula(cells, `E${excelRow}`, `B${excelRow}+C${excelRow}+D${excelRow}`);
  });
  const first = 7;
  const last = 6 + rows.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `B${totalRow}`, `SUM(B${first}:B${last})`);
  pushFormula(cells, `C${totalRow}`, `SUM(C${first}:C${last})`);
  pushFormula(cells, `D${totalRow}`, `SUM(D${first}:D${last})`);
  pushFormula(cells, `E${totalRow}`, `SUM(E${first}:E${last})`);
  return { name: ESTIMATE_XLSX_SHEETS.slicer, cells, sheetTotal: `E${totalRow}` };
}

function liveThirdParty(line: ThirdPartyLine) {
  return Boolean(line.item.trim()) && thirdPartyCost(line) > 0;
}

function liveLargeTool(line: LargeToolLine) {
  return Boolean(line.itemId.trim()) && largeToolAmount(line) > 0;
}

function buildRentalSheet(input: EstimateXlsxInput, name: string, lines: ThirdPartyLine[]): BuiltSheet | null {
  const live = lines.filter(liveThirdParty);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Item", "Period", "Qty", "Periods", "Rate", "Freight", "Cost", "Total"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  live.forEach((line, index) => {
    const excelRow = 7 + index;
    const periods = billedPeriodCount(line.start, line.end, line.period);
    pushText(cells, `A${excelRow}`, line.item);
    pushText(cells, `B${excelRow}`, line.period);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, periods);
    pushNum(cells, `E${excelRow}`, line.rate);
    pushNum(cells, `F${excelRow}`, line.freight);
    pushFormula(cells, `G${excelRow}`, `C${excelRow}*D${excelRow}*E${excelRow}+F${excelRow}`);
    pushFormula(cells, `H${excelRow}`, `G${excelRow}*${1 + THIRD_PARTY_MARKUP}`);
  });
  const first = 7;
  const last = 6 + live.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${totalRow}`, `SUM(H${first}:H${last})`);
  return { name, cells, sheetTotal: `H${totalRow}` };
}

function buildCoeSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const live = (input.equipment?.largeTools ?? []).filter(liveLargeTool);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Item", "Period", "Qty", "Periods", "Rate", "Freight", "Total"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  live.forEach((line, index) => {
    const excelRow = 7 + index;
    const item = lookupShahanEquipment(line.itemId);
    const periods = billedPeriodCount(line.start, line.end, line.period);
    const amount = largeToolAmount(line);
    const rate = periods > 0 && line.qty > 0 ? money((amount - (line.freight || 0)) / (periods * line.qty)) : 0;
    pushText(cells, `A${excelRow}`, item?.description || line.itemId);
    pushText(cells, `B${excelRow}`, line.period);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, periods);
    pushNum(cells, `E${excelRow}`, rate);
    pushNum(cells, `F${excelRow}`, line.freight);
    pushFormula(cells, `G${excelRow}`, `C${excelRow}*D${excelRow}*E${excelRow}+F${excelRow}`);
  });
  const first = 7;
  const last = 6 + live.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  return { name: ESTIMATE_XLSX_SHEETS.coe, cells, sheetTotal: `G${totalRow}` };
}

function liveTravel(line: TravelLine) {
  return travelAmount(line) > 0;
}

function buildTravelSheet(input: EstimateXlsxInput, lines: TravelLine[], name: string): BuiltSheet | null {
  const live = lines.filter(liveTravel);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Kind", "Travelers", "Miles", "$ / mile", "Total"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  live.forEach((line, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, line.kind === "staff" ? "Staff" : "Craft");
    pushNum(cells, `B${excelRow}`, Math.min(line.travelers, line.headcount || line.travelers));
    pushNum(cells, `C${excelRow}`, line.miles);
    pushNum(cells, `D${excelRow}`, line.perMile);
    pushFormula(cells, `E${excelRow}`, `B${excelRow}*C${excelRow}*D${excelRow}`);
  });
  const first = 7;
  const last = 6 + live.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `E${totalRow}`, `SUM(E${first}:E${last})`);
  return { name, cells, sheetTotal: `E${totalRow}` };
}

function buildMiscSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const misc = (input.otherCost?.misc ?? []).filter((line) => miscAmount(line) > 0);
  const craftTravel = (input.otherCost?.travel ?? []).filter((line) => line.kind === "craft" && liveTravel(line));
  if (!misc.length && !craftTravel.length) return null;
  const cells = headerCells(input);
  ["Item", "Description", "Qty", "Each", "Total"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  let excelRow = 7;
  for (const line of craftTravel) {
    pushText(cells, `A${excelRow}`, "Craft travel");
    pushText(cells, `B${excelRow}`, `${line.travelers} travelers`);
    pushNum(cells, `C${excelRow}`, Math.min(line.travelers, line.headcount || line.travelers));
    pushNum(cells, `D${excelRow}`, money(line.miles * line.perMile));
    pushFormula(cells, `E${excelRow}`, `C${excelRow}*D${excelRow}`);
    excelRow += 1;
  }
  for (const line of misc) {
    pushText(cells, `A${excelRow}`, line.item);
    pushText(cells, `B${excelRow}`, line.description);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, line.each);
    pushFormula(cells, `E${excelRow}`, `C${excelRow}*D${excelRow}`);
    excelRow += 1;
  }
  const first = 7;
  const last = excelRow - 1;
  pushText(cells, `A${excelRow}`, "TOTAL");
  pushFormula(cells, `E${excelRow}`, `SUM(E${first}:E${last})`);
  return { name: ESTIMATE_XLSX_SHEETS.misc, cells, sheetTotal: `E${excelRow}` };
}

function buildSubSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const sheet = input.subcontractor ?? emptySubSheet();
  const ctx = { site: input.site, client: input.client, otAfter8: Boolean(input.crew?.otAfter8) };
  const lines = (sheet.lines ?? []).filter((line) => lineAmount(line) > 0);
  const cards = (sheet.cards ?? []).filter((card) => subCardTotal(card, ctx) > 0);
  if (!lines.length && !cards.length) return null;
  const cells = headerCells(input);
  ["Vendor", "Scope", "Qty", "Rate", "Affiliate", "Cost", "Markup", "Total"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  let excelRow = 7;
  for (const line of lines) {
    pushText(cells, `A${excelRow}`, line.vendor);
    pushText(cells, `B${excelRow}`, line.scope);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, line.rate);
    pushText(cells, `E${excelRow}`, line.affiliate ? "Yes" : "No");
    pushFormula(cells, `F${excelRow}`, `C${excelRow}*D${excelRow}`);
    pushFormula(cells, `G${excelRow}`, line.affiliate ? "0" : `F${excelRow}*${ESTIMATE_MARKUP_RATE}`);
    pushFormula(cells, `H${excelRow}`, `F${excelRow}+G${excelRow}`);
    excelRow += 1;
  }
  for (const card of cards) {
    const amount = subCardTotal(card, ctx);
    pushText(cells, `A${excelRow}`, card.vendor);
    pushText(cells, `B${excelRow}`, card.kind);
    pushNum(cells, `C${excelRow}`, 1);
    pushNum(cells, `D${excelRow}`, amount);
    pushText(cells, `E${excelRow}`, card.affiliate ? "Yes" : "No");
    pushFormula(cells, `F${excelRow}`, `C${excelRow}*D${excelRow}`);
    pushFormula(cells, `G${excelRow}`, card.affiliate ? "0" : `F${excelRow}*${ESTIMATE_MARKUP_RATE}`);
    pushFormula(cells, `H${excelRow}`, `F${excelRow}+G${excelRow}`);
    excelRow += 1;
  }
  const first = 7;
  const last = excelRow - 1;
  pushText(cells, `A${excelRow}`, "ESTIMATE TOTAL");
  pushFormula(cells, `F${excelRow}`, `SUM(F${first}:F${last})`);
  pushFormula(cells, `G${excelRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${excelRow}`, `SUM(H${first}:H${last})`);
  return { name: ESTIMATE_XLSX_SHEETS.sub, cells, sheetTotal: `H${excelRow}` };
}

function addSummaryLine(
  cells: SheetCell[],
  row: number,
  label: string,
  formula: string | null,
) {
  pushText(cells, `A${row}`, label);
  if (formula) pushFormula(cells, `B${row}`, formula);
  return formula ? `B${row}` : null;
}

function buildSummary(input: EstimateXlsxInput, built: BuiltSheet[]): BuiltSheet {
  const cells = headerCells(input);
  pushText(cells, "A6", "Line");
  pushText(cells, "B6", "Amount");
  const byName = new Map(built.map((sheet) => [xlsxName(sheet.name), sheet]));
  const moneyRefs: string[] = [];
  let row = 7;

  const laborSheets: Array<[string, string]> = [
    ["Staff", ESTIMATE_XLSX_SHEETS.staff],
    ["Foremen", ESTIMATE_XLSX_SHEETS.foremen],
    ["Direct", ESTIMATE_XLSX_SHEETS.direct],
    ["Support", ESTIMATE_XLSX_SHEETS.support],
  ];
  const laborRefs: string[] = [];
  for (const [label, name] of laborSheets) {
    const sheet = byName.get(xlsxName(name));
    if (!sheet?.laborTotal) continue;
    const ref = addSummaryLine(cells, row, label, sheetRef(name, sheet.laborTotal));
    if (ref) laborRefs.push(ref);
    row += 1;
  }
  if (laborRefs.length) {
    const ref = addSummaryLine(cells, row, "Labor", `SUM(${laborRefs.join(",")})`);
    if (ref) moneyRefs.push(ref);
    row += 1;
  }

  const pdRefs = laborSheets
    .map(([, name]) => {
      const sheet = byName.get(xlsxName(name));
      return sheet?.pdTotal ? sheetRef(name, sheet.pdTotal) : "";
    })
    .filter(Boolean);
  if (pdRefs.length) {
    const ref = addSummaryLine(cells, row, "Per diem", pdRefs.length === 1 ? pdRefs[0] : `SUM(${pdRefs.join(",")})`);
    if (ref) moneyRefs.push(ref);
    row += 1;
  }

  const extra: Array<[string, string]> = [
    ["Staff travel", ESTIMATE_XLSX_SHEETS.travel],
    ["Misc", ESTIMATE_XLSX_SHEETS.misc],
    ["Equipment rental", ESTIMATE_XLSX_SHEETS.rental],
    ["Tensioning / torquing", ESTIMATE_XLSX_SHEETS.tension],
    ["Crane rental", ESTIMATE_XLSX_SHEETS.crane],
    ["COE", ESTIMATE_XLSX_SHEETS.coe],
    ["Subcontractor", ESTIMATE_XLSX_SHEETS.sub],
  ];
  for (const [label, name] of extra) {
    const sheet = byName.get(xlsxName(name));
    if (!sheet?.sheetTotal) continue;
    const ref = addSummaryLine(cells, row, label, sheetRef(name, sheet.sheetTotal));
    if (ref) moneyRefs.push(ref);
    row += 1;
  }

  const totalRow = row + 1;
  pushText(cells, `A${totalRow}`, "ESTIMATE TOTAL");
  if (moneyRefs.length) pushFormula(cells, `B${totalRow}`, `SUM(${moneyRefs.join(",")})`);
  else pushNum(cells, `B${totalRow}`, 0);

  return { name: ESTIMATE_XLSX_SHEETS.summary, cells, sheetTotal: `B${totalRow}` };
}

export function buildEstimateWorkbook(input: EstimateXlsxInput = {}): WorkbookSheet[] {
  const keys = usedRateKeys(input.crew);
  const rates = buildRateSheet(input, keys);
  const gfIds = new Set((input.crew?.generalForeman ?? []).map((row) => row.id));
  const staff = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.staff, input.crew?.staff ?? [], keys, () => true);
  const foremen = buildCrewSheet(
    input,
    ESTIMATE_XLSX_SHEETS.foremen,
    [...(input.crew?.generalForeman ?? []), ...(input.crew?.foreman ?? [])],
    keys,
    (row) => gfIds.has(row.id),
  );
  const direct = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.direct, input.crew?.direct ?? [], keys, () => false);
  const support = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.support, input.crew?.support ?? [], keys, () => false);
  const org = buildOrgSheet(input);
  const slicer = buildSlicerSheet(input);
  const third = input.equipment?.thirdParty ?? [];
  const rental = buildRentalSheet(
    input,
    ESTIMATE_XLSX_SHEETS.rental,
    third.filter((line) => thirdPartyBucket(line.item) === "rental"),
  );
  const tension = buildRentalSheet(
    input,
    ESTIMATE_XLSX_SHEETS.tension,
    third.filter((line) => thirdPartyBucket(line.item) === "tension"),
  );
  const crane = buildRentalSheet(
    input,
    ESTIMATE_XLSX_SHEETS.crane,
    third.filter((line) => thirdPartyBucket(line.item) === "crane"),
  );
  const coe = buildCoeSheet(input);
  const staffTravel = buildTravelSheet(
    input,
    (input.otherCost?.travel ?? []).filter((line) => line.kind === "staff"),
    ESTIMATE_XLSX_SHEETS.travel,
  );
  const misc = buildMiscSheet(input);
  const sub = buildSubSheet(input);
  const body = [org, slicer, staff, foremen, direct, support, rental, tension, crane, sub, coe, staffTravel, misc, rates]
    .filter((sheet): sheet is BuiltSheet => Boolean(sheet))
    .map((sheet) => ({ ...sheet, name: xlsxName(sheet.name) }));
  return [{ ...buildSummary(input, body), name: xlsxName(ESTIMATE_XLSX_SHEETS.summary) }, ...body];
}

export function estimateToXlsx(input: EstimateXlsxInput = {}): Uint8Array {
  const sheets = buildEstimateWorkbook(input);
  if (!sheets.length) throw new Error("empty-workbook");
  const bytes = buildWorkbook(sheets);
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}
