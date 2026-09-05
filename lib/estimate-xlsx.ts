/**
 * Desk estimate → Excel workbook.
 * Wood River / CAT 2 familiarity is an explicit constraint: same labor sheet
 * names and itemized position blocks. Workbook Staff = desk Staff + GF & above.
 * Foremen / Direct / Support stay their own sheets. Desk cards stay the five
 * cards (Staff / GF / Foreman / Direct / Support) — this file does not invent
 * a new crew presentation. PD stays off Labor TM $. Labor sheets keep the
 * CAT 2 daily itemized grid (date row from col K, 7-row HC/HPS/ST/OT/DT/PD
 * blocks, DAYSHIFT / NIGHTSHIFT). PD is a daily people-count row (live-pack
 * perDiemPeople / nightPerDiemPeople) — same calendar idea as HC, not hours.
 * Shift + Position + ST/OT/DT/PD hrs + Labor $ merge
 * down the block void and center — one value, not duplicated on detail rows.
 * Hours/shift and PD count stay off the Shift column (Type + PD # carry that).
 * Support shows live-pack Bill as under Position in column B (same rate title
 * as Rate Tables). Subtotal $ / Rate merge title through HC/HPS; ST/OT/DT/PD
 * stay per-row. That grid is the stable client edit surface
 * for import. Position dropdowns + workbook import write the live pack
 * (excel-ripple.ts). Hidden block-id column keys the importer. Polish,
 * repair-safe package, and $ vs MH labels only. ORG Chart is a later
 * separate export — not in this workbook.
 * Slicer Hrs (IPS / P6 dump) is not in this workbook.
 * Empty category sheets are omitted — leftover $0 / untitled rows do not
 * create a blank Crane Rental, Subcontractor, tension, rental, COE, travel,
 * misc, or labor tab. Only sheets with live rows for that estimate.
 * Rate Tables lists used crafts plus live Large tools (Shahan COE dry/wet
 * rates) and live third-party rentals from the same catalogs the desk uses.
 * A category with no live lines is omitted; dollars are never invented.
 * Subcontractor tab is all subs (not crane-only). Summary Subs $ is desk
 * Subs ESTIMATE TOTAL (cost + affiliate-aware 6.5%). Weekend columns on
 * labor grids are shaded. Daily ST/OT/DT cells are live HC×HPS formulas
 * (OT-after-N / Sunday DT / Saturday OT / weekly-40 via prior ST cells).
 * Job setup OT-after-8 is baked at export. CA 7th-day DT is not in the day
 * formula this pass. ST/OT/DT Rate cells INDEX/MATCH the live Position
 * (or Support Bill as) against Rate Tables. Summary ESTIMATE TOTAL $ is the same
 * deskPackageTotal / estimateTotalBreakdown number as the Estimate Total rail.
 * Standing ripple rule (Robert 2026-09-04, RETROACTIVE — see excel-ripple.ts):
 * applies to Look chrome already on this branch and earlier Excel/desk
 * paths, not only new asks. Every change updates the live estimate pack
 * and every surface (desk totals, export/edit, Rate Tables, fills, Misc,
 * Equipment/COE). Excel is a view of the live estimate pack — never a
 * parallel book. No Excel-only catalogs or hard-coded dollars. Crew, misc,
 * equipment, subs, and totals come from the same shared libs the desk uses
 * (other-cost, equipment-sheet, estimate-total). A Misc / rod-weight change
 * on the desk must appear in the next export of that pack. Chrome
 * (xlsx-exceljs) must not invent money.
 * Labor phase bar (rows 4–5 above the date row) is Job setup ON phases from
 * phase-schedule (start/stop per phase) — not hard-coded sample dates.
 * This Look pass paints that bar as a view only. Adjustable Job setup card
 * + Position / hour / Bill as import ships on this compile (excel-ripple.ts).
 * Phase-bar day/night hour chips stay parked after this next Excel compile.
 * Never commit source workbooks to git (Look samples excepted).
 */

