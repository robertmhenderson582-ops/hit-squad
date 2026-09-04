/**
 * Desk estimate → Excel workbook.
 * Wood River / CAT 2 familiarity is an explicit constraint: same labor sheet
 * names and itemized position blocks. Workbook Staff = desk Staff + GF & above.
 * Foremen / Direct / Support stay their own sheets. Desk cards stay the five
 * cards (Staff / GF / Foreman / Direct / Support) — this file does not invent
 * a new crew presentation. PD stays off Labor TM $. Labor sheets keep the
 * CAT 2 daily itemized grid (date row from col L, 7-row HC/HPS/ST/OT/DT/PD
 * blocks, DAYSHIFT / NIGHTSHIFT). That grid is the stable client edit surface
 * for a later import (parked — not in this PR). Hidden block-id column is for
 * a future importer only. Polish, repair-safe package, and $ vs MH labels
 * only. ORG Chart is a later separate export — not in this workbook.
 * Slicer Hrs (IPS / P6 dump) is not in this workbook.
 * Empty category sheets are omitted — leftover $0 / untitled rows do not
 * create a blank Crane Rental, Subcontractor, tension, rental, COE, travel,
 * misc, or labor tab. Only sheets with live rows for that estimate.
 * Subcontractor tab is all subs (not crane-only). Summary Subs $ is desk
 * Subs ESTIMATE TOTAL (cost + affiliate-aware 6.5%). Weekend columns on
 * labor grids are shaded; clock math is unchanged.
 * Never commit source workbooks to git (Look samples excepted).
 */

import type { CalendarRange, CraftRow, CraftShift } from "./craft-labor.ts";
import {
  billedPeriodCount,
  largeToolAmount,
  thirdPartyCost,
  type EquipmentSheet,
  type LargeToolLine,
  type ThirdPartyLine,
} from "./equipment-sheet.ts";
import {
  CBA_INCREASE_LABEL,
  EQUIPMENT_CONTINGENCY_LABEL,
  LABOR_CONTINGENCY_LABEL,
  MORE_FUND_LABEL,
  SUBS_CONTINGENCY_LABEL,
  cbaIncreaseDollars,
  hydrateJobMoney,
  moneyAdderLines,
  moreFundDollars,
  type JobMoney,
} from "./estimate-money.ts";
import { slugify } from "./estimate-pack.ts";
import { commercialMarkupLabel, commercialMarkupRate, estimateMarkupDollars } from "./estimate-total.ts";
import {
  boundOtLabel,
  clockTitle,
  eastCoastCraftOtAfter8,
  parseYmd,
  runningClock,
  type ClockOverride,
  type RunningClock,
} from "./hours-clock.ts";
import { defaultLaborClass, type LaborClass } from "./labor-class.ts";
import { miscAmount, travelAmount, type OtherCostSheet, type TravelLine } from "./other-cost.ts";
import { eachYmd, type PhaseScheduleState } from "./phase-schedule.ts";
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
export const ESTIMATE_EXPORT_CONFIDENTIAL = "Confidential estimate package";
export const ESTIMATE_SUMMARY_AMOUNT = "Amount $";
export const ESTIMATE_SUMMARY_HOURS = "Man-hours (MH)";
export const ESTIMATE_HOURS_LINE = "Man-hours";
export const LABOR_DATE_START_COL = 12;
export const LABOR_BLOCK_HEIGHT = 7;
/** Full job window. 90 days truncated Aromatics and understated desk totals. */
export const LABOR_MAX_DAYS = 400;
export const LABOR_HPS_LABEL = "Enter Hours Per shift Here";
export const LABOR_DAYSHIFT = "DAYSHIFT";
export const LABOR_NIGHTSHIFT = "NIGHTSHIFT";
export const LABOR_HC_LABEL = "HC";
export const LABOR_HPS_TYPE = "HPS";
export const LABOR_TITLE_TYPE = "TITLE";
export const LABOR_TYPE_ORDER = ["TITLE", "HC", "HPS", "ST", "OT", "DT", "PD"] as const;
/** Hidden column after the longest calendar so a later importer can key blocks. */
export const LABOR_BLOCK_ID_COL = LABOR_DATE_START_COL + LABOR_MAX_DAYS;
export const LABOR_TITLE_OFFSET = 0;
export const LABOR_HC_OFFSET = 1;
export const LABOR_HPS_OFFSET = 2;
export const LABOR_ST_OFFSET = 3;
export const LABOR_OT_OFFSET = 4;
export const LABOR_DT_OFFSET = 5;
export const LABOR_PD_OFFSET = 6;

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
  sub: "Subcontractor",
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
  jobMeta?: Partial<JobRates & JobMoney>;
  equipment?: EquipmentSheet;
  otherCost?: OtherCostSheet;
  subcontractor?: SubSheet;
};

