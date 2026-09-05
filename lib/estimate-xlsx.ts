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
 * Shift + Position + ST/OT/DT/PD hrs merge
 * down the block void and center — one value, not duplicated on detail rows.
 * Subtotal $ is labor TM $ (ST+OT+DT). There is no second Labor $ column.
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
 * Subcontractor tab is all subs (not crane-only). Summary Subcontractor $ is
 * desk Subcontractor cost; affiliate-aware 6.5% sits on the markup line —
 * same split as the Estimate Total rail. Weekend columns on
 * labor grids are shaded. Daily ST/OT/DT cells are live HC×HPS formulas
 * (OT-after-N / Sunday DT / Saturday OT / weekly-40 via prior ST cells)
 * tied to Job setup ON / Start / Stop / OT after 8 (direct B–G cells).
 * Long Job setup gates live on hidden _JobDays (in-phase / staff OT after 8 /
 * east-coast COMP OT after 8). Craft
 * day ST/OT/DT only reference those shorts plus Job setup lock cells — keep
 * every formula under 4096 chars so Excel does not repair-strip Staff–Support.
 * Calendar column count is baked at export — Start/Stop beyond that window
 * needs re-export. Phase bar stays painted (Excel cannot restretch merges
 * without VBA). Job setup F hrs/day does not overwrite yellow HPS. CA 7th-day
 * DT is not in the day formula this pass. ST/OT/DT Rate cells INDEX/MATCH the live Position
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
 * Phase-bar day/night/complete hour chips ship on the next Excel compile —
 * view of live calendar ST+OT+DT per Job setup phase (import does not edit chips).
 * Hidden _CrewRanges is a view of live pack CalendarRange stacks for create-new.
 * Import uses those ranges only when the daily HC/HPS/PD grid still matches.
 * Look sample xlsx files are stale chrome (no _CrewRanges). Fresh export always
 * writes the helper. Vault Aromatics / CAT 2 fixtures prove create-new — do not
 * rebuild those Look blobs unless totals change.
 * Never commit source workbooks to git (Look samples excepted).
 */