import type { CalendarRange, CraftRow, CraftShift, SupportLine } from "./craft-labor.ts";
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
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { commercialMarkupLabel, commercialMarkupRate, estimateMarkupDollars } from "./estimate-total.ts";
import {
  boundOtLabel,
  clockTitle,
  computeRangeHours,
  eastCoastCraftOtAfter8,
  mondayKey,
  parseYmd,
  runningClock,
  type ClockOverride,
  type RunningClock,
} from "./hours-clock.ts";
import { defaultLaborClass, type LaborClass } from "./labor-class.ts";
import { miscAmount, travelAmount, type OtherCostSheet, type TravelLine } from "./other-cost.ts";
import {
  eachYmd,
  liveJobSetupPhases,
  mergeSchedule,
  PHASE_IDS,
  PHASE_NAMES,
  PHASE_OT_PICKS,
  phaseBarRuns,
  phaseOtPick,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import { SUPPORT_BILLED_AS_TITLES } from "./crew-lanes.ts";
import {
  hasShahanBillRate,
  isShahanCostPlus,
  lookupShahanEquipment,
  lookupShahanLabor,
  SHAHAN_CRAFT_TITLES,
  SHAHAN_FOREMAN_TITLES,
  SHAHAN_GENERAL_FOREMAN_TITLES,
  SHAHAN_NO_RATE_LABEL,
  SHAHAN_STAFF_TITLES,
  SHAHAN_SUPPORT_TITLES,
  shahanCrewTitle,
  shahanPeriodRate,
  type JobRates,
  type ShahanLaborRow,
} from "./shahan-wood-river.ts";
import {
  hasThirdPartyPeriodRate,
  lookupThirdPartyRental,
  thirdPartyRentalPeriodRate,
} from "./third-party-rental.ts";
import { emptySubSheet, lineAmount, subCardTotal, type SubSheet } from "./subcontractor.ts";
import { lookupCompWageRow, wageLookupOpts } from "./wage-lookup.ts";
import { summaryAmountAt } from "./xlsx-eval.ts";
import { buildWorkbook, colLetter, excelSafeSheetName, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

export { EXCEL_JOB_SETUP_IMPORT_PARKED, EXCEL_RIPPLE_RETROACTIVE, EXCEL_RIPPLE_RULE } from "./excel-ripple.ts";
export const ESTIMATE_EXPORT_ERROR = "Could not export. Try again.";
export const ESTIMATE_IMPORT_ERROR = "Could not import that workbook. Use a Hit Squad export.";
export const ESTIMATE_EXPORT_PRODUCER = "Produced by Hit Squad Project Controls";
export const ESTIMATE_EXPORT_BRAND = "HIT SQUAD / PROJECT CONTROLS";
export const ESTIMATE_EXPORT_CONFIDENTIAL = "Confidential estimate package";
export const ESTIMATE_SUMMARY_AMOUNT = "Amount $";
export const ESTIMATE_SUMMARY_HOURS = "Man-hours (MH)";
export const ESTIMATE_HOURS_LINE = "Man-hours";
export const RATE_TOOLS_SECTION = "Large tools (COE / dry rates)";
export const RATE_RENTAL_SECTION = "Third-party rental";
/** First day-grid column after the A–J instrument (Shift sits next to Position). */
export const LABOR_DATE_START_COL = 11;
export const LABOR_INSTRUMENT_LAST_COL = 10;
/** Two short rows above the date header — live Job setup phase band. */
export const LABOR_PHASE_ROW = 4;
export const LABOR_PHASE_ROW_END = 5;
export const LABOR_PHASE_LABEL = "Phase";
/** Two-letter weekday over the date number (row 5 / row 6). */
export const LABOR_WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
export const LABOR_BLOCK_HEIGHT = 7;
/** Full job window. 90 days truncated Aromatics and understated desk totals. */
export const LABOR_MAX_DAYS = 400;
export const LABOR_HPS_LABEL = "Hours/shift";
export const LABOR_DAYSHIFT = "DAYSHIFT";
export const LABOR_NIGHTSHIFT = "NIGHTSHIFT";
export const LABOR_HC_LABEL = "HC";
export const LABOR_HPS_TYPE = "HPS";
/** Kept for desk/source lock — not written on craft Shift. Type chip + PD # carry it. */
export const LABOR_PD_COUNT_LABEL = "PD count";
/** J header: daily PD people-days, not hours. */
export const LABOR_PD_HEADER = "PD #";
export const LABOR_PD_TYPE = "PD";
/** Type chip on the position header row is omitted — the Position name is the title. */
export const LABOR_TITLE_TYPE = "";
export const LABOR_TYPE_ORDER = ["HC", "HPS", "ST", "OT", "DT", "PD"] as const;
/** Hidden column after the longest calendar so the importer can key blocks. */
export const LABOR_BLOCK_ID_COL = LABOR_DATE_START_COL + LABOR_MAX_DAYS;
export const LABOR_TITLE_OFFSET = 0;
export const LABOR_HC_OFFSET = 1;
export const LABOR_HPS_OFFSET = 2;
export const LABOR_ST_OFFSET = 3;
export const LABOR_OT_OFFSET = 4;
export const LABOR_DT_OFFSET = 5;
export const LABOR_PD_OFFSET = 6;
/** Shift + Position + ST/OT/DT/PD hrs + Labor $ — one value centered in the block void. */
export const LABOR_BLOCK_VOID_COLS = ["A", "B", "F", "G", "H", "I", "J"] as const;
export const LABOR_HOUR_VOID_COLS = ["F", "G", "H", "I", "J"] as const;
/** Subtotal $ + Rate — title through HPS so HC/HPS are not empty holes. */
export const LABOR_TITLE_BAND_COLS = ["C", "D"] as const;
/** Support-only field under Position. Live pack `billedAs` — dropdown + import round-trip. */
export const LABOR_BILL_AS_LABEL = "Bill as";

export function laborBlockVoidMerges(
  blocks: ReadonlyArray<{ start: number; end: number }>,
  opts: { billAs?: boolean } = {},
): string[] {
  return blocks.flatMap((block) => {
    const hours = LABOR_HOUR_VOID_COLS.map((col) => `${col}${block.start}:${col}${block.end}`);
    const shift = `A${block.start}:A${block.end}`;
    const titleBand = LABOR_TITLE_BAND_COLS.map(
      (col) => `${col}${block.start}:${col}${block.start + LABOR_HPS_OFFSET}`,
    );
    if (!opts.billAs) return [shift, `B${block.start}:B${block.end}`, ...titleBand, ...hours];
    const title = block.start;
    const hps = block.start + LABOR_HPS_OFFSET;
    const ot = block.start + LABOR_OT_OFFSET;
    return [shift, `B${title}:B${hps}`, `B${ot}:B${block.end}`, ...titleBand, ...hours];
  });
}

export const ESTIMATE_XLSX_SHEETS = {
  summary: "Summary Page",
  jobSetup: "Job setup",
  lists: "_Lists",
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
  support?: SupportLine[];
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
  changeOrders?: number;
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

/** Visible Bill as — catalog craft name when the pack billedAs hits Rate Tables. */
function billAsDisplay(row: CraftRow & { billedAs?: string }, site = ""): string {
  const billed = (row.billedAs ?? "").trim();
  if (!billed) return "";
  const title = shahanCrewTitle(row);
  return billedRow(title, site, rowLaborClass(row))?.craftName?.trim() || billed;
}

function wageRow(title: string, site = "", laborClass?: LaborClass | null): ShahanLaborRow | null {
  return lookupCompWageRow(title, site, laborClass);
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

function rateCraftLabel(key: RateKey) {
  return key.title.trim();
}

/** Used crew keys first, then every Position / Bill as dropdown title. Column A matches the lists exactly. */
function rateCatalogKeys(used: RateKey[]): RateKey[] {
  const seen = new Set<string>();
  const next: RateKey[] = [];
  const add = (key: RateKey) => {
    const title = key.title.trim();
    if (!title || seen.has(title)) return;
    seen.add(title);
    next.push({ title, laborClass: key.laborClass });
  };
  for (const key of used) add(key);
  for (const title of uniqueTitles([
    ...SHAHAN_STAFF_TITLES,
    ...SHAHAN_GENERAL_FOREMAN_TITLES,
    ...SHAHAN_FOREMAN_TITLES,
    ...SHAHAN_CRAFT_TITLES,
    ...SUPPORT_BILLED_AS_TITLES,
  ])) {
    add({ title, laborClass: defaultLaborClass(title) });
  }
  return next;
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

function pushRate(cells: SheetCell[], ref: string, value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) pushNum(cells, ref, value);
}

function thirdPartyBucket(item: string): "tension" | "crane" | "rental" {
  const hay = item.toLowerCase();
  if (/tension|torqu|rad gun/.test(hay)) return "tension";
  if (/\bcrane\b|carry deck/.test(hay)) return "crane";
  return "rental";
}

function usedLargeTools(input: EstimateXlsxInput): LargeToolLine[] {
  const seen = new Set<string>();
  const rows: LargeToolLine[] = [];
  for (const line of input.equipment?.largeTools ?? []) {
    if (!liveLargeTool(line) || seen.has(line.itemId)) continue;
    seen.add(line.itemId);
    rows.push(line);
  }
  return rows;
}

function usedThirdParty(input: EstimateXlsxInput): ThirdPartyLine[] {
  const seen = new Set<string>();
  const rows: ThirdPartyLine[] = [];
  for (const line of input.equipment?.thirdParty ?? []) {
    const name = line.item.trim();
    if (!liveThirdParty(line) || seen.has(name)) continue;
    seen.add(name);
    rows.push(line);
  }
  return rows;
}

function writeRateSection(
  cells: SheetCell[],
  row: number,
  title: string,
  headers: string[],
): { headerRow: number; next: number } {
  pushText(cells, `A${row}`, title);
  const headerRow = row + 1;
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}${headerRow}`, label));
  return { headerRow, next: headerRow + 1 };
}

function buildRateSheet(input: EstimateXlsxInput, keys: RateKey[]): BuiltSheet | null {
  const tools = usedLargeTools(input);
  const rentals = usedThirdParty(input);
  if (!keys.length && !tools.length && !rentals.length) return null;
  const cells = headerCells(input);
  const headerRows: number[] = [];
  const lastCol = "F";
  const merges = [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`];
  if (keys.length) {
    headerRows.push(6);
    const headers = ["Craft", "COMP BW $", "ST Bill $", "OT Bill $", "DT Bill $", "PD Rate"];
    headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  }
  const site = input.site ?? "";
  keys.forEach((key, index) => {
    const excelRow = 7 + index;
    const billed = billedRow(key.title, site, key.laborClass);
    const wage = wageRow(key.title, site, key.laborClass);
    pushText(cells, `A${excelRow}`, rateCraftLabel(key));
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
  let excelRow = keys.length ? 7 + keys.length : 6;
  if (tools.length) {
    if (keys.length) excelRow += 1;
    const section = writeRateSection(cells, excelRow, RATE_TOOLS_SECTION, [
      "Item",
      "Fuel",
      "Daily $",
      "Weekly $",
      "Monthly $",
      "Notes",
    ]);
    merges.push(`A${excelRow}:${lastCol}${excelRow}`);
    headerRows.push(section.headerRow);
    excelRow = section.next;
    for (const line of tools) {
      const item = lookupShahanEquipment(line.itemId);
      pushText(cells, `A${excelRow}`, item?.description || line.itemId);
      pushText(cells, `B${excelRow}`, item ? (item.wet ? "Wet" : "Dry") : "");
      if (item) {
        pushRate(cells, `C${excelRow}`, shahanPeriodRate(item, "daily"));
        pushRate(cells, `D${excelRow}`, shahanPeriodRate(item, "weekly"));
        pushRate(cells, `E${excelRow}`, shahanPeriodRate(item, "monthly"));
      }
      if (item && isShahanCostPlus(item)) pushText(cells, `F${excelRow}`, "Cost + 6%");
      excelRow += 1;
    }
  }
  if (rentals.length) {
    if (keys.length || tools.length) excelRow += 1;
    const markup = commercialMarkupRate(input.client, input.site);
    const section = writeRateSection(cells, excelRow, RATE_RENTAL_SECTION, [
      "Item",
      "Daily $",
      "Weekly $",
      "Monthly $",
      "Freight $",
      "Markup %",
    ]);
    merges.push(`A${excelRow}:${lastCol}${excelRow}`);
    headerRows.push(section.headerRow);
    excelRow = section.next;
    for (const line of rentals) {
      const catalog = lookupThirdPartyRental(line.item);
      pushText(cells, `A${excelRow}`, line.item);
      if (catalog) {
        if (hasThirdPartyPeriodRate(catalog, "daily")) {
          pushRate(cells, `B${excelRow}`, thirdPartyRentalPeriodRate(catalog, "daily"));
        }
        if (hasThirdPartyPeriodRate(catalog, "weekly")) {
          pushRate(cells, `C${excelRow}`, thirdPartyRentalPeriodRate(catalog, "weekly"));
        }
        if (hasThirdPartyPeriodRate(catalog, "monthly")) {
          pushRate(cells, `D${excelRow}`, thirdPartyRentalPeriodRate(catalog, "monthly"));
        }
        if (catalog.freight > 0) pushNum(cells, `E${excelRow}`, catalog.freight);
      } else if (line.rate > 0) {
        const col = line.period === "daily" ? "B" : line.period === "weekly" ? "C" : "D";
        pushRate(cells, `${col}${excelRow}`, line.rate);
        if (line.freight > 0) pushNum(cells, `E${excelRow}`, line.freight);
      }
      if (markup > 0) cells.push({ ref: `F${excelRow}`, type: "number", value: markup });
      excelRow += 1;
    }
  }
  return { name: ESTIMATE_XLSX_SHEETS.rates, cells, merges, headerRows };
}

function rateLookupFormula(lookupExpr: string, col: string, lastRow: number) {
  if (lastRow < 7) return `"${SHAHAN_NO_RATE_LABEL}"`;
  const sheet = quoteSheet(xlsxName(ESTIMATE_XLSX_SHEETS.rates));
  const titleRange = `${sheet}!A$7:A$${lastRow}`;
  const valueRange = `${sheet}!${col}$7:${col}$${lastRow}`;
  return `IF(TRIM(${lookupExpr})="","${SHAHAN_NO_RATE_LABEL}",IFERROR(INDEX(${valueRange},MATCH(${lookupExpr},${titleRange},0)),"${SHAHAN_NO_RATE_LABEL}"))`;
}

function mondayStamp(ymd: string) {
  const date = parseYmd(ymd);
  return date ? mondayKey(date) : ymd;
}

function excelBlockClock(row: CraftRow, input: EstimateXlsxInput): RunningClock {
  return runningClock(
    clockTitle(row.position, row.billedAs ?? ""),
    input.site ?? "",
    input.client ?? "",
    row.clockOverride === "comp" ? "comp" : "auto",
    input.plantCode ?? "",
  );
}

function rangeWeekKey(range: CalendarRange | undefined) {
  if (!range) return "";
  return range.id || `${range.phaseId ?? ""}|${range.start ?? ""}|${range.end ?? ""}`;
}

function dayOtAfter8(
  row: CraftRow,
  ymd: string,
  night: boolean,
  input: EstimateXlsxInput,
  clock: RunningClock,
) {
  const cover = coveringRanges(row, ymd, night)[0];
  const flagged = Boolean(cover?.otAfter8 ?? input.crew?.otAfter8);
  if (clock === "east-coast") return eastCoastCraftOtAfter8(cover?.phaseId, flagged);
  return flagged;
}

function dayHourFormulas(
  col: string,
  hcRow: number,
  hpsRow: number,
  clock: RunningClock,
  otAfter8: boolean,
  priorStRefs: string[],
): { st: string; ot: string; dt: string } {
  const hc = `${col}${hcRow}`;
  const hps = `${col}${hpsRow}`;
  const dateRef = `${col}$6`;
  const dow = `WEEKDAY(${dateRef},1)`;
  const none = `${hc}<=0`;
  let dailySt: string;
  let dailyOt: string;
  let dailyDt: string;
  if (clock === "ca-daily") {
    dailySt = `IF(${none},0,MIN(8,${hps})*${hc})`;
    dailyOt = `IF(${none},0,MIN(4,MAX(0,${hps}-8))*${hc})`;
    dailyDt = `IF(${none},0,MAX(0,${hps}-12)*${hc})`;
  } else if (clock === "staff") {
    const cap = otAfter8 ? "8" : "10";
    dailySt = `IF(${none},0,IF(${dow}=1,0,MIN(${cap},${hps})*${hc}))`;
    dailyOt = `IF(${none},0,IF(${dow}=1,0,MAX(0,${hps}-${cap})*${hc}))`;
    dailyDt = `IF(${none},0,IF(${dow}=1,${hc}*${hps},0))`;
  } else {
    const after8 = clock === "east-coast" ? otAfter8 : true;
    if (after8) {
      dailySt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,0,MIN(8,${hps})*${hc})))`;
      dailyOt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,${hc}*${hps},MAX(0,${hps}-8)*${hc})))`;
    } else {
      dailySt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,0,${hc}*${hps})))`;
      dailyOt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,${hc}*${hps},0)))`;
    }
    dailyDt = `IF(${none},0,IF(${dow}=1,${hc}*${hps},0))`;
  }
  const prior = priorStRefs.length ? priorStRefs.join("+") : "0";
  const room = `MAX(0,40*MAX(1,${hc})-(${prior}))`;
  return {
    st: `MIN(${dailySt},${room})`,
    ot: `${dailyOt}+((${dailySt})-MIN(${dailySt},${room}))`,
    dt: dailyDt,
  };
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