type CrewLane = "staff" | "craft";

type BuiltSheet = WorkbookSheet & {
  laborTotal?: string;
  pdTotal?: string;
  hoursTotal?: string;
  costTotal?: string;
  markupTotal?: string;
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

function withLaneClock(row: CraftRow, lane: CrewLane): CraftRow {
  if (lane === "staff" && row.clockOverride !== "comp") {
    return { ...row, clockOverride: "staff" satisfies ClockOverride };
  }
  return row;
}

function allCrewRows(crew: EstimateXlsxCrew = {}) {
  return [
    ...liveCrewRows(crew.staff).map((row) => withLaneClock(row, "staff")),
    ...liveCrewRows(crew.generalForeman),
    ...liveCrewRows(crew.foreman),
    ...liveCrewRows(crew.direct),
    ...liveCrewRows(crew.support),
  ];
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

function exportProducedLabel(when = new Date()): string {
  const stamp = when.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return `Produced ${stamp}`;
}

function headerCells(input: EstimateXlsxInput, when = new Date()): SheetCell[] {
  const clock = boundOtLabel(input.site ?? "", input.client ?? "", input.plantCode ?? "");
  const title = (input.title || "").trim() || "Estimate";
  const job = [title, input.client, input.site, clock].filter((part) => String(part || "").trim()).join("  ·  ");
  return [
    { ref: "A1", type: "text", value: ESTIMATE_EXPORT_BRAND },
    { ref: "A2", type: "text", value: job },
    {
      ref: "A3",
      type: "text",
      value: `${ESTIMATE_EXPORT_PRODUCER}  ·  ${ESTIMATE_EXPORT_CONFIDENTIAL}  ·  ${exportProducedLabel(when)}`,
    },
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
  const headers = ["Craft", "COMP BW $", "ST Bill $", "OT Bill $", "DT Bill $", "PD Rate"];
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

/** Stable key for one DAYSHIFT / NIGHTSHIFT block. Future import only — not shown. */
export function laborBlockId(row: { id?: string; position?: string }, night: boolean): string {
  const raw = (row.id || row.position || "row").trim().replace(/\|/g, "-");
  return `${raw}|${night ? "night" : "day"}`;
}

export function laborCalendarDates(input: EstimateXlsxInput): string[] {
  let start = "";
  let stop = "";
  const phases = [
    ...(input.schedule?.phases ?? []),
    ...((input.schedule?.multiUnits ? input.schedule.units : []) ?? []).flatMap((unit) => unit.phases),
  ].filter((phase) => phase.on && phase.start && phase.stop);
  for (const phase of phases) {
    if (!start || phase.start < start) start = phase.start;
    if (!stop || phase.stop > stop) stop = phase.stop;
  }
  for (const row of allCrewRows(input.crew)) {
    for (const range of row.ranges ?? []) {
      if (range.off) continue;
      if (range.start && (!start || range.start < start)) start = range.start;
      if (range.end && (!stop || range.end > stop)) stop = range.end;
    }
  }
  if (!start || !stop) return [];
  return eachYmd(start, stop).slice(0, LABOR_MAX_DAYS);
}

function rangeShift(row: CraftRow, range: CalendarRange): CraftShift {
  return range.shift ?? row.shift ?? "Days";
}

function rowHasDayBlock(row: CraftRow) {
  return (row.ranges ?? []).some((range) => {
    if (range.off) return false;
    const shift = rangeShift(row, range);
    return shift !== "Nights";
  });
}

function rowHasNightBlock(row: CraftRow) {
  return (row.ranges ?? []).some((range) => {
    if (range.off) return false;
    const shift = rangeShift(row, range);
    if (shift === "Nights") return true;
    return shift === "Days & nights" && (Number(range.nightHeadcount) || 0) > 0;
  });
}

function rangeCoversDay(row: CraftRow, range: CalendarRange, ymd: string, night: boolean): boolean {
  if (range.off) return false;
  const shift = rangeShift(row, range);
  if (night && shift === "Days") return false;
  if (!night && shift === "Nights") return false;
  if (!range.start || !range.end) return false;
  if (ymd < range.start || ymd > range.end) return false;
  if (range.skipDates?.includes(ymd)) return false;
  const date = parseYmd(ymd);
  if (!date) return false;
  if (Array.isArray(range.days) && range.days.length === 7 && !range.days[date.getDay()]) return false;
  return true;
}

function coveringRanges(row: CraftRow, ymd: string, night: boolean): CalendarRange[] {
  return (row.ranges ?? []).filter((range) => rangeCoversDay(row, range, ymd, night));
}

function rangeDayHeadcount(row: CraftRow, range: CalendarRange, ymd: string, night: boolean): number {
  const date = parseYmd(ymd);
  const dow = date?.getDay() ?? -1;
  const shift = rangeShift(row, range);
  const nightsOnly = night && shift === "Nights";
  let hc = nightsOnly
    ? Number(range.headcount) || 0
    : night
      ? Number(range.nightHeadcount) || 0
      : Number(range.headcount) || 0;
  if (dow === 0) {
    if (nightsOnly && range.sundayHeadcount != null) hc = Number(range.sundayHeadcount) || 0;
    else if (night && range.nightSundayHeadcount != null) hc = Number(range.nightSundayHeadcount) || 0;
    else if (!night && range.sundayHeadcount != null) hc = Number(range.sundayHeadcount) || 0;
  }
  return Math.max(0, hc);
}

function rangeDayPd(row: CraftRow, range: CalendarRange, night: boolean): number {
  const shift = rangeShift(row, range);
  if (night && shift === "Nights") return Math.max(0, Number(range.perDiemPeople) || 0);
  return Math.max(0, night ? Number(range.nightPerDiemPeople) || 0 : Number(range.perDiemPeople) || 0);
}

/** Sum every live range on that day — hiring-progression adds stack, same as the desk. */
function dayPlug(row: CraftRow, ymd: string, night: boolean): { hc: number; hps: number; pd: number } {
  const ranges = coveringRanges(row, ymd, night);
  if (!ranges.length) return { hc: 0, hps: 0, pd: 0 };
  let hourUnits = 0;
  let pd = 0;
  let hps = 0;
  for (const range of ranges) {
    const hc = rangeDayHeadcount(row, range, ymd, night);
    const rangeHps = Number(range.hoursPerShift) || 0;
    hourUnits += hc * rangeHps;
    pd += rangeDayPd(row, range, night);
    if (rangeHps > 0) hps = rangeHps;
  }
  const hc = hps > 0 ? hourUnits / hps : 0;
  if (hc <= 0 && pd <= 0) return { hc: 0, hps: 0, pd: 0 };
  return { hc, hps, pd };
}

function blockClock(row: CraftRow, input: EstimateXlsxInput, lane: CrewLane): { clock: RunningClock; otAfter8: boolean } {
  const titled = withLaneClock(row, lane);
  const title = clockTitle(titled.position, titled.billedAs);
  const clock = runningClock(title, input.site ?? "", input.client ?? "", titled.clockOverride ?? "auto", input.plantCode ?? "");
  const range = (titled.ranges ?? []).find((item) => !item.off);
  const flagged = Boolean(range?.otAfter8 ?? input.crew?.otAfter8);
  const otAfter8 = clock === "east-coast" ? eastCoastCraftOtAfter8(range?.phaseId, flagged) : flagged;
  return { clock, otAfter8 };
}

function dailyHourFormulas(
  clock: RunningClock,
  otAfter8: boolean,
  dateRef: string,
  hcRef: string,
  hpsRef: string,
): { st: string; ot: string; dt: string } {
  const empty = `${dateRef}=""`;
  if (clock === "ca-daily") {
    return {
      st: `IF(${empty},"",MIN(8,${hpsRef})*${hcRef})`,
      ot: `IF(${empty},"",MIN(4,MAX(0,${hpsRef}-8))*${hcRef})`,
      dt: `IF(${empty},"",MAX(0,${hpsRef}-12)*${hcRef})`,
    };
  }
  if (clock === "staff") {
    const cap = otAfter8 ? 8 : 10;
    return {
      st: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,0,MIN(${cap},${hpsRef})*${hcRef}))`,
      ot: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,0,MAX(0,${hpsRef}-${cap})*${hcRef}))`,
      dt: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,${hpsRef}*${hcRef},0))`,
    };
  }
  if (!otAfter8 && clock === "east-coast") {
    return {
      st: `IF(${empty},"",IF(OR(WEEKDAY(${dateRef},1)=1,WEEKDAY(${dateRef},1)=7),0,${hpsRef}*${hcRef}))`,
      ot: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=7,${hpsRef}*${hcRef},0))`,
      dt: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,${hpsRef}*${hcRef},0))`,
    };
  }
  return {
    st: `IF(${empty},"",IF(OR(WEEKDAY(${dateRef},1)=1,WEEKDAY(${dateRef},1)=7),0,MIN(8,${hpsRef})*${hcRef}))`,
    ot: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,0,IF(WEEKDAY(${dateRef},1)=7,${hpsRef}*${hcRef},MAX(0,${hpsRef}-8)*${hcRef})))`,
    dt: `IF(${empty},"",IF(WEEKDAY(${dateRef},1)=1,${hpsRef}*${hcRef},0))`,
  };
}