import type { CalendarRange, CraftRow, CraftShift, SupportLine } from "./craft-labor.ts";
import {
  billedPeriodCount,
  largeToolAmount,
  resolveEquipmentSheet,
  resolveLargeToolLine,
  resolveThirdPartyLine,
  thirdPartyCost,
  THIRD_PARTY_PERIODS,
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
  moreFundHours,
  type JobMoney,
} from "./estimate-money.ts";
import { slugify } from "./estimate-pack.ts";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { commercialMarkupLabel, commercialMarkupRate, estimateMarkupDollars } from "./estimate-total.ts";
import {
  boundOtLabel,
  clockTitle,
  computeRangeHours,
  isStaffSeat,
  mondayKey,
  parseYmd,
  runningClock,
  siteClockFromText,
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
  phaseOwningDate,
  type PhaseId,
  type PhaseRow,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import { SUPPORT_BILLED_AS_TITLES } from "./crew-lanes.ts";
import { WOOD_RIVER_STAFF_TITLES } from "./wood-river-positions.ts";
import {
  hasShahanBillRate,
  isShahanCostPlus,
  lookupShahanEquipment,
  lookupShahanLabor,
  shahanPeriodsWithRates,
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
  thirdPartyPeriodsWithRates,
  thirdPartyRentalPeriodRate,
} from "./third-party-rental.ts";
import { emptySubSheet, lineAmount, subCardTotal, subcontractorMarkupBase, type SubSheet } from "./subcontractor.ts";
import { lookupCompWageRow, wageLookupOpts } from "./wage-lookup.ts";
import { catalogSites } from "./desk-data.ts";
import { clampEstimateStatus, parseEstimateStatus, type EstimateStatus } from "./estimate-status.ts";
import { regularClientFromParts } from "./site-regular.ts";
import { summaryAmountAt } from "./xlsx-eval.ts";
import {
  buildWorkbook,
  colLetter,
  excelSafeSheetName,
  parseA1,
  type SheetCell,
  type WorkbookComment,
  type WorkbookSheet,
} from "./xlsx-minimal.ts";

export { EXCEL_JOB_SETUP_IMPORT_PARKED, EXCEL_RIPPLE_RETROACTIVE, EXCEL_RIPPLE_RULE } from "./excel-ripple.ts";
export const ESTIMATE_EXPORT_ERROR = "Could not export. Try again.";
export const ESTIMATE_IMPORT_ERROR = "Could not import that workbook. Use a Hit Squad export.";
export const ESTIMATE_EXPORT_PRODUCER = "Produced by Hit Squad Project Controls";
export const ESTIMATE_EXPORT_BRAND = "HIT SQUAD / PROJECT CONTROLS";
export const ESTIMATE_EXPORT_CONFIDENTIAL = "Confidential estimate package";
export const ESTIMATE_PREPARED_BY_LABEL = "Prepared by";
export const ESTIMATE_STATUS_LABEL = "Status";
export const ESTIMATE_SUMMARY_AMOUNT = "Amount $";
export const ESTIMATE_SUMMARY_HOURS = "Man-hours (MH)";
export const ESTIMATE_HOURS_LINE = "Man-hours";
export const INDIRECT_DIRECT_RATIO_LABEL = "Indirect / Direct (hrs)";
export const DIRECT_PER_INDIRECT_LABEL = "Direct per indirect (1 : X)";
/** Job setup Start / Stop / CBA date — desktop Excel calendar picker. */
export const JOB_SETUP_DATE_FMT = "m/d/yyyy";
export const JOB_SETUP_MONEY_TITLE = "Job rates / money";
export const JOB_SETUP_STAFF_PD_CELL = "B15";
export const JOB_SETUP_CRAFT_PD_CELL = "B16";
export const JOB_SETUP_STAFF_MILE_CELL = "B17";
export const JOB_SETUP_CRAFT_MILE_CELL = "B18";
export const JOB_SETUP_LABOR_CONT_CELL = "B19";
export const JOB_SETUP_EQUIP_CONT_CELL = "B20";
export const JOB_SETUP_SUBS_CONT_CELL = "B21";
export const JOB_SETUP_CBA_ON_CELL = "B22";
export const JOB_SETUP_CBA_DATE_CELL = "B23";
export const JOB_SETUP_CBA_PCT_CELL = "B24";
export const JOB_SETUP_MORE_CELL = "B25";
export const RATE_TOOLS_SECTION = "Large tools (COE / dry rates)";
export const RATE_RENTAL_SECTION = "Third-party rental";
/** First day-grid column after the A–I instrument (Shift sits next to Position). */
export const LABOR_DATE_START_COL = 10;
export const LABOR_INSTRUMENT_LAST_COL = 9;
/** Two short rows above the date header — live Job setup phase band. */
export const LABOR_PHASE_ROW = 4;
export const LABOR_PHASE_ROW_END = 5;
export const LABOR_PHASE_LABEL = "Phase";
/** Day / night / complete hour chips sit on the unused date cells of row 3 (above the phase name). */
export const LABOR_PHASE_CHIP_ROW = 3;
export const LABOR_PHASE_CHIP_DAYS_FMT = '"D"0';
export const LABOR_PHASE_CHIP_NIGHTS_FMT = '"N"0';
export const LABOR_PHASE_CHIP_COMPLETE_FMT = '"C"0';
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
/** I header: daily PD people-days, not hours. */
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
/** Shift + Position + ST/OT/DT/PD hrs — one value centered in the block void. */
export const LABOR_BLOCK_VOID_COLS = ["A", "B", "F", "G", "H", "I"] as const;
export const LABOR_HOUR_VOID_COLS = ["F", "G", "H", "I"] as const;
/** Subtotal $ + Rate — title through HPS so HC/HPS are not empty holes. */
export const LABOR_TITLE_BAND_COLS = ["C", "D"] as const;
/** Support-only field under Position. Live pack `billedAs` — dropdown + import round-trip. */
export const LABOR_BILL_AS_LABEL = "Bill as";
/** Per-block clock pick — live pack `clockOverride`. Title-row Type cell. */
export const LABOR_CLOCK_AUTO = "Auto";
export const LABOR_CLOCK_STAFF = "Staff clock";
export const LABOR_CLOCK_COMP = "COMP clock";
export const LABOR_CLOCK_PICKS = [LABOR_CLOCK_AUTO, LABOR_CLOCK_STAFF, LABOR_CLOCK_COMP] as const;
/** Hidden per-block flag: TRUE = staff day formulas, FALSE = site COMP. */
export const LABOR_CLOCK_FLAG_COL = LABOR_BLOCK_ID_COL - 1;

/** Hover notes on Type chips — Excel comments, not VBA. Import ignores these. */
export const XLSX_TYPE_NOTES = {
  [LABOR_CLOCK_AUTO]:
    "Clock pick: Auto follows the seat (staff vs COMP). Change to Staff clock or COMP clock to force one.",
  [LABOR_CLOCK_STAFF]: "Clock pick: Staff clock forces the staff weekly-40 bank (ST then OT).",
  [LABOR_CLOCK_COMP]: "Clock pick: COMP clock forces COMP daily OT after 8.",
  HC: "Headcount for that day (yellow). Edit to change how many people that day.",
  HPS: "Hours per shift that day (yellow). Edit the length of the shift.",
  ST: "Straight-time hours (formula from HC × HPS + clock). Usually locked.",
  OT: "Overtime hours (formula). Usually locked.",
  DT: "Double-time hours (formula). Usually locked.",
  PD: "Per-diem people-count for that day (yellow). Edit who gets PD that day.",
} as const;

const FULL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Hover note on a labor date header — full date, e.g. Monday, January 11, 2027. */
export function excelFullDateNote(date: Date): string {
  return `${FULL_WEEKDAYS[date.getDay()]}, ${FULL_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export const XLSX_INPUT_NOTES = {
  position: "Craft / role title for this block.",
  billAs: "Support billing class. Changes how this seat bills.",
  quantity: "Enter quantity.",
  rate: "Enter unit rate.",
  period: "daily / weekly / monthly",
  periods: "How many periods to bill.",
  daysPerWeek: "Days worked per week (4–7).",
  hoursPerDay: "Hours per day (8 / 9 / 10 / 12 / 13).",
  start: "Phase start date. Must flow forward like Job setup on the desk — later ON starts on or after the previous ON Stop + 1 day.",
  stop: "Phase stop date. Must be on or after Start. Dates must flow forward like Job setup on the desk.",
  on: "ON = this range is working. OFF = out.",
  ot: "OT YES/NO for this range. YES uses the OT clock.",
  item: "Line name or catalog item.",
  description: "What this line is.",
  scope: "What this line covers.",
  vendor: "Vendor or supplier name.",
  affiliate: "Yes if affiliate (no markup).",
  freight: "Freight or delivery cost.",
  kind: "Staff or craft travel.",
  travelers: "How many people traveling.",
  miles: "Miles for this trip.",
  notes: "Optional note.",
  fallback: "Editable input for this line.",
} as const;

export const XLSX_JOB_MONEY_NOTES = {
  staffPd: "Staff per diem $ per person-day. Labor PD rates INDEX this cell.",
  craftPd: "Craft per diem $ per person-day. Labor PD rates INDEX this cell.",
  staffMile: "Default staff mileage $ / mile. Travel lines keep their own typed rate.",
  craftMile: "Default craft mileage $ / mile. Travel lines keep their own typed rate.",
  laborCont: "Labor contingency percent. 10 = 10%. Summary Labor contingency $ = Labor $ × this / 100.",
  equipCont: "Equipment contingency percent. 10 = 10%. Applies to rental / tension / crane / COE.",
  subsCont: "Subs contingency percent. 10 = 10%. Applies to Subcontractor cost.",
  cbaOn: "YES applies the CBA increase after the effective date.",
  cbaDate: "CBA increase starts on this date. Desk splits craft hours on this date.",
  cbaPct: "CBA increase percent. 3 = 3%. Summary $ is the desk craft-hour lift at export.",
  more: "M.O.R.E. fund $ per craft hour. Blank stays $0. Summary $ = desk MORE hours × this cell.",
  cbaSummary: "CBA $ follows desk craft hours after the Job setup effective date. Hour-split CBA math does not live in Excel.",
} as const;

const LABOR_SHEET_NAMES = new Set(["Staff", "Foremen", "Direct", "Support"]);

function textAt(cells: SheetCell[], ref: string): string {
  const cell = cells.find((item) => item.ref === ref);
  return cell?.type === "text" ? cell.value : "";
}

export function typeLabelNote(label: string): string | undefined {
  const key = label.trim();
  if (key in XLSX_TYPE_NOTES) return XLSX_TYPE_NOTES[key as keyof typeof XLSX_TYPE_NOTES];
  return undefined;
}

export function headerInputNote(header: string): string | undefined {
  const h = header.trim().toLowerCase();
  if (!h) return undefined;
  if (h === "qty" || h === "quantity") return XLSX_INPUT_NOTES.quantity;
  if (h === "rate $" || h === "each $" || h === "$ / mile" || h === "rate") return XLSX_INPUT_NOTES.rate;
  if (h === "period") return XLSX_INPUT_NOTES.period;
  if (h === "periods") return XLSX_INPUT_NOTES.periods;
  if (h === "days/wk") return XLSX_INPUT_NOTES.daysPerWeek;
  if (h === "hrs/day") return XLSX_INPUT_NOTES.hoursPerDay;
  if (h === "start") return XLSX_INPUT_NOTES.start;
  if (h === "stop") return XLSX_INPUT_NOTES.stop;
  if (h === "on") return XLSX_INPUT_NOTES.on;
  if (h === "ot after 8") return XLSX_INPUT_NOTES.ot;
  if (h === "item") return XLSX_INPUT_NOTES.item;
  if (h === "description") return XLSX_INPUT_NOTES.description;
  if (h === "scope") return XLSX_INPUT_NOTES.scope;
  if (h === "vendor") return XLSX_INPUT_NOTES.vendor;
  if (h === "affiliate") return XLSX_INPUT_NOTES.affiliate;
  if (h === "freight $") return XLSX_INPUT_NOTES.freight;
  if (h === "kind") return XLSX_INPUT_NOTES.kind;
  if (h === "travelers") return XLSX_INPUT_NOTES.travelers;
  if (h === "miles") return XLSX_INPUT_NOTES.miles;
  if (h === "notes") return XLSX_INPUT_NOTES.notes;
  if (h === "staff pd $ / day") return XLSX_JOB_MONEY_NOTES.staffPd;
  if (h === "craft pd $ / day") return XLSX_JOB_MONEY_NOTES.craftPd;
  if (h === "staff mileage $ / mile") return XLSX_JOB_MONEY_NOTES.staffMile;
  if (h === "craft mileage $ / mile") return XLSX_JOB_MONEY_NOTES.craftMile;
  if (h === "labor contingency %") return XLSX_JOB_MONEY_NOTES.laborCont;
  if (h === "equipment contingency %") return XLSX_JOB_MONEY_NOTES.equipCont;
  if (h === "subs contingency %") return XLSX_JOB_MONEY_NOTES.subsCont;
  if (h === "cba increase on") return XLSX_JOB_MONEY_NOTES.cbaOn;
  if (h === "cba effective date") return XLSX_JOB_MONEY_NOTES.cbaDate;
  if (h === "cba increase %") return XLSX_JOB_MONEY_NOTES.cbaPct;
  if (h === "m.o.r.e. fund $ / hr") return XLSX_JOB_MONEY_NOTES.more;
  return XLSX_INPUT_NOTES.fallback;
}

function laborRowOffset(sheet: WorkbookSheet, row: number): number | null {
  for (const block of sheet.laborBlocks ?? []) {
    if (row >= block.start && row <= block.end) return row - block.start;
  }
  return null;
}

/** Attach hover notes to the clock pick, Position / Bill as, day-grid HC/HPS/PD, and unlocked inputs. */
export function attachEstimateComments(sheet: WorkbookSheet): WorkbookSheet {
  const notes = new Map<string, string>();
  const add = (ref: string, text: string | undefined) => {
    const body = (text ?? "").replace(/\s+/g, " ").trim();
    if (!ref || !body || notes.has(ref)) return;
    notes.set(ref, body);
  };

  for (const cell of sheet.cells) add(cell.ref, cell.note);
  for (const comment of sheet.comments ?? []) add(comment.ref, comment.text);

  if (LABOR_SHEET_NAMES.has(sheet.name)) {
    for (const block of sheet.laborBlocks ?? []) {
      add(`E${block.start}`, typeLabelNote(textAt(sheet.cells, `E${block.start}`)) ?? XLSX_TYPE_NOTES[LABOR_CLOCK_AUTO]);
      add(`B${block.start}`, XLSX_INPUT_NOTES.position);
    }
    for (const slot of sheet.billAs ?? []) {
      add(`B${slot.valueRow}`, XLSX_INPUT_NOTES.billAs);
    }
    const firstDate = sheet.cells.find((cell) => {
      const parsed = parseA1(cell.ref);
      return parsed.row === 6 && parsed.colNum === LABOR_DATE_START_COL;
    });
    if (firstDate?.type === "date") add(firstDate.ref, excelFullDateNote(firstDate.value));
    else if (firstDate?.type === "text") {
      const parsed = parseYmd(firstDate.value);
      if (parsed) add(firstDate.ref, excelFullDateNote(parsed));
    }
    const hidden = new Set(sheet.hiddenCols ?? []);
    for (const cell of sheet.cells) {
      const { colNum, row } = parseA1(cell.ref);
      if (colNum < LABOR_DATE_START_COL || hidden.has(colNum) || row === 6) continue;
      const offset = laborRowOffset(sheet, row);
      if (offset === LABOR_HC_OFFSET) add(cell.ref, XLSX_TYPE_NOTES.HC);
      else if (offset === LABOR_HPS_OFFSET) add(cell.ref, XLSX_TYPE_NOTES.HPS);
      else if (offset === LABOR_PD_OFFSET) add(cell.ref, XLSX_TYPE_NOTES.PD);
    }
  }

  for (const { row, col } of sheet.unlocked ?? []) {
    const ref = `${colLetter(col)}${row}`;
    if (notes.has(ref)) continue;
    add(ref, headerInputNote(textAt(sheet.cells, `${colLetter(col)}6`)));
  }

  const leftovers: WorkbookComment[] = [];
  const cells = sheet.cells.map((cell) => {
    const note = notes.get(cell.ref);
    if (!note) return cell;
    notes.delete(cell.ref);
    return cell.note === note ? cell : { ...cell, note };
  });
  for (const [ref, text] of notes) leftovers.push({ ref, text });
  return { ...sheet, cells, comments: leftovers.length ? leftovers : undefined };
}

export function clockOverrideLabel(override: ClockOverride = "auto"): string {
  if (override === "staff") return LABOR_CLOCK_STAFF;
  if (override === "comp") return LABOR_CLOCK_COMP;
  return LABOR_CLOCK_AUTO;
}

export function clockLabelOverride(label: string): ClockOverride {
  if (label === LABOR_CLOCK_STAFF) return "staff";
  if (label === LABOR_CLOCK_COMP) return "comp";
  return "auto";
}

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
  jobDays: "_JobDays",
  crewRanges: "_CrewRanges",
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

/**
 * Blank formula-ready pad after live COE / Misc / Equipment Rental (and
 * Tension/Crane — same rental builder), plus Travel and Subcontractor.
 * SUM covers live + spare. Import scans the full block; filled pad rows
 * become new pack lines.
 */
export const ESTIMATE_XLSX_SPARE_ROWS = 8;
/** Hidden Travel / Subcontractor row id — same idea as COE col H / labor block id. */
export const TRAVEL_HIDDEN_ID_COL = 6;
export const SUB_HIDDEN_ID_COL = 9;

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
  /** Live company-record logo (companyLogoSrc). Export-only; import does not store it. */
  companyLogo?: string | null;
  /** Signed-in exporter display name. Export-only; import ignores it. */
  preparedBy?: string | null;
  /** Live pack status. Export-only; import does not overwrite the pack. */
  status?: EstimateStatus | string | null;
  /** Open site Regular-client flag. When omitted, catalog seed/override is used. */
  regularClient?: boolean;
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

/** Item/kind text through unit rate — not the formula Total $ (or Cost/Markup rollup). */
function unlockInputCols(
  unlocked: Array<{ row: number; col: number }>,
  row: number,
  lastInputCol: number,
) {
  for (let col = 1; col <= lastInputCol; col += 1) unlocked.push({ row, col });
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

/** Session display name, else email local-part. Never invents a person. */
export function exporterDisplayName(name?: string | null, email?: string | null): string | null {
  const display = (name ?? "").replace(/\s+/g, " ").trim();
  if (display) return display;
  const local = (email ?? "").trim().split("@")[0] ?? "";
  const fromEmail = local.replace(/[._+]+/g, " ").replace(/\s+/g, " ").trim();
  return fromEmail || null;
}

function headerByline(input: EstimateXlsxInput, when = new Date()): string {
  const regular =
    typeof input.regularClient === "boolean"
      ? input.regularClient
      : regularClientFromParts(input.site ?? "", input.client ?? "", catalogSites());
  const stamp = `${ESTIMATE_STATUS_LABEL}: ${clampEstimateStatus(parseEstimateStatus(input.status), regular)}`;
  const prepared = exporterDisplayName(input.preparedBy, null);
  const who = prepared ? `${ESTIMATE_PREPARED_BY_LABEL}: ${prepared}  ·  ` : "";
  return `${stamp}  ·  ${who}${ESTIMATE_EXPORT_PRODUCER}  ·  ${ESTIMATE_EXPORT_CONFIDENTIAL}  ·  ${exportProducedLabel(when)}`;
}

function headerTitleMerges(lastCol: string): string[] {
  return [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`];
}