/** Per-day desk ST/OT/DT (each range + applyWeekly40). Used so export totals stay on the rail. */
function deskBlockDayHours(
  row: CraftRow,
  night: boolean,
  input: EstimateXlsxInput,
): Map<string, { st: number; ot: number; dt: number }> {
  const map = new Map<string, { st: number; ot: number; dt: number }>();
  const override = row.clockOverride === "comp" ? "comp" : "auto";
  for (const range of row.ranges ?? []) {
    if (range.off) continue;
    const shift = rangeShift(row, range);
    if (night && shift === "Days") continue;
    if (!night && shift === "Nights") continue;
    if (night && shift === "Days & nights" && !(Number(range.nightHeadcount) || 0)) continue;
    const nightsOnly = night && shift === "Nights";
    const hours = computeRangeHours({
      position: row.position,
      billedAs: row.billedAs,
      site: input.site ?? "",
      client: input.client ?? "",
      plantCode: input.plantCode ?? "",
      start: range.start,
      end: range.end,
      hoursPerShift: range.hoursPerShift,
      headcount: nightsOnly ? range.headcount : night ? range.nightHeadcount : range.headcount,
      nightHeadcount: 0,
      sundayHeadcount: night
        ? nightsOnly
          ? range.sundayHeadcount
          : (range.nightSundayHeadcount ?? range.sundayHeadcount)
        : range.sundayHeadcount,
      shift: night ? "Nights" : "Days",
      days: range.days,
      perDiemPeople: rangeDayPd(row, range, night),
      otAfter8: range.otAfter8 ?? input.crew?.otAfter8,
      phaseId: range.phaseId,
      clockOverride: override,
      skipDates: range.skipDates,
    });
    for (const day of hours.days) {
      const prev = map.get(day.date) ?? { st: 0, ot: 0, dt: 0 };
      map.set(day.date, {
        st: prev.st + day.st,
        ot: prev.ot + day.ot,
        dt: prev.dt + day.dt,
      });
    }
  }
  return map;
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

function writeWeekdayRow(cells: SheetCell[], dates: string[]) {
  dates.forEach((ymd, index) => {
    const date = parseYmd(ymd);
    const label = date ? LABOR_WEEKDAY_LABELS[date.getDay()] : "";
    pushText(cells, `${colLetter(LABOR_DATE_START_COL + index)}5`, label);
  });
}

function writePhaseBar(
  cells: SheetCell[],
  dates: string[],
  schedule: EstimateXlsxInput["schedule"],
): { merges: string[]; phaseBar: NonNullable<WorkbookSheet["phaseBar"]> } {
  const merges = [`A${LABOR_PHASE_ROW}:${colLetter(LABOR_INSTRUMENT_LAST_COL)}${LABOR_PHASE_ROW_END}`];
  pushText(cells, `A${LABOR_PHASE_ROW}`, LABOR_PHASE_LABEL);
  const runs = phaseBarRuns(dates, liveJobSetupPhases(schedule));
  const phaseBar = runs.map((run) => {
    const startCol = LABOR_DATE_START_COL + run.startIndex;
    const endCol = LABOR_DATE_START_COL + run.endIndex;
    const first = colLetter(startCol);
    const last = colLetter(endCol);
    pushText(cells, `${first}${LABOR_PHASE_ROW}`, PHASE_NAMES[run.phase.id] ?? run.phase.name);
    merges.push(`${first}${LABOR_PHASE_ROW}:${last}${LABOR_PHASE_ROW}`);
    return { startCol, endCol, phaseId: run.phase.id };
  });
  return { merges, phaseBar };
}

function buildCrewSheet(
  input: EstimateXlsxInput,
  name: string,
  rows: CraftRow[],
  keys: RateKey[],
  staffPdOf: (row: CraftRow) => boolean,
  lane: CrewLane = "craft",
  lastRateRow = 0,
): BuiltSheet | null {
  const live = liveCrewRows(rows).map((row) => withLaneClock(row, lane));
  if (!live.length) return null;
  const showBillAs = name === ESTIMATE_XLSX_SHEETS.support;
  const dates = laborCalendarDates(input);
  const lastDateCol = dates.length ? colLetter(LABOR_DATE_START_COL + dates.length - 1) : "";
  const cells = headerCells(input);
  const headers = [
    "Shift",
    "Position",
    "Subtotal $",
    "Rate",
    "Type",
    "ST Hrs",
    "OT Hrs",
    "DT Hrs",
    LABOR_PD_HEADER,
    "Labor $",
  ];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  writeDateRow(cells, dates);
  writeWeekdayRow(cells, dates);
  const phaseBand = writePhaseBar(cells, dates, input.schedule);

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

    const firstDate = dates.length ? colLetter(LABOR_DATE_START_COL) : "";
    const rateName = showBillAs ? `IF(TRIM(B${otRow})<>"",B${otRow},B${titleRow})` : `B${titleRow}`;
    const clock = excelBlockClock(row, input);
    const deskHours = deskBlockDayHours(row, night, input);

    const blockId = laborBlockId(row, night);
    const idCol = colLetter(LABOR_BLOCK_ID_COL);
    for (let offset = 0; offset < LABOR_BLOCK_HEIGHT; offset += 1) {
      pushText(cells, `${idCol}${excelRow + offset}`, blockId);
    }

    pushText(cells, `A${titleRow}`, night ? LABOR_NIGHTSHIFT : LABOR_DAYSHIFT);
    pushText(cells, `B${titleRow}`, row.position.trim());
    if (showBillAs) {
      pushText(cells, `B${stRow}`, LABOR_BILL_AS_LABEL);
      cells.push({ ref: `B${otRow}`, type: "text", value: billAsDisplay(row, input.site ?? "") });
    }
    pushFormula(cells, `C${titleRow}`, `J${titleRow}`);
    if (dates.length) {
      pushFormula(cells, `F${titleRow}`, `SUM(${firstDate}${stRow}:${lastDateCol}${stRow})`);
      pushFormula(cells, `G${titleRow}`, `SUM(${firstDate}${otRow}:${lastDateCol}${otRow})`);
      pushFormula(cells, `H${titleRow}`, `SUM(${firstDate}${dtRow}:${lastDateCol}${dtRow})`);
      pushFormula(cells, `I${titleRow}`, `SUM(${firstDate}${pdRow}:${lastDateCol}${pdRow})`);
    } else {
      pushNum(cells, `F${titleRow}`, 0);
      pushNum(cells, `G${titleRow}`, 0);
      pushNum(cells, `H${titleRow}`, 0);
      pushNum(cells, `I${titleRow}`, 0);
    }
    pushFormula(cells, `J${titleRow}`, `C${stRow}+C${otRow}+C${dtRow}`);

    pushText(cells, `E${hcRow}`, LABOR_HC_LABEL);
    pushText(cells, `E${hpsRow}`, LABOR_HPS_TYPE);
    pushText(cells, `E${stRow}`, "ST");
    pushText(cells, `E${otRow}`, "OT");
    pushText(cells, `E${dtRow}`, "DT");
    pushText(cells, `E${pdRow}`, LABOR_PD_TYPE);

    pushFormula(cells, `D${stRow}`, rateLookupFormula(rateName, "C", lastRateRow));
    pushFormula(cells, `D${otRow}`, rateLookupFormula(rateName, "D", lastRateRow));
    pushFormula(cells, `D${dtRow}`, rateLookupFormula(rateName, "E", lastRateRow));
    pushFormula(cells, `C${stRow}`, `F${titleRow}*N(D${stRow})`);
    pushFormula(cells, `C${otRow}`, `G${titleRow}*N(D${otRow})`);
    pushFormula(cells, `C${dtRow}`, `H${titleRow}*N(D${dtRow})`);
    pushNum(cells, `D${pdRow}`, pdRateFor(input, staffPdOf(row)));
    pushFormula(cells, `C${pdRow}`, `I${titleRow}*D${pdRow}`);
    dates.forEach((ymd, index) => {
      const col = colLetter(LABOR_DATE_START_COL + index);
      const plug = dayPlug(row, ymd, night);
      pushNum(cells, `${col}${hcRow}`, plug.hc);
      pushNum(cells, `${col}${hpsRow}`, plug.hps);
      const week = mondayStamp(ymd);
      const rangeKey = rangeWeekKey(coveringRanges(row, ymd, night)[0]);
      const priorStRefs = dates
        .slice(0, index)
        .map((stamp, prior) => ({ stamp, ref: `${colLetter(LABOR_DATE_START_COL + prior)}${stRow}` }))
        .filter((item) => mondayStamp(item.stamp) === week)
        .filter((item) => rangeWeekKey(coveringRanges(row, item.stamp, night)[0]) === rangeKey)
        .map((item) => item.ref);
      const hours = dayHourFormulas(col, hcRow, hpsRow, clock, dayOtAfter8(row, ymd, night, input, clock), priorStRefs);
      const desk = deskHours.get(ymd) ?? { st: 0, ot: 0, dt: 0 };
      const hcVal = money(plug.hc);
      const hpsVal = money(plug.hps);
      const exported = `AND(${col}${hcRow}=${hcVal},${col}${hpsRow}=${hpsVal})`;
      pushFormula(cells, `${col}${stRow}`, `IF(${exported},${desk.st},${hours.st})`);
      pushFormula(cells, `${col}${otRow}`, `IF(${exported},${desk.ot},${hours.ot})`);
      pushFormula(cells, `${col}${dtRow}`, `IF(${exported},${desk.dt},${hours.dt})`);
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
  const hoursRollup = `${colLetter(LABOR_BLOCK_ID_COL)}${totalRow}`;
  if (titleRows.length) {
    pushFormula(cells, `C${totalRow}`, `SUM(${pdMoneyRows.map((row) => `C${row}`).join(",")})`);
    pushFormula(cells, `F${totalRow}`, `SUM(${titleRows.map((row) => `F${row}`).join(",")})`);
    pushFormula(cells, `G${totalRow}`, `SUM(${titleRows.map((row) => `G${row}`).join(",")})`);
    pushFormula(cells, `H${totalRow}`, `SUM(${titleRows.map((row) => `H${row}`).join(",")})`);
    pushFormula(cells, `I${totalRow}`, `SUM(${titleRows.map((row) => `I${row}`).join(",")})`);
    pushFormula(cells, `J${totalRow}`, `SUM(${titleRows.map((row) => `J${row}`).join(",")})`);
    pushFormula(cells, hoursRollup, `F${totalRow}+G${totalRow}+H${totalRow}`);
  } else {
    pushNum(cells, `C${totalRow}`, 0);
    pushNum(cells, `F${totalRow}`, 0);
    pushNum(cells, `G${totalRow}`, 0);
    pushNum(cells, `H${totalRow}`, 0);
    pushNum(cells, `J${totalRow}`, 0);
    pushNum(cells, hoursRollup, 0);
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
    laborTotal: `J${totalRow}`,
    pdTotal: `C${totalRow}`,
    hoursTotal: hoursRollup,
    sheetTotal: `J${totalRow}`,
    hiddenCols: [LABOR_BLOCK_ID_COL],
    weekendCols,
    laborBlocks,
    spacerRows,
    phaseBar: phaseBand.phaseBar,
    billAs: showBillAs
      ? laborBlocks.map((block) => ({
          labelRow: block.start + LABOR_ST_OFFSET,
          valueRow: block.start + LABOR_OT_OFFSET,
        }))
      : undefined,
    validations: laborPositionValidations(name, laborBlocks, Boolean(showBillAs)),
    merges: [
      `A1:${lastDateCol || "J"}1`,
      `A2:${lastDateCol || "J"}2`,
      `A3:${lastDateCol || "J"}3`,
      ...phaseBand.merges,
      // Full title→PD range: HC/HPS sit between the summary and ST/OT/DT/PD rows.
      // Support splits B: Position (title–HPS) + Bill as value (OT–PD).
      ...laborBlockVoidMerges(laborBlocks, { billAs: showBillAs }),
    ],
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
  const changeOrders = Math.round((Number(input.changeOrders) || 0) * 100) / 100;
  if (changeOrders) {
    moneyRefs.push(addSummaryAmount(cells, row, "Change orders", changeOrders));
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

function listFormula(col: string, count: number) {
  return `=${ESTIMATE_XLSX_SHEETS.lists}!$${col}$1:$${col}$${Math.max(1, count)}`;
}

function laborPositionValidations(
  name: string,
  blocks: Array<{ start: number; end: number }>,
  billAs: boolean,
): Array<{ sqref: string; formulae: string[] }> {
  const col =
    name === ESTIMATE_XLSX_SHEETS.staff
      ? "A"
      : name === ESTIMATE_XLSX_SHEETS.foremen
        ? "B"
        : name === ESTIMATE_XLSX_SHEETS.direct
          ? "C"
          : "D";
  const count =
    name === ESTIMATE_XLSX_SHEETS.staff
      ? uniqueTitles([...SHAHAN_STAFF_TITLES, ...SHAHAN_GENERAL_FOREMAN_TITLES]).length
      : name === ESTIMATE_XLSX_SHEETS.foremen
        ? SHAHAN_FOREMAN_TITLES.length
        : name === ESTIMATE_XLSX_SHEETS.direct
          ? SHAHAN_CRAFT_TITLES.length
          : SHAHAN_SUPPORT_TITLES.length;
  const next = blocks.map((block) => ({
    sqref: `B${block.start}`,
    formulae: [listFormula(col, count)],
  }));
  if (billAs) {
    next.push(
      ...blocks.map((block) => ({
        sqref: `B${block.start + LABOR_OT_OFFSET}`,
        formulae: [listFormula("E", SUPPORT_BILLED_AS_TITLES.length)],
      })),
    );
  }
  return next;
}

function uniqueTitles(titles: readonly string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function buildListsSheet(): WorkbookSheet {
  const columns = [
    uniqueTitles([...SHAHAN_STAFF_TITLES, ...SHAHAN_GENERAL_FOREMAN_TITLES]),
    uniqueTitles(SHAHAN_FOREMAN_TITLES),
    uniqueTitles(SHAHAN_CRAFT_TITLES),
    uniqueTitles(SHAHAN_SUPPORT_TITLES),
    uniqueTitles(SUPPORT_BILLED_AS_TITLES),
    PHASE_OT_PICKS.map((pick) => pick.label),
  ];
  const cells: SheetCell[] = [];
  columns.forEach((list, index) => {
    const col = colLetter(index + 1);
    list.forEach((title, row) => pushText(cells, `${col}${row + 1}`, title));
  });
  return { name: ESTIMATE_XLSX_SHEETS.lists, cells, veryHidden: true };
}

function buildJobSetupSheet(input: EstimateXlsxInput): WorkbookSheet {
  const schedule = mergeSchedule(input.schedule);
  const cells = headerCells(input);
  const headers = ["Phase", "ON", "Start", "Stop", "Days/wk", "Hrs/day", "OT after 8", "OT pick"];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  const unlocked: Array<{ row: number; col: number }> = [];
  schedule.phases.forEach((row, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, row.name);
    pushText(cells, `B${excelRow}`, row.on ? "ON" : "OFF");
    const start = parseYmd(row.start);
    const stop = parseYmd(row.stop);
    if (start) cells.push({ ref: `C${excelRow}`, type: "date", value: start });
    if (stop) cells.push({ ref: `D${excelRow}`, type: "date", value: stop });
    pushNum(cells, `E${excelRow}`, row.daysPerWeek);
    pushNum(cells, `F${excelRow}`, row.hoursPerDay);
    pushText(cells, `G${excelRow}`, row.otAfter8 ? "YES" : "NO");
    const pick = phaseOtPick(row);
    if (pick) {
      const label = PHASE_OT_PICKS.find((item) => item.id === pick)?.label ?? "";
      pushText(cells, `H${excelRow}`, label);
    }
    pushText(cells, `I${excelRow}`, row.id);
    for (let col = 2; col <= 8; col += 1) unlocked.push({ row: excelRow, col });
  });
  return {
    name: ESTIMATE_XLSX_SHEETS.jobSetup,
    cells,
    hiddenCols: [9],
    unlocked,
    validations: PHASE_IDS.flatMap((id, index) => {
      if (id !== "pre" && id !== "post") return [];
      return [{ sqref: `H${7 + index}`, formulae: [listFormula("F", PHASE_OT_PICKS.length)] }];
    }),
    merges: ["A1:H1", "A2:H2", "A3:H3"],
  };
}

/** Summary always. Job setup + Position lists always (import compile). Optional tabs when live. */
export function buildEstimateWorkbook(input: EstimateXlsxInput = {}): WorkbookSheet[] {
  const used = usedRateKeys(input.crew);
  const keys = used.length ? rateCatalogKeys(used) : [];
  const lastRateRow = keys.length ? 6 + keys.length : 0;
  const rates = buildRateSheet(input, keys);
  const staffCardRows = (input.crew?.staff ?? []).map((row) => withLaneClock(row, "staff"));
  const gfRows = input.crew?.generalForeman ?? [];
  const staff = buildCrewSheet(
    input,
    ESTIMATE_XLSX_SHEETS.staff,
    [...staffCardRows, ...gfRows],
    keys,
    () => true,
    "staff",
    lastRateRow,
  );
  const foremen = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.foremen, input.crew?.foreman ?? [], keys, () => false, "craft", lastRateRow);
  const direct = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.direct, input.crew?.direct ?? [], keys, () => false, "craft", lastRateRow);
  const support = buildCrewSheet(input, ESTIMATE_XLSX_SHEETS.support, input.crew?.support ?? [], keys, () => false, "craft", lastRateRow);
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
  const setup = { ...buildJobSetupSheet(input), name: xlsxName(ESTIMATE_XLSX_SHEETS.jobSetup) };
  const lists = { ...buildListsSheet(), name: xlsxName(ESTIMATE_XLSX_SHEETS.lists) };
  return [{ ...buildSummary(input, body), name: xlsxName(ESTIMATE_XLSX_SHEETS.summary) }, setup, ...body, lists];
}

export async function estimateToXlsx(input: EstimateXlsxInput = {}): Promise<Uint8Array> {
  const sheets = buildEstimateWorkbook(input);
  if (!sheets.length) throw new Error("empty-workbook");
  const excel = summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "ESTIMATE TOTAL $");
  const desk = deskPackageTotal(input);
  if (excel == null || Math.round(excel * 100) / 100 !== desk) {
    throw new Error("summary-total-mismatch");
  }
  const bytes = await buildWorkbook(sheets);
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}