function writeDateRow(cells: SheetCell[], dates: string[]) {
  dates.forEach((ymd, index) => {
    const col = colLetter(LABOR_DATE_START_COL + index);
    if (index === 0) {
      const date = parseYmd(ymd);
      if (date) cells.push({ ref: `${col}6`, type: "date", value: date });
      else pushText(cells, `${col}6`, ymd);
      return;
    }
    pushFormula(cells, `${col}6`, `${colLetter(LABOR_DATE_START_COL + index - 1)}6+1`);
  });
}

function buildCrewSheet(
  input: EstimateXlsxInput,
  name: string,
  rows: CraftRow[],
  keys: RateKey[],
  staffPdOf: (row: CraftRow) => boolean,
  lane: CrewLane = "craft",
): BuiltSheet | null {
  const live = liveCrewRows(rows).map((row) => withLaneClock(row, lane));
  if (!live.length) return null;
  const dates = laborCalendarDates(input);
  const lastDateCol = dates.length ? colLetter(LABOR_DATE_START_COL + dates.length - 1) : "";
  const cells = headerCells(input);
  const headers = [
    "Shift",
    "Total Billable",
    "Position",
    "Sub Total $",
    "Rate",
    "Type",
    "ST Hrs",
    "OT Hrs",
    "DT Hrs",
    "PD Days",
    "Labor $",
  ];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  writeDateRow(cells, dates);

  const titleRows: number[] = [];
  const pdMoneyRows: number[] = [];
  const laborBlocks: Array<{ start: number; end: number }> = [];
  const spacerRows: number[] = [];
  let excelRow = 7;

  function emitBlock(row: CraftRow, night: boolean) {
    const titleRow = excelRow + LABOR_TITLE_OFFSET;
    const hcRow = excelRow + LABOR_HC_OFFSET;
    const hpsRow = excelRow + LABOR_HPS_OFFSET;
    const stRow = excelRow + LABOR_ST_OFFSET;
    const otRow = excelRow + LABOR_OT_OFFSET;
    const dtRow = excelRow + LABOR_DT_OFFSET;
    const pdRow = excelRow + LABOR_PD_OFFSET;
    titleRows.push(titleRow);
    pdMoneyRows.push(pdRow);

    const title = shahanCrewTitle(row);
    const key = { title, laborClass: rowLaborClass(row) };
    const billed = billedRow(title, input.site ?? "", key.laborClass);
    const hasRate = hasShahanBillRate(billed);
    const { clock, otAfter8 } = blockClock(row, input, lane);
    const firstDate = dates.length ? colLetter(LABOR_DATE_START_COL) : "";

    const blockId = laborBlockId(row, night);
    const idCol = colLetter(LABOR_BLOCK_ID_COL);
    for (let offset = 0; offset < LABOR_BLOCK_HEIGHT; offset += 1) {
      pushText(cells, `${idCol}${excelRow + offset}`, blockId);
    }

    pushText(cells, `A${titleRow}`, night ? LABOR_NIGHTSHIFT : LABOR_DAYSHIFT);
    pushText(cells, `C${titleRow}`, row.position.trim());
    pushText(cells, `F${titleRow}`, LABOR_TITLE_TYPE);
    pushFormula(cells, `B${titleRow}`, `G${titleRow}+H${titleRow}+I${titleRow}`);
    pushFormula(cells, `D${titleRow}`, `K${titleRow}`);
    pushFormula(cells, `G${titleRow}`, `B${stRow}`);
    pushFormula(cells, `H${titleRow}`, `B${otRow}`);
    pushFormula(cells, `I${titleRow}`, `B${dtRow}`);
    pushFormula(cells, `J${titleRow}`, `B${pdRow}`);
    pushFormula(cells, `K${titleRow}`, `D${stRow}+D${otRow}+D${dtRow}`);

    pushText(cells, `F${hcRow}`, LABOR_HC_LABEL);
    pushText(cells, `A${hpsRow}`, LABOR_HPS_LABEL);
    pushText(cells, `F${hpsRow}`, LABOR_HPS_TYPE);
    pushText(cells, `F${stRow}`, "ST");
    pushText(cells, `F${otRow}`, "OT");
    pushText(cells, `F${dtRow}`, "DT");
    pushText(cells, `F${pdRow}`, "PD");

    if (dates.length) {
      pushFormula(cells, `B${stRow}`, `SUM(${firstDate}${stRow}:${lastDateCol}${stRow})`);
      pushFormula(cells, `B${otRow}`, `SUM(${firstDate}${otRow}:${lastDateCol}${otRow})`);
      pushFormula(cells, `B${dtRow}`, `SUM(${firstDate}${dtRow}:${lastDateCol}${dtRow})`);
      pushFormula(cells, `B${pdRow}`, `SUM(${firstDate}${pdRow}:${lastDateCol}${pdRow})`);
    } else {
      pushNum(cells, `B${stRow}`, 0);
      pushNum(cells, `B${otRow}`, 0);
      pushNum(cells, `B${dtRow}`, 0);
      pushNum(cells, `B${pdRow}`, 0);
    }

    if (hasRate) {
      pushFormula(cells, `E${stRow}`, rateCell(key, keys, "C"));
      pushFormula(cells, `E${otRow}`, rateCell(key, keys, "D"));
      pushFormula(cells, `E${dtRow}`, rateCell(key, keys, "E"));
      pushFormula(cells, `D${stRow}`, `B${stRow}*E${stRow}`);
      pushFormula(cells, `D${otRow}`, `B${otRow}*E${otRow}`);
      pushFormula(cells, `D${dtRow}`, `B${dtRow}*E${dtRow}`);
    } else {
      pushText(cells, `E${stRow}`, SHAHAN_NO_RATE_LABEL);
      pushNum(cells, `D${stRow}`, 0);
      pushNum(cells, `D${otRow}`, 0);
      pushNum(cells, `D${dtRow}`, 0);
    }
    pushNum(cells, `E${pdRow}`, pdRateFor(input, staffPdOf(row)));
    pushFormula(cells, `D${pdRow}`, `B${pdRow}*E${pdRow}`);

    dates.forEach((ymd, index) => {
      const col = colLetter(LABOR_DATE_START_COL + index);
      const plug = dayPlug(row, ymd, night);
      const dateRef = `${col}$6`;
      const hcRef = `${col}${hcRow}`;
      const hpsRef = `${col}${hpsRow}`;
      pushNum(cells, hcRef, plug.hc);
      pushNum(cells, hpsRef, plug.hps);
      const hours = dailyHourFormulas(clock, otAfter8, dateRef, hcRef, hpsRef);
      pushFormula(cells, `${col}${stRow}`, hours.st);
      pushFormula(cells, `${col}${otRow}`, hours.ot);
      pushFormula(cells, `${col}${dtRow}`, hours.dt);
      pushNum(cells, `${col}${pdRow}`, plug.pd);
    });

    laborBlocks.push({ start: titleRow, end: pdRow });
    excelRow += LABOR_BLOCK_HEIGHT;
  }

  const planned: Array<{ row: CraftRow; night: boolean }> = [];
  for (const row of live) {
    if (rowHasDayBlock(row)) planned.push({ row, night: false });
    if (rowHasNightBlock(row)) planned.push({ row, night: true });
    if (!rowHasDayBlock(row) && !rowHasNightBlock(row)) planned.push({ row, night: false });
  }
  planned.forEach((item, index) => {
    emitBlock(item.row, item.night);
    if (index < planned.length - 1) {
      spacerRows.push(excelRow);
      excelRow += 1;
    }
  });

  const totalRow = excelRow;
  pushText(cells, `A${totalRow}`, "TOTAL");
  if (titleRows.length) {
    pushFormula(cells, `B${totalRow}`, `SUM(${titleRows.map((row) => `B${row}`).join(",")})`);
    pushFormula(cells, `D${totalRow}`, `SUM(${pdMoneyRows.map((row) => `D${row}`).join(",")})`);
    pushFormula(cells, `G${totalRow}`, `SUM(${titleRows.map((row) => `G${row}`).join(",")})`);
    pushFormula(cells, `H${totalRow}`, `SUM(${titleRows.map((row) => `H${row}`).join(",")})`);
    pushFormula(cells, `I${totalRow}`, `SUM(${titleRows.map((row) => `I${row}`).join(",")})`);
    pushFormula(cells, `J${totalRow}`, `SUM(${titleRows.map((row) => `J${row}`).join(",")})`);
    pushFormula(cells, `K${totalRow}`, `SUM(${titleRows.map((row) => `K${row}`).join(",")})`);
  } else {
    pushNum(cells, `B${totalRow}`, 0);
    pushNum(cells, `D${totalRow}`, 0);
    pushNum(cells, `K${totalRow}`, 0);
  }

  const weekendCols = dates
    .map((ymd, index) => {
      const dow = parseYmd(ymd)?.getDay();
      if (dow !== 0 && dow !== 6) return null;
      return { col: LABOR_DATE_START_COL + index, weekday: dow as 0 | 6 };
    })
    .filter((item): item is { col: number; weekday: 0 | 6 } => Boolean(item));

  return {
    name,
    cells,
    laborTotal: `K${totalRow}`,
    pdTotal: `D${totalRow}`,
    hoursTotal: `B${totalRow}`,
    sheetTotal: `K${totalRow}`,
    hiddenCols: [LABOR_BLOCK_ID_COL],
    weekendCols,
    laborBlocks,
    spacerRows,
    merges: [`A1:${lastDateCol || "K"}1`, "A2:K2", "A3:K3"],
  };
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
  ["Item", "Period", "Qty", "Periods", "Rate $", "Freight $", "Cost $", "Total $"].forEach((label, index) => {
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
    pushFormula(cells, `H${excelRow}`, `G${excelRow}*${1 + commercialMarkupRate(input.client, input.site)}`);
  });
  const first = 7;
  const last = 6 + live.length;
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${totalRow}`, `SUM(H${first}:H${last})`);
  return { name, cells, costTotal: `G${totalRow}`, sheetTotal: `G${totalRow}` };
}

function buildCoeSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const live = (input.equipment?.largeTools ?? []).filter(liveLargeTool);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Item", "Period", "Qty", "Periods", "Rate $", "Freight $", "Total $"].forEach((label, index) => {
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
  ["Kind", "Travelers", "Miles", "$ / mile", "Total $"].forEach((label, index) => {
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
  ["Item", "Description", "Qty", "Each $", "Total $"].forEach((label, index) => {
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
  ["Vendor", "Scope", "Qty", "Rate $", "Affiliate", "Cost $", "Markup $", "Total $"].forEach((label, index) => {
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
    pushFormula(cells, `G${excelRow}`, line.affiliate ? "0" : `F${excelRow}*${commercialMarkupRate(input.client, input.site)}`);
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
    pushFormula(cells, `G${excelRow}`, card.affiliate ? "0" : `F${excelRow}*${commercialMarkupRate(input.client, input.site)}`);
    pushFormula(cells, `H${excelRow}`, `F${excelRow}+G${excelRow}`);
    excelRow += 1;
  }
  const first = 7;
  const last = excelRow - 1;
  pushText(cells, `A${excelRow}`, "ESTIMATE TOTAL $");
  pushFormula(cells, `F${excelRow}`, `SUM(F${first}:F${last})`);
  pushFormula(cells, `G${excelRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${excelRow}`, `SUM(H${first}:H${last})`);
  return {
    name: ESTIMATE_XLSX_SHEETS.sub,
    cells,
    costTotal: `F${excelRow}`,
    markupTotal: `G${excelRow}`,
    sheetTotal: `H${excelRow}`,
  };
}

function addSummaryLine(
  cells: SheetCell[],
  row: number,
  label: string,
  amount: string | null,
  hours: string | null = null,
) {
  pushText(cells, `A${row}`, label);
  if (amount) pushFormula(cells, `B${row}`, amount);
  if (hours) pushFormula(cells, `C${row}`, hours);
  return amount ? `B${row}` : null;
}

function addSummaryHours(cells: SheetCell[], row: number, label: string, hours: string) {
  pushText(cells, `A${row}`, label);
  pushFormula(cells, `C${row}`, hours);
  return `C${row}`;
}

function addSummaryAmount(cells: SheetCell[], row: number, label: string, amount: number | string) {
  pushText(cells, `A${row}`, label);
  if (typeof amount === "number") pushNum(cells, `B${row}`, amount);
  else pushFormula(cells, `B${row}`, amount);
  return `B${row}`;
}

function jobMoneyFrom(input: EstimateXlsxInput) {
  return hydrateJobMoney(input.jobMeta);
}

function buildSummary(input: EstimateXlsxInput, built: BuiltSheet[]): BuiltSheet {
  const cells = headerCells(input);
  pushText(cells, "A6", "Rollup line");
  pushText(cells, "B6", ESTIMATE_SUMMARY_AMOUNT);
  pushText(cells, "C6", ESTIMATE_SUMMARY_HOURS);
  const byName = new Map(built.map((sheet) => [xlsxName(sheet.name), sheet]));
  const moneyRefs: string[] = [];
  const hourRefs: string[] = [];
  let row = 7;

  const laborSheets: Array<[string, string]> = [
    ["Staff labor $", ESTIMATE_XLSX_SHEETS.staff],
    ["Foremen labor $", ESTIMATE_XLSX_SHEETS.foremen],
    ["Direct labor $", ESTIMATE_XLSX_SHEETS.direct],
    ["Support labor $", ESTIMATE_XLSX_SHEETS.support],
  ];
  const laborRefs: string[] = [];
  for (const [label, name] of laborSheets) {
    const sheet = byName.get(xlsxName(name));
    if (!sheet?.laborTotal) continue;
    const hours = sheet.hoursTotal ? sheetRef(name, sheet.hoursTotal) : null;
    const ref = addSummaryLine(cells, row, label, sheetRef(name, sheet.laborTotal), hours);
    if (ref) laborRefs.push(ref);
    if (hours) hourRefs.push(`C${row}`);
    row += 1;
  }
  if (laborRefs.length) {
    const ref = addSummaryLine(
      cells,
      row,
      "Labor $",
      `SUM(${laborRefs.join(",")})`,
      hourRefs.length ? `SUM(${hourRefs.join(",")})` : null,
    );
    if (ref) moneyRefs.push(ref);
    row += 1;
  }

  const pdSheets = laborSheets
    .map(([, name]) => {
      const sheet = byName.get(xlsxName(name));
      return sheet?.pdTotal ? sheetRef(name, sheet.pdTotal) : "";
    })
    .filter(Boolean);
  if (pdSheets.length) {
    const ref = addSummaryLine(cells, row, "Per diem $", pdSheets.length === 1 ? pdSheets[0] : `SUM(${pdSheets.join(",")})`);
    if (ref) moneyRefs.push(ref);
    row += 1;
  }

  if (hourRefs.length) {
    addSummaryHours(cells, row, ESTIMATE_HOURS_LINE, `SUM(${hourRefs.join(",")})`);
    row += 1;
  }

  const extra: Array<[string, string]> = [
    ["Staff travel $", ESTIMATE_XLSX_SHEETS.travel],
    ["Misc $", ESTIMATE_XLSX_SHEETS.misc],
    ["Equipment rental $", ESTIMATE_XLSX_SHEETS.rental],
    ["Tensioning / torquing $", ESTIMATE_XLSX_SHEETS.tension],
    ["Crane rental $", ESTIMATE_XLSX_SHEETS.crane],
    ["COE $", ESTIMATE_XLSX_SHEETS.coe],
    ["Subcontractor $", ESTIMATE_XLSX_SHEETS.sub],
  ];
  const extraRefs = new Map<string, string>();
  let subCostRef: string | null = null;
  for (const [label, name] of extra) {
    const sheet = byName.get(xlsxName(name));
    const total =
      name === ESTIMATE_XLSX_SHEETS.sub
        ? (sheet?.sheetTotal ?? sheet?.costTotal)
        : (sheet?.costTotal ?? sheet?.sheetTotal);
    if (!sheet || !total) continue;
    const ref = addSummaryLine(cells, row, label, sheetRef(name, total));
    if (ref) {
      moneyRefs.push(ref);
      extraRefs.set(label, ref);
    }
    if (name === ESTIMATE_XLSX_SHEETS.sub && sheet.costTotal) {
      subCostRef = sheetRef(name, sheet.costTotal);
    }
    row += 1;
  }

  const money = jobMoneyFrom(input);
  const laborCell = cells.find((cell) => cell.type === "text" && cell.value === "Labor $");
  const laborAmountRef = laborCell ? `B${laborCell.ref.slice(1)}` : null;
  const equipmentRefs = ["Equipment rental $", "Tensioning / torquing $", "Crane rental $", "COE $"]
    .map((label) => extraRefs.get(label))
    .filter((ref): ref is string => Boolean(ref));
  const subRef = extraRefs.get("Subcontractor $");
  const subContingencyBase = subCostRef ?? subRef;

  const site = input.site ?? "";
  const client = input.client ?? "";
  const cba = cbaIncreaseDollars(input.crew ?? {}, money, site, client, wageLookupOpts(site));
  const more = moreFundDollars(input.crew ?? {}, money.moreFundPerHour, site, client);
  const adders = moneyAdderLines({
    labor: 0,
    equipment: 0,
    subcontractor: 0,
    money,
    cbaIncrease: cba,
    moreFund: more,
  });
  let cbaRef: string | null = null;
  if (adders.cbaIncrease) {
    cbaRef = addSummaryAmount(cells, row, CBA_INCREASE_LABEL, adders.cbaIncrease);
    moneyRefs.push(cbaRef);
    row += 1;
  }

  if (laborAmountRef && money.laborContingencyPct > 0) {
    const base = cbaRef ? `(${laborAmountRef}+${cbaRef})` : laborAmountRef;
    moneyRefs.push(addSummaryAmount(cells, row, LABOR_CONTINGENCY_LABEL, `${base}*${money.laborContingencyPct / 100}`));
    row += 1;
  }
  if (equipmentRefs.length && money.equipmentContingencyPct > 0) {
    const base = equipmentRefs.length === 1 ? equipmentRefs[0] : `SUM(${equipmentRefs.join(",")})`;
    moneyRefs.push(addSummaryAmount(cells, row, EQUIPMENT_CONTINGENCY_LABEL, `${base}*${money.equipmentContingencyPct / 100}`));
    row += 1;
  }
  if (subContingencyBase && money.subsContingencyPct > 0) {
    moneyRefs.push(addSummaryAmount(cells, row, SUBS_CONTINGENCY_LABEL, `${subContingencyBase}*${money.subsContingencyPct / 100}`));
    row += 1;
  }
  if (adders.moreFund) {
    moneyRefs.push(addSummaryAmount(cells, row, MORE_FUND_LABEL, adders.moreFund));
    row += 1;
  }

  const thirdPartyCostTotal = (input.equipment?.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const miscTotal = (input.otherCost?.misc ?? []).reduce((sum, line) => sum + miscAmount(line), 0);
  const subSheet = input.subcontractor ?? emptySubSheet();
  const markup = estimateMarkupDollars({
    subcontractor: 0,
    thirdParty: thirdPartyCostTotal,
    misc: miscTotal,
    client,
    site,
  });
  if (markup) {
    moneyRefs.push(addSummaryAmount(cells, row, commercialMarkupLabel(client, site), markup));
    row += 1;
  }
  const totalRow = row + 1;
  pushText(cells, `A${totalRow}`, "ESTIMATE TOTAL $");
  if (moneyRefs.length) pushFormula(cells, `B${totalRow}`, `SUM(${moneyRefs.join(",")})`);
  else pushNum(cells, `B${totalRow}`, 0);
  if (hourRefs.length) pushFormula(cells, `C${totalRow}`, `SUM(${hourRefs.join(",")})`);

  return {
    name: ESTIMATE_XLSX_SHEETS.summary,
    cells,
    sheetTotal: `B${totalRow}`,
    merges: ["A1:C1", "A2:C2", "A3:C3"],
  };
}

/** Optional tabs. Header-only / leftover $0 catalog rows never create these. */
export const OPTIONAL_ESTIMATE_SHEETS = [
  ESTIMATE_XLSX_SHEETS.staff,
  ESTIMATE_XLSX_SHEETS.foremen,
  ESTIMATE_XLSX_SHEETS.direct,
  ESTIMATE_XLSX_SHEETS.support,
  ESTIMATE_XLSX_SHEETS.rental,
  ESTIMATE_XLSX_SHEETS.tension,
  ESTIMATE_XLSX_SHEETS.crane,
  ESTIMATE_XLSX_SHEETS.sub,
  ESTIMATE_XLSX_SHEETS.coe,
  ESTIMATE_XLSX_SHEETS.travel,
  ESTIMATE_XLSX_SHEETS.misc,
  ESTIMATE_XLSX_SHEETS.rates,
] as const;

/** Summary always. Optional tabs only when that category has live rows. */
export function buildEstimateWorkbook(input: EstimateXlsxInput = {}): WorkbookSheet[] {
  const keys = usedRateKeys(input.crew);
  const rates = buildRateSheet(input, keys);
  const staffCardRows = (input.crew?.staff ?? []).map((row) => withLaneClock(row, "staff"));
  const gfRows = input.crew?.generalForeman ?? [];
  const staff = buildCrewSheet(
    input,
    ESTIMATE_XLSX_SHEETS.staff,
    [...staffCardRows, ...gfRows],
    keys,
    () => true,
  );
  const foremen = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.foremen, input.crew?.foreman ?? [], keys, () => false);
  const direct = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.direct, input.crew?.direct ?? [], keys, () => false);
  const support = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.support, input.crew?.support ?? [], keys, () => false);
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
  const body = [staff, foremen, direct, support, rental, tension, crane, sub, coe, staffTravel, misc, rates]
    .filter((sheet): sheet is BuiltSheet => Boolean(sheet))
    .map((sheet) => ({ ...sheet, name: xlsxName(sheet.name) }));
  return [{ ...buildSummary(input, body), name: xlsxName(ESTIMATE_XLSX_SHEETS.summary) }, ...body];
}

export async function estimateToXlsx(input: EstimateXlsxInput = {}): Promise<Uint8Array> {
  const sheets = buildEstimateWorkbook(input);
  if (!sheets.length) throw new Error("empty-workbook");
  const bytes = await buildWorkbook(sheets);
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}