function headerCells(input: EstimateXlsxInput, when = new Date()): SheetCell[] {
  const clock = boundOtLabel(input.site ?? "", input.client ?? "", input.plantCode ?? "");
  const title = (input.title || "").trim() || "Estimate";
  const job = [title, input.client, input.site, clock].filter((part) => String(part || "").trim()).join("  ·  ");
  return [
    { ref: "A1", type: "text", value: ESTIMATE_EXPORT_BRAND },
    { ref: "A2", type: "text", value: job },
    { ref: "A3", type: "text", value: headerByline(input, when) },
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

/** Blank / comment-only inputs are "" in Excel — N() keeps line totals numeric. */
function nCell(ref: string) {
  return `N(${ref})`;
}

function qtyEachTotal(row: number) {
  return `${nCell(`C${row}`)}*${nCell(`D${row}`)}`;
}

function rentalLineTotal(row: number) {
  return `${nCell(`C${row}`)}*${nCell(`D${row}`)}*${nCell(`E${row}`)}+${nCell(`F${row}`)}`;
}

function safeSheetAmount(ref: string) {
  return `IFERROR(${nCell(ref)},0)`;
}

function pushRate(cells: SheetCell[], ref: string, value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) pushNum(cells, ref, value);
}

export function thirdPartyBucket(item: string): "tension" | "crane" | "rental" {
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

/** Excel drops a formula past ~8192 chars. Day ST/OT/DT must stay well under this. */
export const EXCEL_FORMULA_CHAR_LIMIT = 4096;
const JOB_SETUP_OT8_PICKS = PHASE_OT_PICKS.filter((item) => item.id.endsWith("ot8")).map((item) => item.label);

function jobSetupSheet() {
  return quoteSheet(xlsxName(ESTIMATE_XLSX_SHEETS.jobSetup));
}

function jobDaysSheet() {
  return quoteSheet(xlsxName(ESTIMATE_XLSX_SHEETS.jobDays));
}

function crewRangesSheetName() {
  return ESTIMATE_XLSX_SHEETS.crewRanges;
}

/** Sunday-first 7-bit mask, same order as `CalendarRange.days` / `Date#getDay`. */
export function formatCrewDaysMask(days: CalendarRange["days"] | undefined): string {
  const mask = Array.isArray(days) && days.length === 7 ? days : [true, true, true, true, true, true, true];
  return mask.map((on) => (on ? "1" : "0")).join("");
}

function jobSetupPhaseRow(phaseId: PhaseId) {
  return 7 + PHASE_IDS.indexOf(phaseId);
}

function jobSetupCell(col: string, phaseId: PhaseId) {
  return `${jobSetupSheet()}!$${col}$${jobSetupPhaseRow(phaseId)}`;
}

function jobDaysRef(index: number, row: number) {
  return `${jobDaysSheet()}!${colLetter(1 + index)}${row}`;
}

function jobSetupPhaseOwns(dateRef: string, phaseId: PhaseId) {
  return `AND(${jobSetupCell("B", phaseId)}="ON",${jobSetupCell("C", phaseId)}<=${dateRef},${jobSetupCell("D", phaseId)}>=${dateRef})`;
}

function jobSetupInPhase(dateRef: string) {
  return `OR(${PHASE_IDS.map((id) => jobSetupPhaseOwns(dateRef, id)).join(",")})`;
}

function jobSetupOtFlag(phaseId: PhaseId) {
  const g = jobSetupCell("G", phaseId);
  const h = jobSetupCell("H", phaseId);
  const picks = JOB_SETUP_OT8_PICKS.map((label) => `${h}="${label}"`).join(",");
  return `OR(${g}="YES",${picks})`;
}

function jobSetupOtAfter8Expr(dateRef: string) {
  let expr = "FALSE";
  for (let i = PHASE_IDS.length - 1; i >= 0; i -= 1) {
    const id = PHASE_IDS[i];
    expr = `IF(${jobSetupPhaseOwns(dateRef, id)},${jobSetupOtFlag(id)},${expr})`;
  }
  return expr;
}

/** Desk `eastCoastCraftOtAfter8`: Pre/Post follow G; Oil Out / Mechanical / Oil In always OT after 8. */
function jobSetupEastCoastCraftOtExpr(dateRef: string) {
  const mid = (["oil-out", "mech", "oil-in"] as const).map((id) => jobSetupPhaseOwns(dateRef, id)).join(",");
  return `OR(${mid},AND(${jobSetupPhaseOwns(dateRef, "pre")},${jobSetupOtFlag("pre")}),AND(${jobSetupPhaseOwns(dateRef, "post")},${jobSetupOtFlag("post")}))`;
}

function jobSetupTextEquals(expr: string, expected: string) {
  if (!expected) return `OR(${expr}="",${expr}=0)`;
  return `${expr}="${expected}"`;
}

function jobSetupExportLock(dateRef: string, owner: PhaseRow | undefined, inPhaseRef: string) {
  if (!owner) return `NOT(${inPhaseRef})`;
  return `AND(${jobSetupCell("B", owner.id)}="ON",${jobSetupCell("C", owner.id)}<=${dateRef},${jobSetupCell("D", owner.id)}>=${dateRef},${jobSetupTextEquals(jobSetupCell("G", owner.id), owner.otAfter8 ? "YES" : "NO")})`;
}

function buildJobDaysSheet(dates: string[]): WorkbookSheet | null {
  if (!dates.length) return null;
  const cells: SheetCell[] = [];
  dates.forEach((ymd, index) => {
    const col = colLetter(1 + index);
    if (index === 0) {
      const date = parseYmd(ymd);
      if (date) cells.push({ ref: `${col}1`, type: "date", value: date });
      else pushText(cells, `${col}1`, ymd);
    } else {
      pushFormula(cells, `${col}1`, `${colLetter(index)}1+1`);
    }
    const dateRef = `${col}$1`;
    pushFormula(cells, `${col}2`, jobSetupInPhase(dateRef));
    pushFormula(cells, `${col}3`, jobSetupOtAfter8Expr(dateRef));
    pushFormula(cells, `${col}4`, jobSetupEastCoastCraftOtExpr(dateRef));
  });
  return { name: ESTIMATE_XLSX_SHEETS.jobDays, cells, veryHidden: true };
}

const CREW_RANGE_HEADERS = [
  "blockId",
  "rangeId",
  "start",
  "end",
  "headcount",
  "nightHeadcount",
  "hoursPerShift",
  "perDiemPeople",
  "nightPerDiemPeople",
  "days",
  "skipDates",
  "phaseId",
  "shift",
  "otAfter8",
  "off",
  "unitId",
  "sundayHeadcount",
  "nightSundayHeadcount",
] as const;

function yesNo(value: boolean | undefined): string {
  if (value == null) return "";
  return value ? "YES" : "NO";
}

function buildCrewRangesSheet(input: EstimateXlsxInput): WorkbookSheet | null {
  const cells: SheetCell[] = [];
  CREW_RANGE_HEADERS.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}1`, label));
  let excelRow = 2;
  for (const row of allCrewRows(input.crew)) {
    for (const range of row.ranges ?? []) {
      const night = (range.shift ?? row.shift) === "Nights";
      pushText(cells, `A${excelRow}`, laborBlockId(row, night));
      pushText(cells, `B${excelRow}`, range.id || "");
      pushText(cells, `C${excelRow}`, range.start || "");
      pushText(cells, `D${excelRow}`, range.end || "");
      pushNum(cells, `E${excelRow}`, Number(range.headcount) || 0);
      pushNum(cells, `F${excelRow}`, Number(range.nightHeadcount) || 0);
      pushNum(cells, `G${excelRow}`, Number(range.hoursPerShift) || 0);
      pushNum(cells, `H${excelRow}`, Number(range.perDiemPeople) || 0);
      pushNum(cells, `I${excelRow}`, Number(range.nightPerDiemPeople) || 0);
      pushText(cells, `J${excelRow}`, formatCrewDaysMask(range.days));
      pushText(cells, `K${excelRow}`, (range.skipDates ?? []).filter(Boolean).join(","));
      pushText(cells, `L${excelRow}`, range.phaseId || "");
      pushText(cells, `M${excelRow}`, range.shift || row.shift || "Days");
      pushText(cells, `N${excelRow}`, yesNo(range.otAfter8));
      pushText(cells, `O${excelRow}`, yesNo(range.off));
      pushText(cells, `P${excelRow}`, range.unitId || "");
      if (range.sundayHeadcount != null) pushNum(cells, `Q${excelRow}`, Number(range.sundayHeadcount) || 0);
      if (range.nightSundayHeadcount != null) pushNum(cells, `R${excelRow}`, Number(range.nightSundayHeadcount) || 0);
      excelRow += 1;
    }
  }
  if (excelRow === 2) return null;
  return { name: crewRangesSheetName(), cells, veryHidden: true };
}

function mondayStamp(ymd: string) {
  const date = parseYmd(ymd);
  return date ? mondayKey(date) : ymd;
}

function excelTextLiteral(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function excelBlockClock(row: CraftRow, input: EstimateXlsxInput): RunningClock {
  return runningClock(
    clockTitle(row.position, row.billedAs ?? ""),
    input.site ?? "",
    input.client ?? "",
    row.clockOverride ?? "auto",
    input.plantCode ?? "",
  );
}

/** Prior ST cells in the same Monday-week. Do not filter by range — that dropped Monday and left Saturday a 40-hour room. */
export function priorWeekStRefs(dates: string[], index: number, stRow: number) {
  const week = mondayStamp(dates[index] ?? "");
  return dates
    .slice(0, index)
    .map((stamp, prior) => ({ stamp, ref: `${colLetter(LABOR_DATE_START_COL + prior)}${stRow}` }))
    .filter((item) => mondayStamp(item.stamp) === week)
    .map((item) => item.ref);
}

function dayHourFormulas(
  col: string,
  hcRow: number,
  hpsRow: number,
  clock: RunningClock,
  otAfter8Expr: string,
  inPhaseExpr: string,
  priorStRefs: string[],
): { st: string; ot: string; dt: string } {
  const hc = `${col}${hcRow}`;
  const hps = `${col}${hpsRow}`;
  const dateRef = `${col}$6`;
  const dow = `WEEKDAY(${dateRef},1)`;
  const none = `OR(${hc}<=0,NOT(${inPhaseExpr}))`;
  let dailySt: string;
  let dailyOt: string;
  let dailyDt: string;
  if (clock === "ca-daily") {
    dailySt = `IF(${none},0,MIN(8,${hps})*${hc})`;
    dailyOt = `IF(${none},0,MIN(4,MAX(0,${hps}-8))*${hc})`;
    dailyDt = `IF(${none},0,MAX(0,${hps}-12)*${hc})`;
  } else if (clock === "staff") {
    const cap = `IF(${otAfter8Expr},8,10)`;
    dailySt = `IF(${none},0,IF(${dow}=1,0,MIN(${cap},${hps})*${hc}))`;
    dailyOt = `IF(${none},0,IF(${dow}=1,0,MAX(0,${hps}-(${cap}))*${hc}))`;
    dailyDt = `IF(${none},0,IF(${dow}=1,${hc}*${hps},0))`;
  } else {
    const weekdaySt = `IF(${otAfter8Expr},MIN(8,${hps})*${hc},${hc}*${hps})`;
    const weekdayOt = `IF(${otAfter8Expr},MAX(0,${hps}-8)*${hc},0)`;
    dailySt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,0,${weekdaySt})))`;
    dailyOt = `IF(${none},0,IF(${dow}=1,0,IF(${dow}=7,${hc}*${hps},${weekdayOt})))`;
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

function jobSetupMoneyRef(cell: string) {
  return `${jobSetupSheet()}!${cell}`;
}

function jobSetupNumRef(cell: string) {
  return nCell(jobSetupMoneyRef(cell));
}

function pdRateFormula(staffPd: boolean) {
  return jobSetupMoneyRef(staffPd ? JOB_SETUP_STAFF_PD_CELL : JOB_SETUP_CRAFT_PD_CELL);
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
export function laborDayPlug(row: CraftRow, ymd: string, night: boolean): { hc: number; hps: number; pd: number } {
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
  const override = row.clockOverride ?? "auto";
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

/** ST+OT+DT for title blocks over a phase date span — same hour rows the desk rolls. */
function phaseHourRollup(titles: number[], startCol: number, endCol: number): string {
  if (!titles.length) return "0";
  const first = colLetter(startCol);
  const last = colLetter(endCol);
  return titles
    .map((title) => `SUM(${first}${title + LABOR_ST_OFFSET}:${last}${title + LABOR_DT_OFFSET})`)
    .join("+");
}

function writePhaseHourChips(
  cells: SheetCell[],
  runs: NonNullable<WorkbookSheet["phaseBar"]>,
  dayTitles: number[],
  nightTitles: number[],
): NonNullable<WorkbookSheet["phaseChips"]> {
  const chips: NonNullable<WorkbookSheet["phaseChips"]> = [];
  for (const run of runs) {
    const span = run.endCol - run.startCol + 1;
    const daysExpr = phaseHourRollup(dayTitles, run.startCol, run.endCol);
    const nightsExpr = phaseHourRollup(nightTitles, run.startCol, run.endCol);
    const completeExpr =
      daysExpr === "0" ? nightsExpr : nightsExpr === "0" ? daysExpr : `(${daysExpr})+(${nightsExpr})`;
    const place = (col: number, kind: "days" | "nights" | "complete", formula: string, fmt: string) => {
      cells.push({
        ref: `${colLetter(col)}${LABOR_PHASE_CHIP_ROW}`,
        type: "formula",
        value: formula,
        numFmt: fmt,
      });
      chips.push({ col, kind, startCol: run.startCol, endCol: run.endCol, phaseId: run.phaseId });
    };
    if (span >= 3) {
      place(run.startCol, "days", daysExpr, LABOR_PHASE_CHIP_DAYS_FMT);
      place(run.startCol + 1, "nights", nightsExpr, LABOR_PHASE_CHIP_NIGHTS_FMT);
      place(
        run.startCol + 2,
        "complete",
        `${colLetter(run.startCol)}${LABOR_PHASE_CHIP_ROW}+${colLetter(run.startCol + 1)}${LABOR_PHASE_CHIP_ROW}`,
        LABOR_PHASE_CHIP_COMPLETE_FMT,
      );
    } else if (span === 2) {
      place(run.startCol, "days", daysExpr, LABOR_PHASE_CHIP_DAYS_FMT);
      place(run.startCol + 1, "complete", completeExpr, LABOR_PHASE_CHIP_COMPLETE_FMT);
    } else {
      place(run.startCol, "complete", completeExpr, LABOR_PHASE_CHIP_COMPLETE_FMT);
    }
  }
  return chips;
}

function buildCrewSheet(
  input: EstimateXlsxInput,
  name: string,
  rows: CraftRow[],
  keys: RateKey[],
  staffPdOf: (row: CraftRow) => boolean,
  _lane: CrewLane = "craft",
  lastRateRow = 0,
): BuiltSheet | null {
  const live = liveCrewRows(rows);
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
  ];
  headers.forEach((label, index) => pushText(cells, `${colLetter(index + 1)}6`, label));
  writeDateRow(cells, dates);
  writeWeekdayRow(cells, dates);
  const phaseBand = writePhaseBar(cells, dates, input.schedule);

  const titleRows: number[] = [];
  const dayTitleRows: number[] = [];
  const nightTitleRows: number[] = [];
  const pdMoneyRows: number[] = [];
  const laborBlocks: Array<{ start: number; end: number }> = [];
  const spacerRows: number[] = [];
  let excelRow = 7;

  function emitBlock(row: CraftRow, night: boolean) {
    const titleRow = excelRow + LABOR_TITLE_OFFSET;
    if (night) nightTitleRows.push(titleRow);
    else dayTitleRows.push(titleRow);
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
    const deskHours = deskBlockDayHours(row, night, input);
    const siteClock = siteClockFromText(input.site ?? "", input.client ?? "", input.plantCode ?? "");
    const clockPick = clockOverrideLabel(row.clockOverride);
    const pickRef = `E${titleRow}`;
    const clockTitleRef = showBillAs ? `IF(TRIM(B${otRow})<>"",B${otRow},B${titleRow})` : `B${titleRow}`;
    const seatCount = staffSeatListTitles().length;
    const autoStaff = `ISNUMBER(MATCH(${clockTitleRef},'${ESTIMATE_XLSX_SHEETS.lists}'!$${STAFF_SEAT_LIST_COL}$1:$${STAFF_SEAT_LIST_COL}$${Math.max(1, seatCount)},0))`;
    const useStaffExpr = `OR(${pickRef}=${excelTextLiteral(LABOR_CLOCK_STAFF)},AND(OR(${pickRef}=${excelTextLiteral(LABOR_CLOCK_AUTO)},${pickRef}=""),${autoStaff}))`;
    const flagCol = colLetter(LABOR_CLOCK_FLAG_COL);
    const useStaffRef = `${flagCol}${titleRow}`;
    const setupPhases = mergeSchedule(input.schedule).phases;

    const blockId = laborBlockId(row, night);
    const idCol = colLetter(LABOR_BLOCK_ID_COL);
    for (let offset = 0; offset < LABOR_BLOCK_HEIGHT; offset += 1) {
      pushText(cells, `${idCol}${excelRow + offset}`, blockId);
    }

    pushText(cells, `A${titleRow}`, night ? LABOR_NIGHTSHIFT : LABOR_DAYSHIFT);
    pushText(cells, `B${titleRow}`, row.position.trim());
    pushText(cells, `E${titleRow}`, clockPick);
    pushFormula(cells, `${flagCol}${titleRow}`, useStaffExpr);
    if (showBillAs) {
      pushText(cells, `B${stRow}`, LABOR_BILL_AS_LABEL);
      cells.push({ ref: `B${otRow}`, type: "text", value: billAsDisplay(row, input.site ?? "") });
    }
    pushFormula(cells, `C${titleRow}`, `C${stRow}+C${otRow}+C${dtRow}`);
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
    pushFormula(cells, `D${pdRow}`, pdRateFormula(staffPdOf(row)));
    pushFormula(cells, `C${pdRow}`, `I${titleRow}*D${pdRow}`);
    dates.forEach((ymd, index) => {
      const col = colLetter(LABOR_DATE_START_COL + index);
      const plug = laborDayPlug(row, ymd, night);
      pushNum(cells, `${col}${hcRow}`, plug.hc);
      pushNum(cells, `${col}${hpsRow}`, plug.hps);
      const priorStRefs = priorWeekStRefs(dates, index, stRow);
      const dateRef = `${col}$6`;
      const inPhaseRef = jobDaysRef(index, 2);
      const staffOtRef = jobDaysRef(index, 3);
      const compOtRef =
        siteClock === "ca-daily" ? "FALSE" : siteClock === "east-coast" ? jobDaysRef(index, 4) : staffOtRef;
      const staffHours = dayHourFormulas(col, hcRow, hpsRow, "staff", staffOtRef, inPhaseRef, priorStRefs);
      const compHours = dayHourFormulas(col, hcRow, hpsRow, siteClock, compOtRef, inPhaseRef, priorStRefs);
      const hours = {
        st: `IF(${useStaffRef},${staffHours.st},${compHours.st})`,
        ot: `IF(${useStaffRef},${staffHours.ot},${compHours.ot})`,
        dt: `IF(${useStaffRef},${staffHours.dt},${compHours.dt})`,
      };
      const desk = deskHours.get(ymd) ?? { st: 0, ot: 0, dt: 0 };
      const hcVal = money(plug.hc);
      const hpsVal = money(plug.hps);
      const owner = phaseOwningDate(setupPhases, ymd);
      const titleLock = `${clockTitleRef}=${excelTextLiteral(clockTitle(row.position, row.billedAs ?? ""))}`;
      const exported = `AND(${col}${hcRow}=${hcVal},${col}${hpsRow}=${hpsVal},${pickRef}=${excelTextLiteral(clockPick)},${titleLock},${jobSetupExportLock(dateRef, owner, inPhaseRef)})`;
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
    if (rowHasDayBlock(row) || (!rowHasDayBlock(row) && !rowHasNightBlock(row))) {
      planned.push({ row, night: false });
    }
  }
  for (const row of live) {
    if (rowHasNightBlock(row)) planned.push({ row, night: true });
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
  const pdRollup = `${colLetter(LABOR_CLOCK_FLAG_COL)}${totalRow}`;
  if (titleRows.length) {
    pushFormula(cells, `C${totalRow}`, `SUM(${titleRows.map((row) => `C${row}`).join(",")})`);
    pushFormula(cells, `F${totalRow}`, `SUM(${titleRows.map((row) => `F${row}`).join(",")})`);
    pushFormula(cells, `G${totalRow}`, `SUM(${titleRows.map((row) => `G${row}`).join(",")})`);
    pushFormula(cells, `H${totalRow}`, `SUM(${titleRows.map((row) => `H${row}`).join(",")})`);
    pushFormula(cells, `I${totalRow}`, `SUM(${titleRows.map((row) => `I${row}`).join(",")})`);
    pushFormula(cells, pdRollup, `SUM(${pdMoneyRows.map((row) => `C${row}`).join(",")})`);
    pushFormula(cells, hoursRollup, `F${totalRow}+G${totalRow}+H${totalRow}`);
  } else {
    pushNum(cells, `C${totalRow}`, 0);
    pushNum(cells, `F${totalRow}`, 0);
    pushNum(cells, `G${totalRow}`, 0);
    pushNum(cells, `H${totalRow}`, 0);
    pushNum(cells, pdRollup, 0);
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
    laborTotal: `C${totalRow}`,
    pdTotal: pdRollup,
    hoursTotal: hoursRollup,
    sheetTotal: `C${totalRow}`,
    hiddenCols: [LABOR_CLOCK_FLAG_COL, LABOR_BLOCK_ID_COL],
    weekendCols,
    laborBlocks,
    spacerRows,
    phaseBar: phaseBand.phaseBar,
    phaseChips: writePhaseHourChips(cells, phaseBand.phaseBar, dayTitleRows, nightTitleRows),
    billAs: showBillAs
      ? laborBlocks.map((block) => ({
          labelRow: block.start + LABOR_ST_OFFSET,
          valueRow: block.start + LABOR_OT_OFFSET,
        }))
      : undefined,
    unlocked: dates.length ? [{ row: 6, col: LABOR_DATE_START_COL }] : [],
    validations: laborPositionValidations(name, laborBlocks, Boolean(showBillAs)),
    merges: [
      ...headerTitleMerges(colLetter(LABOR_DATE_START_COL - 1)),
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
  const live = lines.filter(liveThirdParty).map(resolveThirdPartyLine);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Item", "Period", "Qty", "Periods", "Rate $", "Freight $", "Cost $", "Total $"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  const unlocked: Array<{ row: number; col: number }> = [];
  const periodRows: PeriodValidationRow[] = [];
  live.forEach((line, index) => {
    const excelRow = 7 + index;
    const catalog = lookupThirdPartyRental(line.item);
    const periods = billedPeriodCount(line.start, line.end, line.period);
    pushText(cells, `A${excelRow}`, line.item);
    pushText(cells, `B${excelRow}`, line.period);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, periods);
    pushNum(cells, `E${excelRow}`, line.rate);
    pushNum(cells, `F${excelRow}`, line.freight);
    pushFormula(cells, `G${excelRow}`, rentalLineTotal(excelRow));
    pushFormula(cells, `H${excelRow}`, `G${excelRow}*${1 + commercialMarkupRate(input.client, input.site)}`);
    unlockInputCols(unlocked, excelRow, 6);
    periodRows.push({
      row: excelRow,
      periods: catalog ? thirdPartyPeriodsWithRates(catalog) : [...THIRD_PARTY_PERIODS],
    });
  });
  const first = 7;
  const lastLive = 6 + live.length;
  const last = lastLive + ESTIMATE_XLSX_SPARE_ROWS;
  const markup = 1 + commercialMarkupRate(input.client, input.site);
  for (let excelRow = lastLive + 1; excelRow <= last; excelRow += 1) {
    pushFormula(cells, `G${excelRow}`, rentalLineTotal(excelRow));
    pushFormula(cells, `H${excelRow}`, `G${excelRow}*${markup}`);
    unlockInputCols(unlocked, excelRow, 6);
    periodRows.push({ row: excelRow, periods: [...THIRD_PARTY_PERIODS] });
  }
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${totalRow}`, `SUM(H${first}:H${last})`);
  return {
    name,
    cells,
    costTotal: `G${totalRow}`,
    sheetTotal: `G${totalRow}`,
    unlocked,
    validations: periodValidations(periodRows),
  };
}

function buildCoeSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const live = (input.equipment?.largeTools ?? []).filter(liveLargeTool).map(resolveLargeToolLine);
  if (!live.length) return null;
  const cells = headerCells(input);
  ["Item", "Period", "Qty", "Periods", "Rate $", "Freight $", "Total $"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  const unlocked: Array<{ row: number; col: number }> = [];
  const periodRows: PeriodValidationRow[] = [];
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
    pushFormula(cells, `G${excelRow}`, rentalLineTotal(excelRow));
    pushText(cells, `H${excelRow}`, line.itemId);
    unlockInputCols(unlocked, excelRow, 6);
    periodRows.push({
      row: excelRow,
      periods: item ? shahanPeriodsWithRates(item) : [...THIRD_PARTY_PERIODS],
    });
  });
  const first = 7;
  const lastLive = 6 + live.length;
  const last = lastLive + ESTIMATE_XLSX_SPARE_ROWS;
  for (let excelRow = lastLive + 1; excelRow <= last; excelRow += 1) {
    pushFormula(cells, `G${excelRow}`, rentalLineTotal(excelRow));
    unlockInputCols(unlocked, excelRow, 6);
    periodRows.push({ row: excelRow, periods: [...THIRD_PARTY_PERIODS] });
  }
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  return {
    name: ESTIMATE_XLSX_SHEETS.coe,
    cells,
    sheetTotal: `G${totalRow}`,
    hiddenCols: [8],
    unlocked,
    validations: periodValidations(periodRows),
  };
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
  const unlocked: Array<{ row: number; col: number }> = [];
  live.forEach((line, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, line.kind === "staff" ? "Staff" : "Craft");
    pushNum(cells, `B${excelRow}`, Math.min(line.travelers, line.headcount || line.travelers));
    pushNum(cells, `C${excelRow}`, line.miles);
    pushNum(cells, `D${excelRow}`, line.perMile);
    pushFormula(cells, `E${excelRow}`, `${nCell(`B${excelRow}`)}*${nCell(`C${excelRow}`)}*${nCell(`D${excelRow}`)}`);
    pushText(cells, `${colLetter(TRAVEL_HIDDEN_ID_COL)}${excelRow}`, line.id);
    unlockInputCols(unlocked, excelRow, 4);
  });
  const first = 7;
  const lastLive = 6 + live.length;
  const last = lastLive + ESTIMATE_XLSX_SPARE_ROWS;
  for (let excelRow = lastLive + 1; excelRow <= last; excelRow += 1) {
    pushFormula(cells, `E${excelRow}`, `${nCell(`B${excelRow}`)}*${nCell(`C${excelRow}`)}*${nCell(`D${excelRow}`)}`);
    unlockInputCols(unlocked, excelRow, 4);
  }
  const totalRow = last + 1;
  pushText(cells, `A${totalRow}`, "TOTAL");
  pushFormula(cells, `E${totalRow}`, `SUM(E${first}:E${last})`);
  return { name, cells, sheetTotal: `E${totalRow}`, unlocked, hiddenCols: [TRAVEL_HIDDEN_ID_COL] };
}

function buildMiscSheet(input: EstimateXlsxInput): BuiltSheet | null {
  const misc = (input.otherCost?.misc ?? []).filter((line) => miscAmount(line) > 0);
  if (!misc.length) return null;
  const cells = headerCells(input);
  ["Item", "Description", "Qty", "Each $", "Total $"].forEach((label, index) => {
    pushText(cells, `${colLetter(index + 1)}6`, label);
  });
  let excelRow = 7;
  const unlocked: Array<{ row: number; col: number }> = [];
  for (const line of misc) {
    pushText(cells, `A${excelRow}`, line.item);
    pushText(cells, `B${excelRow}`, line.description);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, line.each);
    pushFormula(cells, `E${excelRow}`, qtyEachTotal(excelRow));
    unlockInputCols(unlocked, excelRow, 4);
    excelRow += 1;
  }
  const first = 7;
  const lastLive = excelRow - 1;
  const last = lastLive + ESTIMATE_XLSX_SPARE_ROWS;
  for (; excelRow <= last; excelRow += 1) {
    pushFormula(cells, `E${excelRow}`, qtyEachTotal(excelRow));
    unlockInputCols(unlocked, excelRow, 4);
  }
  pushText(cells, `A${excelRow}`, "TOTAL");
  pushFormula(cells, `E${excelRow}`, `SUM(E${first}:E${last})`);
  return { name: ESTIMATE_XLSX_SHEETS.misc, cells, sheetTotal: `E${excelRow}`, unlocked };
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
  const unlocked: Array<{ row: number; col: number }> = [];
  const validations: NonNullable<WorkbookSheet["validations"]> = [];
  const markup = commercialMarkupRate(input.client, input.site);
  const writeSubFormulas = (row: number) => {
    pushFormula(cells, `F${row}`, `${nCell(`C${row}`)}*${nCell(`D${row}`)}`);
    pushFormula(cells, `G${row}`, `IF(UPPER(TRIM(E${row}))="YES",0,F${row}*${markup})`);
    pushFormula(cells, `H${row}`, `F${row}+G${row}`);
    unlockInputCols(unlocked, row, 5);
    validations.push({ sqref: `E${row}`, formulae: [listFormula("I", 2)] });
  };
  for (const line of lines) {
    pushText(cells, `A${excelRow}`, line.vendor);
    pushText(cells, `B${excelRow}`, line.scope);
    pushNum(cells, `C${excelRow}`, line.qty);
    pushNum(cells, `D${excelRow}`, line.rate);
    pushText(cells, `E${excelRow}`, line.affiliate ? "YES" : "NO");
    pushText(cells, `${colLetter(SUB_HIDDEN_ID_COL)}${excelRow}`, line.id);
    writeSubFormulas(excelRow);
    excelRow += 1;
  }
  for (const card of cards) {
    const amount = subCardTotal(card, ctx);
    pushText(cells, `A${excelRow}`, card.vendor);
    pushText(cells, `B${excelRow}`, card.kind);
    pushNum(cells, `C${excelRow}`, 1);
    pushNum(cells, `D${excelRow}`, amount);
    pushText(cells, `E${excelRow}`, card.affiliate ? "YES" : "NO");
    pushText(cells, `${colLetter(SUB_HIDDEN_ID_COL)}${excelRow}`, card.id);
    writeSubFormulas(excelRow);
    excelRow += 1;
  }
  const first = 7;
  const lastLive = excelRow - 1;
  const last = lastLive + ESTIMATE_XLSX_SPARE_ROWS;
  for (; excelRow <= last; excelRow += 1) {
    writeSubFormulas(excelRow);
  }
  const totalRow = excelRow;
  pushText(cells, `A${totalRow}`, "ESTIMATE TOTAL $");
  pushFormula(cells, `F${totalRow}`, `SUM(F${first}:F${last})`);
  pushFormula(cells, `G${totalRow}`, `SUM(G${first}:G${last})`);
  pushFormula(cells, `H${totalRow}`, `SUM(H${first}:H${last})`);
  return {
    name: ESTIMATE_XLSX_SHEETS.sub,
    cells,
    costTotal: `F${totalRow}`,
    markupTotal: `G${totalRow}`,
    sheetTotal: `H${totalRow}`,
    unlocked,
    validations,
    hiddenCols: [SUB_HIDDEN_ID_COL],
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
  if (hours) pushFormula(cells, `B${row}`, hours);
  if (amount) pushFormula(cells, `C${row}`, amount);
  return amount ? `C${row}` : null;
}

function addSummaryHours(cells: SheetCell[], row: number, label: string, hours: string) {
  pushText(cells, `A${row}`, label);
  pushFormula(cells, `B${row}`, hours);
  return `B${row}`;
}

function addSummaryAmount(cells: SheetCell[], row: number, label: string, amount: number | string, note?: string) {
  pushText(cells, `A${row}`, label);
  if (typeof amount === "number") {
    cells.push({ ref: `C${row}`, type: "number", value: money(amount), note });
  } else {
    cells.push({ ref: `C${row}`, type: "formula", value: amount, note });
  }
  return `C${row}`;
}

function jobMoneyFrom(input: EstimateXlsxInput) {
  return hydrateJobMoney(input.jobMeta);
}

function buildSummary(input: EstimateXlsxInput, built: BuiltSheet[]): BuiltSheet {
  const cells = headerCells(input);
  pushText(cells, "A6", "Rollup line");
  pushText(cells, "B6", ESTIMATE_SUMMARY_HOURS);
  pushText(cells, "C6", ESTIMATE_SUMMARY_AMOUNT);
  const byName = new Map(built.map((sheet) => [xlsxName(sheet.name), sheet]));
  const moneyRefs: string[] = [];
  const hourRefs: string[] = [];
  const laborHourByName = new Map<string, string>();
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
    if (hours) {
      hourRefs.push(`B${row}`);
      laborHourByName.set(name, `B${row}`);
    }
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
  // Support hours stay off this ratio: Summary has one Support labor $ line
  // and does not split those hours by Bill as (craft → Direct, staff/foreman → Indirect).
  const indirectParts = [
    laborHourByName.get(ESTIMATE_XLSX_SHEETS.staff),
    laborHourByName.get(ESTIMATE_XLSX_SHEETS.foremen),
  ].filter((ref): ref is string => Boolean(ref));
  const directHrs = laborHourByName.get(ESTIMATE_XLSX_SHEETS.direct);
  if (indirectParts.length || directHrs) {
    const indirect = indirectParts.length === 0 ? "0" : indirectParts.length === 1 ? indirectParts[0] : `SUM(${indirectParts.join(",")})`;
    const direct = directHrs ?? "0";
    pushText(cells, `A${row}`, INDIRECT_DIRECT_RATIO_LABEL);
    pushFormula(cells, `B${row}`, `IF(N(${direct})=0,"",(${indirect})/(${direct}))`);
    row += 1;
    pushText(cells, `A${row}`, DIRECT_PER_INDIRECT_LABEL);
    pushFormula(cells, `B${row}`, `IF(N(${indirect})=0,"",(${direct})/(${indirect}))`);
    row += 1;
  }

  const extra: Array<[string, string]> = [
    ["Travel $", ESTIMATE_XLSX_SHEETS.travel],
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
    const total = sheet?.costTotal ?? sheet?.sheetTotal;
    if (!sheet || !total) continue;
    const ref = addSummaryLine(cells, row, label, safeSheetAmount(sheetRef(name, total)));
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
  const laborAmountRef = laborCell ? `C${laborCell.ref.slice(1)}` : null;
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
  if (adders.cbaIncrease || money.cbaIncreaseOn) {
    cbaRef = addSummaryAmount(cells, row, CBA_INCREASE_LABEL, adders.cbaIncrease, XLSX_JOB_MONEY_NOTES.cbaSummary);
    moneyRefs.push(cbaRef);
    row += 1;
  }

  if (laborAmountRef) {
    // Labor ST/OT/DT $ only. CBA is its own Summary line — not in this base.
    moneyRefs.push(
      addSummaryAmount(cells, row, LABOR_CONTINGENCY_LABEL, `${laborAmountRef}*${jobSetupNumRef(JOB_SETUP_LABOR_CONT_CELL)}/100`),
    );
    row += 1;
  }
  if (equipmentRefs.length) {
    const base = equipmentRefs.length === 1 ? equipmentRefs[0] : `SUM(${equipmentRefs.join(",")})`;
    moneyRefs.push(
      addSummaryAmount(cells, row, EQUIPMENT_CONTINGENCY_LABEL, `${base}*${jobSetupNumRef(JOB_SETUP_EQUIP_CONT_CELL)}/100`),
    );
    row += 1;
  }
  if (subContingencyBase) {
    moneyRefs.push(
      addSummaryAmount(cells, row, SUBS_CONTINGENCY_LABEL, `${subContingencyBase}*${jobSetupNumRef(JOB_SETUP_SUBS_CONT_CELL)}/100`),
    );
    row += 1;
  }
  const moreHrs = moreFundHours(input.crew ?? {}, site, client);
  if (moreHrs > 0) {
    moneyRefs.push(addSummaryAmount(cells, row, MORE_FUND_LABEL, `${moreHrs}*${jobSetupNumRef(JOB_SETUP_MORE_CELL)}`));
    row += 1;
  } else if (adders.moreFund) {
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
    subcontractor: subcontractorMarkupBase(subSheet, { site, client, otAfter8: Boolean(input.crew?.otAfter8) }),
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
  if (moneyRefs.length) pushFormula(cells, `C${totalRow}`, `SUM(${moneyRefs.join(",")})`);
  else pushNum(cells, `C${totalRow}`, 0);
  if (hourRefs.length) pushFormula(cells, `B${totalRow}`, `SUM(${hourRefs.join(",")})`);

  return {
    name: ESTIMATE_XLSX_SHEETS.summary,
    cells,
    sheetTotal: `C${totalRow}`,
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
  return `='${ESTIMATE_XLSX_SHEETS.lists}'!$${col}$1:$${col}$${Math.max(1, count)}`;
}

const PERIOD_LIST_COL = "J";
const STAFF_SEAT_LIST_COL = "K";
const CLOCK_PICK_LIST_COL = "L";
/** Unique non-full period subsets — one helper column each so live rows can drop missing rates. */
const PERIOD_SUBSET_LISTS = [
  ["daily"],
  ["weekly"],
  ["monthly"],
  ["daily", "weekly"],
  ["daily", "monthly"],
  ["weekly", "monthly"],
] as const;
const PERIOD_SUBSET_START_COL = 13;

type PeriodValidationRow = { row: number; periods: readonly string[] };

function staffSeatListTitles() {
  return uniqueTitles([
    ...WOOD_RIVER_STAFF_TITLES,
    ...SHAHAN_STAFF_TITLES,
    ...SHAHAN_GENERAL_FOREMAN_TITLES,
    ...SHAHAN_FOREMAN_TITLES,
    ...SHAHAN_CRAFT_TITLES,
    ...SHAHAN_SUPPORT_TITLES,
    ...SUPPORT_BILLED_AS_TITLES,
  ]).filter((title) => isStaffSeat(title));
}

function listedPeriods(periods: readonly string[]) {
  return THIRD_PARTY_PERIODS.filter((period) => periods.includes(period));
}

function periodListRef(periods: readonly string[]): { col: string; count: number } | null {
  const listed = listedPeriods(periods);
  if (!listed.length) return null;
  if (listed.length === THIRD_PARTY_PERIODS.length) {
    return { col: PERIOD_LIST_COL, count: THIRD_PARTY_PERIODS.length };
  }
  const key = listed.join("|");
  const index = PERIOD_SUBSET_LISTS.findIndex((item) => item.join("|") === key);
  if (index < 0) return { col: PERIOD_LIST_COL, count: THIRD_PARTY_PERIODS.length };
  return { col: colLetter(PERIOD_SUBSET_START_COL + index), count: listed.length };
}

function periodValidations(rows: PeriodValidationRow[]) {
  const next: Array<{
    sqref: string;
    formulae: string[];
    showErrorMessage?: boolean;
    errorTitle?: string;
    error?: string;
  }> = [];
  for (const { row, periods } of rows) {
    const list = periodListRef(periods);
    if (!list) continue;
    next.push({
      sqref: `B${row}`,
      formulae: [listFormula(list.col, list.count)],
      showErrorMessage: true,
      errorTitle: "Period",
      error: "That period has no rate for this item.",
    });
  }
  return next;
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
  next.push(
    ...blocks.map((block) => ({
      sqref: `E${block.start}`,
      formulae: [listFormula(CLOCK_PICK_LIST_COL, LABOR_CLOCK_PICKS.length)],
    })),
  );
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
    ["4", "5", "6", "7"],
    ["8", "9", "10", "12", "13"],
    ["YES", "NO"],
    [...THIRD_PARTY_PERIODS],
    staffSeatListTitles(),
    [...LABOR_CLOCK_PICKS],
    ...PERIOD_SUBSET_LISTS.map((list) => [...list]),
  ];
  const cells: SheetCell[] = [];
  columns.forEach((list, index) => {
    const col = colLetter(index + 1);
    list.forEach((title, row) => pushText(cells, `${col}${row + 1}`, title));
  });
  return { name: ESTIMATE_XLSX_SHEETS.lists, cells, veryHidden: true, merges: [] };
}

function jobSetupStartMinFormula(row: number) {
  if (row <= 7) return "DATE(1990,1,1)";
  const prev = row - 1;
  return `IF($B${row}<>"ON",DATE(1990,1,1),IF(COUNTIF($B$7:$B${prev},"ON")=0,DATE(1990,1,1),LOOKUP(2,1/($B$7:$B${prev}="ON"),$D$7:$D${prev})+1))`;
}

function jobSetupDateValidation(sqref: string, minFormula: string, title: string, error: string) {
  return {
    sqref,
    type: "date" as const,
    operator: "greaterThanOrEqual" as const,
    formulae: [minFormula],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: title,
    error,
  };
}

function buildJobSetupSheet(input: EstimateXlsxInput): WorkbookSheet {
  const schedule = mergeSchedule(input.schedule);
  const drivers = jobMoneyFrom(input);
  const rates = {
    staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
    craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
    staffMileageRate: Number(input.jobMeta?.staffMileageRate) || 0,
    craftMileageRate: Number(input.jobMeta?.craftMileageRate) || 0,
  };
  const cells = headerCells(input);
  const headers = ["Phase", "ON", "Start", "Stop", "Days/wk", "Hrs/day", "OT after 8"];
  headers.forEach((label, index) => {
    const ref = `${colLetter(index + 1)}6`;
    const note = label === "Start" ? XLSX_INPUT_NOTES.start : label === "Stop" ? XLSX_INPUT_NOTES.stop : undefined;
    cells.push({ ref, type: "text", value: label, note });
  });
  const unlocked: Array<{ row: number; col: number }> = [];
  const comments: WorkbookComment[] = [];
  const validations = PHASE_IDS.flatMap((_, index) => {
    const row = 7 + index;
    return [
      { sqref: `E${row}`, formulae: [listFormula("G", 4)] },
      { sqref: `F${row}`, formulae: [listFormula("H", 5)] },
      { sqref: `G${row}`, formulae: [listFormula("I", 2)] },
      jobSetupDateValidation(
        `C${row}`,
        jobSetupStartMinFormula(row),
        "Dates must flow forward",
        "ON phase Start must be on or after the previous ON Stop + 1 day. OFF phases do not block neighbors.",
      ),
      jobSetupDateValidation(
        `D${row}`,
        `C${row}`,
        "Stop cannot precede Start",
        "Phase Stop must be on or after Start.",
      ),
    ];
  });
  schedule.phases.forEach((row, index) => {
    const excelRow = 7 + index;
    pushText(cells, `A${excelRow}`, row.name);
    pushText(cells, `B${excelRow}`, row.on ? "ON" : "OFF");
    const start = parseYmd(row.start);
    const stop = parseYmd(row.stop);
    if (start) cells.push({ ref: `C${excelRow}`, type: "date", value: start, numFmt: JOB_SETUP_DATE_FMT });
    if (stop) cells.push({ ref: `D${excelRow}`, type: "date", value: stop, numFmt: JOB_SETUP_DATE_FMT });
    pushNum(cells, `E${excelRow}`, row.daysPerWeek);
    pushNum(cells, `F${excelRow}`, row.hoursPerDay);
    pushText(cells, `G${excelRow}`, row.otAfter8 ? "YES" : "NO");
    pushText(cells, `I${excelRow}`, row.id);
    for (let col = 2; col <= 7; col += 1) unlocked.push({ row: excelRow, col });
  });

  pushText(cells, "A13", JOB_SETUP_MONEY_TITLE);
  pushText(cells, "A14", "Driver");
  pushText(cells, "B14", "Value");
  const moneyRows: Array<{
    cell: string;
    label: string;
    note: string;
    kind: "number" | "text" | "date" | "empty";
    value?: number | string | Date;
    fmt?: string;
  }> = [
    { cell: JOB_SETUP_STAFF_PD_CELL, label: "Staff PD $ / day", note: XLSX_JOB_MONEY_NOTES.staffPd, kind: "number", value: rates.staffPerDiemRate, fmt: "$#,##0.00" },
    { cell: JOB_SETUP_CRAFT_PD_CELL, label: "Craft PD $ / day", note: XLSX_JOB_MONEY_NOTES.craftPd, kind: "number", value: rates.craftPerDiemRate, fmt: "$#,##0.00" },
    { cell: JOB_SETUP_STAFF_MILE_CELL, label: "Staff mileage $ / mile", note: XLSX_JOB_MONEY_NOTES.staffMile, kind: "number", value: rates.staffMileageRate, fmt: "$#,##0.00" },
    { cell: JOB_SETUP_CRAFT_MILE_CELL, label: "Craft mileage $ / mile", note: XLSX_JOB_MONEY_NOTES.craftMile, kind: "number", value: rates.craftMileageRate, fmt: "$#,##0.00" },
    { cell: JOB_SETUP_LABOR_CONT_CELL, label: "Labor contingency %", note: XLSX_JOB_MONEY_NOTES.laborCont, kind: "number", value: drivers.laborContingencyPct, fmt: "0.0" },
    { cell: JOB_SETUP_EQUIP_CONT_CELL, label: "Equipment contingency %", note: XLSX_JOB_MONEY_NOTES.equipCont, kind: "number", value: drivers.equipmentContingencyPct, fmt: "0.0" },
    { cell: JOB_SETUP_SUBS_CONT_CELL, label: "Subs contingency %", note: XLSX_JOB_MONEY_NOTES.subsCont, kind: "number", value: drivers.subsContingencyPct, fmt: "0.0" },
    { cell: JOB_SETUP_CBA_ON_CELL, label: "CBA increase ON", note: XLSX_JOB_MONEY_NOTES.cbaOn, kind: "text", value: drivers.cbaIncreaseOn ? "YES" : "NO" },
    {
      cell: JOB_SETUP_CBA_DATE_CELL,
      label: "CBA effective date",
      note: XLSX_JOB_MONEY_NOTES.cbaDate,
      kind: drivers.cbaIncreaseDate && parseYmd(drivers.cbaIncreaseDate) ? "date" : "empty",
      value: drivers.cbaIncreaseDate ? parseYmd(drivers.cbaIncreaseDate) ?? undefined : undefined,
      fmt: JOB_SETUP_DATE_FMT,
    },
    { cell: JOB_SETUP_CBA_PCT_CELL, label: "CBA increase %", note: XLSX_JOB_MONEY_NOTES.cbaPct, kind: "number", value: drivers.cbaIncreasePct, fmt: "0.0" },
    {
      cell: JOB_SETUP_MORE_CELL,
      label: "M.O.R.E. fund $ / hr",
      note: XLSX_JOB_MONEY_NOTES.more,
      kind: "number",
      value: drivers.moreFundPerHour ?? 0,
      fmt: "$#,##0.00",
    },
  ];
  for (const item of moneyRows) {
    const row = Number(/(\d+)$/.exec(item.cell)?.[1] || 0);
    pushText(cells, `A${row}`, item.label);
    unlocked.push({ row, col: 2 });
    if (item.kind === "number" && typeof item.value === "number") {
      cells.push({ ref: item.cell, type: "number", value: money(item.value), note: item.note, numFmt: item.fmt });
    } else if (item.kind === "text" && typeof item.value === "string") {
      cells.push({ ref: item.cell, type: "text", value: item.value, note: item.note });
    } else if (item.kind === "date" && item.value instanceof Date) {
      cells.push({ ref: item.cell, type: "date", value: item.value, note: item.note, numFmt: JOB_SETUP_DATE_FMT });
    } else {
      comments.push({ ref: item.cell, text: item.note });
    }
  }
  validations.push(
    { sqref: JOB_SETUP_CBA_ON_CELL, formulae: [listFormula("I", 2)] },
    jobSetupDateValidation(
      JOB_SETUP_CBA_DATE_CELL,
      "DATE(1990,1,1)",
      "Pick a CBA date",
      "Choose the CBA effective date from the calendar.",
    ),
  );
  return {
    name: ESTIMATE_XLSX_SHEETS.jobSetup,
    cells,
    hiddenCols: [8, 9],
    unlocked,
    validations,
    comments: comments.length ? comments : undefined,
    headerRows: [13, 14],
    merges: ["A1:G1", "A2:G2", "A3:G3", "A13:B13"],
  };
}

/** Summary always. Job setup + Position lists always (import compile). Optional tabs when live. */
export function buildEstimateWorkbook(input: EstimateXlsxInput = {}): WorkbookSheet[] {
  input = { ...input, equipment: resolveEquipmentSheet(input.equipment) };
  const used = usedRateKeys(input.crew);
  const keys = used.length ? rateCatalogKeys(used) : [];
  const lastRateRow = keys.length ? 6 + keys.length : 0;
  const rates = buildRateSheet(input, keys);
  const staffCardRows = input.crew?.staff ?? [];
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
  const staffTravel = buildTravelSheet(input, input.otherCost?.travel ?? [], ESTIMATE_XLSX_SHEETS.travel);
  const misc = buildMiscSheet(input);
  const sub = buildSubSheet(input);
  const body = [staff, foremen, direct, support, rental, tension, crane, sub, coe, staffTravel, misc, rates]
    .filter((sheet): sheet is BuiltSheet => Boolean(sheet))
    .map((sheet) => ({ ...sheet, name: xlsxName(sheet.name) }));
  const setup = { ...buildJobSetupSheet(input), name: xlsxName(ESTIMATE_XLSX_SHEETS.jobSetup) };
  const lists = { ...buildListsSheet(), name: xlsxName(ESTIMATE_XLSX_SHEETS.lists) };
  const jobDays = buildJobDaysSheet(laborCalendarDates(input));
  const helpers = jobDays ? [{ ...jobDays, name: xlsxName(ESTIMATE_XLSX_SHEETS.jobDays) }] : [];
  const crewRanges = buildCrewRangesSheet(input);
  if (crewRanges) helpers.push({ ...crewRanges, name: xlsxName(ESTIMATE_XLSX_SHEETS.crewRanges) });
  return [
    { ...buildSummary(input, body), name: xlsxName(ESTIMATE_XLSX_SHEETS.summary) },
    setup,
    ...body,
    lists,
    ...helpers,
  ].map(attachEstimateComments);
}

export async function estimateToXlsx(input: EstimateXlsxInput = {}): Promise<Uint8Array> {
  const resolved = { ...input, equipment: resolveEquipmentSheet(input.equipment) };
  const sheets = buildEstimateWorkbook(resolved);
  if (!sheets.length) throw new Error("empty-workbook");
  const excel = summaryAmountAt(sheets, ESTIMATE_XLSX_SHEETS.summary, "ESTIMATE TOTAL $");
  const desk = deskPackageTotal(resolved);
  if (excel == null || Math.round(excel * 100) / 100 !== desk) {
    throw new Error("summary-total-mismatch");
  }
  const bytes = await buildWorkbook(sheets, { companyLogo: input.companyLogo });
  if (!bytes.byteLength) throw new Error("empty-workbook");
  return bytes;
}
