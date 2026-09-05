/**
 * Hit Squad client workbook → live estimate pack.
 * Inverse of estimate-xlsx export. Hidden block ids + Job setup card are
 * the keys. Excel is never a parallel book (excel-ripple.ts).
 */
import ExcelJS from "exceljs";
import {
  blankCraftRow,
  CRAFT_SHIFTS,
  hydrateSupportLine,
  hydrateSupportLines,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
  type SupportLine,
} from "./craft-labor.ts";
import {
  SHAHAN_GENERAL_FOREMAN_TITLES,
} from "./shahan-wood-river.ts";
import { newEstimateKey, newEstimatePackId } from "./estimate-open.ts";
import { type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  ESTIMATE_IMPORT_ERROR,
  ESTIMATE_XLSX_SHEETS,
  JOB_SETUP_CBA_DATE_CELL,
  JOB_SETUP_CBA_ON_CELL,
  JOB_SETUP_CBA_PCT_CELL,
  JOB_SETUP_CRAFT_MILE_CELL,
  JOB_SETUP_CRAFT_PD_CELL,
  JOB_SETUP_EQUIP_CONT_CELL,
  JOB_SETUP_LABOR_CONT_CELL,
  JOB_SETUP_MONEY_TITLE,
  JOB_SETUP_MORE_CELL,
  JOB_SETUP_HOLIDAYS_TITLE,
  JOB_SETUP_HOLIDAY_START_ROW,
  JOB_SETUP_HOLIDAY_MAX,
  JOB_SETUP_STAFF_MILE_CELL,
  JOB_SETUP_STAFF_PD_CELL,
  JOB_SETUP_SUBS_CONT_CELL,
  LABOR_BLOCK_HEIGHT,
  LABOR_BLOCK_ID_COL,
  LABOR_DATE_START_COL,
  LABOR_DT_OFFSET,
  LABOR_HC_OFFSET,
  LABOR_HPS_OFFSET,
  LABOR_OT_OFFSET,
  LABOR_PD_OFFSET,
  LABOR_ST_OFFSET,
  SUB_HIDDEN_ID_COL,
  TRAVEL_HIDDEN_ID_COL,
  clockLabelOverride,
  laborBlockId,
  laborDayPlug,
  thirdPartyBucket,
} from "./estimate-xlsx.ts";
import { hydrateJobMeta } from "./staffing-plan.ts";
import type { JobMoney } from "./estimate-money.ts";
import type { JobRates } from "./shahan-wood-river.ts";
import { lookupShahanEquipment, rematchShahanEquipmentId } from "./shahan-wood-river.ts";
import {
  lineAmount,
  normalizeSubSheet,
  subCardTotal,
  type SubCard,
  type SubLine,
  type SubSheet,
  type SubTotalContext,
} from "./subcontractor.ts";
import {
  billedPeriodCount,
  endDateForPeriodCount,
  jobSetupWindow,
  resolveLargeToolLine,
  resolveThirdPartyLine,
  type LargeToolLine,
  type ThirdPartyLine,
  type ThirdPartyPeriod,
} from "./equipment-sheet.ts";
import { type MiscLine, type OtherCostSheet, type TravelKind, type TravelLine } from "./other-cost.ts";
import type { B2Period } from "./b2-east-coast.ts";
import { hydrateHolidays, isStaffSeat, type ClockOverride } from "./hours-clock.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import {
  cascadePhases,
  formatYmd,
  isPhaseId,
  mergeSchedule,
  parseYmd,
  PHASE_IDS,
  PHASE_NAMES,
  PHASE_OT_PICKS,
  eachYmd,
  maskForPhaseDays,
  phaseOwningDate,
  type PhaseOtPick,
  type PhaseRow,
  type PhaseScheduleState,
} from "./phase-schedule.ts";

export { ESTIMATE_IMPORT_ERROR };

export type ImportedDay = {
  ymd: string;
  hc: number;
  hps: number;
  st: number;
  ot: number;
  dt: number;
  pd: number;
  typedSt?: boolean;
  typedOt?: boolean;
  typedDt?: boolean;
};

export type ImportedBlock = {
  id: string;
  night: boolean;
  position: string;
  sheet: string;
  billedAs?: string;
  clockOverride?: ClockOverride;
  days: ImportedDay[];
  /** False when Subtotal $ was baked to a number (formula-strip / CHAOS). */
  hourFormulasIntact?: boolean;
};

export type ImportedCostLine = {
  item: string;
  description?: string;
  period?: string;
  qty: number;
  rate: number;
  freight?: number;
  periods?: number;
  travelers?: number;
  miles?: number;
  kind?: TravelKind;
  affiliate?: boolean;
  itemId?: string;
};

export type EstimateImport = {
  title: string;
  client: string;
  site: string;
  schedule: PhaseScheduleState;
  crew: EstimateXlsxCrew;
  blocks: ImportedBlock[];
  /** Present when that tab exists. Filled spare rows are included; blank pad is not. */
  travel?: ImportedCostLine[];
  misc?: ImportedCostLine[];
  rental?: ImportedCostLine[];
  tension?: ImportedCostLine[];
  crane?: ImportedCostLine[];
  coe?: ImportedCostLine[];
  subs?: ImportedCostLine[];
  jobMeta?: Partial<JobRates & JobMoney>;
  /** Hidden _CrewRanges stacks, keyed by craft row id. Create-new only when the daily grid still matches. */
  crewRanges?: Record<string, CalendarRange[]>;
  /** Typed-over ST/OT/DT that were not honored (hours still follow HC / Hours/shift / PD). */
  warnings?: string[];
};

export type EstimateImportDiff = {
  lines: string[];
  createsNew: boolean;
};

function isExcelError(value: unknown): boolean {
  if (typeof value === "string" && /^#(?:VALUE|REF|N\/A|DIV\/0|NAME|NULL|NUM|GETTING_DATA)!?$/i.test(value.trim())) {
    return true;
  }
  return Boolean(value && typeof value === "object" && "error" in value && (value as { error?: unknown }).error);
}

function asNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if (text.startsWith("=") || isExcelError(text)) return 0;
    const next = Number(text);
    return Number.isFinite(next) ? next : 0;
  }
  if (value && typeof value === "object") {
    if (isExcelError(value)) return 0;
    if ("result" in value) return asNum((value as { result: unknown }).result);
  }
  return 0;
}

function asText(value: unknown): string {
  if (typeof value === "string") return isExcelError(value) ? "" : value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value && typeof value === "object") {
    if (isExcelError(value)) return "";
    if ("result" in value) return asText((value as { result: unknown }).result);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatYmd(value);
  return "";
}

function cellYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYmd(new Date(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return formatYmd(new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  }
  const text = asText(value);
  if (parseYmd(text)) return text;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return formatYmd(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  }
  if (value && typeof value === "object" && "result" in value) return cellYmd((value as { result: unknown }).result);
  return "";
}

function isOn(value: unknown): boolean {
  const text = asText(value).toUpperCase();
  return text === "ON" || text === "YES" || text === "TRUE" || text === "1" || text === "Y";
}

/** Job line on Summary A2 only. Title-block Status / Prepared by / A3 is export-only. Import does not overwrite pack status. */
function parseHeader(job: string): { title: string; client: string; site: string } {
  const parts = job.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    title: parts[0] || "Estimate",
    client: parts[1] || "",
    site: parts[2] || "",
  };
}

function parseBlockId(raw: string): { id: string; night: boolean } | null {
  const value = raw.trim();
  if (!value || !value.includes("|")) return null;
  const cut = value.lastIndexOf("|");
  const id = value.slice(0, cut).trim();
  const side = value.slice(cut + 1).trim().toLowerCase();
  if (!id) return null;
  return { id, night: side === "night" };
}

function sheetDates(ws: ExcelJS.Worksheet): string[] {
  const dates: string[] = [];
  let first = "";
  for (let col = LABOR_DATE_START_COL; col < LABOR_DATE_START_COL + 400; col += 1) {
    const ymd = cellYmd(ws.getCell(6, col).value);
    if (ymd) {
      if (!first) first = ymd;
      dates.push(ymd);
      continue;
    }
    if (!first) break;
    const start = parseYmd(first);
    if (!start) break;
    start.setDate(start.getDate() + dates.length);
    const next = formatYmd(start);
    const hidden = Boolean(ws.getColumn(col).hidden);
    if (hidden && dates.length) break;
    dates.push(next);
  }
  return dates;
}

function cellIsFormula(value: unknown): boolean {
  if (typeof value === "string" && value.trim().startsWith("=")) return true;
  if (value && typeof value === "object") {
    const row = value as { formula?: unknown; sharedFormula?: unknown };
    return Boolean(row.formula || row.sharedFormula);
  }
  return false;
}

function hourCell(ws: ExcelJS.Worksheet, row: number, col: number): { value: number; typed: boolean } {
  const raw = ws.getCell(row, col).value;
  const empty = raw == null || raw === "";
  return { value: asNum(raw), typed: !empty && !cellIsFormula(raw) };
}

function readBlockDays(ws: ExcelJS.Worksheet, titleRow: number, dates: string[]): ImportedDay[] {
  return dates.map((ymd, index) => {
    const col = LABOR_DATE_START_COL + index;
    const st = hourCell(ws, titleRow + LABOR_ST_OFFSET, col);
    const ot = hourCell(ws, titleRow + LABOR_OT_OFFSET, col);
    const dt = hourCell(ws, titleRow + LABOR_DT_OFFSET, col);
    return {
      ymd,
      hc: asNum(ws.getCell(titleRow + LABOR_HC_OFFSET, col).value),
      hps: asNum(ws.getCell(titleRow + LABOR_HPS_OFFSET, col).value),
      st: st.value,
      ot: ot.value,
      dt: dt.value,
      pd: asNum(ws.getCell(titleRow + LABOR_PD_OFFSET, col).value),
      typedSt: st.typed,
      typedOt: ot.typed,
      typedDt: dt.typed,
    };
  });
}

function applyTypedHourPolicy(blocks: ImportedBlock[]): { blocks: ImportedBlock[]; warnings: string[] } {
  const warnings: string[] = [];
  const next = blocks.map((block) => {
    if (!block.hourFormulasIntact) return block;
    const days = block.days.map((day) => {
      const typedAny = Boolean(day.typedSt || day.typedOt || day.typedDt);
      const typedAll = Boolean(day.typedSt && day.typedOt && day.typedDt);
      if (typedAll && day.hc > 0) {
        const total = day.st + day.ot + day.dt;
        if (total > 0) return { ...day, hps: total / day.hc };
      }
      if (typedAny && !typedAll) {
        const label = block.position.trim() || block.id;
        warnings.push(
          `${label}: typed ST/OT/DT on ${day.ymd} ignored — hours follow HC / Hours/shift / PD.`,
        );
      }
      return day;
    });
    return { ...block, days };
  });
  return { blocks: next, warnings };
}

function dayLive(day: ImportedDay) {
  return day.hc > 0 || day.pd > 0;
}

function dayPattern(day: Pick<ImportedDay, "hc" | "hps" | "pd">) {
  return `${day.hc}|${day.hps}|${day.pd}`;
}

function daysMask(days: ImportedDay[]): boolean[] {
  const mask = [false, false, false, false, false, false, false];
  for (const day of days) {
    const date = parseYmd(day.ymd);
    if (date) mask[date.getDay()] = true;
  }
  return mask;
}

function priorOtAfter8(existing: CraftRow | undefined, phaseId: string | undefined, night: boolean): boolean | undefined {
  const ranges = existing?.ranges ?? [];
  const hit = ranges.find((range) => range.phaseId === phaseId && (range.shift === "Nights") === night)
    ?? ranges.find((range) => range.phaseId === phaseId);
  return hit?.otAfter8;
}

function rangeFromPattern(
  days: ImportedDay[],
  night: boolean,
  phase: PhaseRow | undefined,
  start: string,
  end: string,
  pattern: Pick<ImportedDay, "hc" | "hps" | "pd">,
  skipDates: string[],
  existing?: CraftRow,
): CalendarRange {
  return {
    id: `rg-${start}-${night ? "n" : "d"}-${phase?.id ?? "x"}`,
    start,
    end,
    headcount: pattern.hc,
    nightHeadcount: 0,
    hoursPerShift: pattern.hps,
    perDiemPeople: pattern.pd,
    nightPerDiemPeople: 0,
    days: days.some(dayLive) ? daysMask(days.filter((day) => dayPattern(day) === dayPattern(pattern) && dayLive(day))) : maskForPhaseDays(phase?.daysPerWeek ?? 5),
    skipDates,
    phaseId: phase?.id,
    shift: night ? "Nights" : "Days",
    otAfter8:
      priorOtAfter8(existing, phase?.id, night) ??
      (existing && isStaffSeat(existing.position) ? false : phase?.otAfter8),
  };
}

function rangeShiftOf(range: CalendarRange): CalendarRange["shift"] {
  return range.shift ?? "Days";
}

function existingDayPlug(
  row: CraftRow,
  ymd: string,
  night: boolean,
  holidays: string[] = [],
): Pick<ImportedDay, "hc" | "hps" | "pd"> {
  return laborDayPlug(row, ymd, night, holidays);
}

function sameQty(left: number, right: number) {
  return Math.abs(left - right) < 0.02;
}

function existingMatchesDays(
  row: CraftRow | undefined,
  days: ImportedDay[],
  night: boolean,
  holidays: string[] = [],
): boolean {
  if (!row?.ranges?.length) return false;
  return days.every((day) => {
    const plug = existingDayPlug(row, day.ymd, night, holidays);
    return sameQty(plug.hc, day.hc) && sameQty(plug.pd, day.pd) && (day.hc <= 0 || sameQty(plug.hps, day.hps) || plug.hps === 0);
  });
}

function existingRangesForSide(row: CraftRow, night: boolean): CalendarRange[] {
  return (row.ranges ?? []).filter((range) => {
    const shift = rangeShiftOf(range);
    return night ? shift === "Nights" : shift !== "Nights";
  });
}

function fillBlankHps(
  days: ImportedDay[],
  night: boolean,
  phases: PhaseRow[],
  existing?: CraftRow,
  holidays: string[] = [],
): ImportedDay[] {
  return days.map((day) => {
    if (day.hps > 0 || day.hc <= 0) return day;
    const plug = existing ? existingDayPlug(existing, day.ymd, night, holidays) : { hc: 0, hps: 0, pd: 0 };
    const phase = phaseOwningDate(phases, day.ymd);
    const hps = plug.hps || Number(existing?.ranges?.[0]?.hoursPerShift) || Number(phase?.hoursPerDay) || 0;
    return hps > 0 ? { ...day, hps } : day;
  });
}

function rangesFromDays(
  days: ImportedDay[],
  night: boolean,
  phases: PhaseRow[],
  existing?: CraftRow,
  holidays: string[] = [],
): CalendarRange[] {
  const holidaySet = new Set(hydrateHolidays(holidays));
  const filled = fillBlankHps(days, night, phases, existing, holidays);
  if (existing && existingMatchesDays(existing, filled, night, holidays)) {
    return existingRangesForSide(existing, night);
  }
  const byYmd = new Map(filled.map((day) => [day.ymd, day]));
  const used = new Set<string>();
  const ranges: CalendarRange[] = [];
  const onPhases = phases.filter((phase) => phase.on && phase.start && phase.stop);
  for (const phase of onPhases) {
    const window = eachYmd(phase.start, phase.stop).map((ymd) => {
      const day = byYmd.get(ymd) ?? { ymd, hc: 0, hps: 0, st: 0, ot: 0, dt: 0, pd: 0 };
      used.add(ymd);
      const owner = phaseOwningDate(phases, ymd);
      if (owner?.id !== phase.id) return { ...day, hc: 0, hps: 0, st: 0, ot: 0, dt: 0, pd: 0 };
      return day;
    });
    const firstLive = window.find(dayLive);
    const pattern = firstLive ?? { hc: 0, hps: phase.hoursPerDay || 0, pd: 0 };
    const skipDates = window
      .filter((day) => !holidaySet.has(day.ymd) && (!dayLive(day) || dayPattern(day) !== dayPattern(pattern)))
      .map((day) => day.ymd);
    ranges.push(rangeFromPattern(window, night, phase, phase.start, phase.stop, pattern, skipDates, existing));
    const extras = window.filter((day) => dayLive(day) && dayPattern(day) !== dayPattern(pattern));
    const extraPatterns = new Map<string, ImportedDay[]>();
    for (const day of extras) {
      const key = dayPattern(day);
      const list = extraPatterns.get(key) ?? [];
      list.push(day);
      extraPatterns.set(key, list);
    }
    for (const group of extraPatterns.values()) {
      const start = group[0].ymd;
      const end = group[group.length - 1].ymd;
      const skip = eachYmd(start, end).filter((ymd) => !holidaySet.has(ymd) && !group.some((day) => day.ymd === ymd));
      ranges.push(rangeFromPattern(group, night, phase, start, end, group[0], skip, existing));
    }
  }
  const leftover = filled.filter((day) => !used.has(day.ymd) && dayLive(day));
  const leftoverPatterns = new Map<string, ImportedDay[]>();
  for (const day of leftover) {
    const key = dayPattern(day);
    const list = leftoverPatterns.get(key) ?? [];
    list.push(day);
    leftoverPatterns.set(key, list);
  }
  for (const group of leftoverPatterns.values()) {
    const start = group[0].ymd;
    const end = group[group.length - 1].ymd;
    const skip = eachYmd(start, end).filter((ymd) => !holidaySet.has(ymd) && !group.some((day) => day.ymd === ymd));
    ranges.push(rangeFromPattern(group, night, phaseOwningDate(phases, start), start, end, group[0], skip, existing));
  }
  return ranges;
}

function parseJobSetup(ws: ExcelJS.Worksheet | undefined): PhaseScheduleState {
  const base = mergeSchedule(null);
  if (!ws) return base;
  const incoming: PhaseRow[] = [];
  for (let row = 7; row <= 20; row += 1) {
    const hiddenId = asText(ws.getCell(row, 9).value);
    const name = asText(ws.getCell(row, 1).value);
    const id = isPhaseId(hiddenId)
      ? hiddenId
      : (PHASE_IDS.find((item) => PHASE_NAMES[item] === name) ?? null);
    if (!id) continue;
    const start = cellYmd(ws.getCell(row, 3).value);
    let stop = cellYmd(ws.getCell(row, 4).value);
    if (start && stop && stop < start) stop = start;
    const pickLabel = asText(ws.getCell(row, 8).value);
    const pick = PHASE_OT_PICKS.find((item) => item.label === pickLabel)?.id as PhaseOtPick | undefined;
    const days = asNum(ws.getCell(row, 5).value);
    const hours = asNum(ws.getCell(row, 6).value);
    incoming.push({
      id,
      name: PHASE_NAMES[id],
      on: isOn(ws.getCell(row, 2).value),
      start: start || base.phases.find((row) => row.id === id)?.start || "",
      stop: stop || base.phases.find((row) => row.id === id)?.stop || "",
      daysPerWeek: days || (pick?.startsWith("4x") ? 4 : pick?.startsWith("5x") ? 5 : 5),
      hoursPerDay: hours || (pick?.includes("10") ? 10 : pick?.includes("8") ? 8 : 10),
      otAfter8: isOn(ws.getCell(row, 7).value) || Boolean(pick?.endsWith("ot8")),
      sundaysOff: [],
    });
  }
  const merged = mergeSchedule({
    ...base,
    phases: incoming,
    projectStart: incoming.find((row) => row.on)?.start || base.projectStart,
  });
  return { ...merged, phases: cascadePhases(merged.phases) };
}

function jobSetupCell(ws: ExcelJS.Worksheet, ref: string) {
  const col = ref.charCodeAt(0) - 64;
  const row = Number(ref.slice(1));
  return ws.getCell(row, col);
}

function parseJobSetupMoney(ws: ExcelJS.Worksheet | undefined): Partial<JobRates & JobMoney> | undefined {
  if (!ws) return undefined;
  const title = asText(ws.getCell(13, 1).value);
  const staffLabel = asText(ws.getCell(15, 1).value);
  if (title !== JOB_SETUP_MONEY_TITLE && staffLabel !== "Staff PD $ / day") return undefined;
  const moreRaw = jobSetupCell(ws, JOB_SETUP_MORE_CELL).value;
  const moreEmpty = moreRaw == null || moreRaw === "";
  return {
    staffPerDiemRate: asNum(jobSetupCell(ws, JOB_SETUP_STAFF_PD_CELL).value),
    craftPerDiemRate: asNum(jobSetupCell(ws, JOB_SETUP_CRAFT_PD_CELL).value),
    staffMileageRate: asNum(jobSetupCell(ws, JOB_SETUP_STAFF_MILE_CELL).value),
    craftMileageRate: asNum(jobSetupCell(ws, JOB_SETUP_CRAFT_MILE_CELL).value),
    laborContingencyPct: asNum(jobSetupCell(ws, JOB_SETUP_LABOR_CONT_CELL).value),
    equipmentContingencyPct: asNum(jobSetupCell(ws, JOB_SETUP_EQUIP_CONT_CELL).value),
    subsContingencyPct: asNum(jobSetupCell(ws, JOB_SETUP_SUBS_CONT_CELL).value),
    cbaIncreaseOn: isOn(jobSetupCell(ws, JOB_SETUP_CBA_ON_CELL).value),
    cbaIncreaseDate: cellYmd(jobSetupCell(ws, JOB_SETUP_CBA_DATE_CELL).value),
    cbaIncreasePct: asNum(jobSetupCell(ws, JOB_SETUP_CBA_PCT_CELL).value),
    moreFundPerHour: moreEmpty ? null : asNum(moreRaw),
    holidays: parseJobSetupHolidays(ws),
  };
}

function parseJobSetupHolidays(ws: ExcelJS.Worksheet): string[] {
  const title = asText(ws.getCell(JOB_SETUP_HOLIDAY_START_ROW, 1).value);
  if (title && title !== JOB_SETUP_HOLIDAYS_TITLE) return [];
  const dates: string[] = [];
  const last = JOB_SETUP_HOLIDAY_START_ROW + JOB_SETUP_HOLIDAY_MAX - 1;
  for (let row = JOB_SETUP_HOLIDAY_START_ROW; row <= last; row += 1) {
    const ymd = cellYmd(ws.getCell(row, 2).value);
    if (ymd) dates.push(ymd);
  }
  return hydrateHolidays(dates);
}

function parseCraftSheet(ws: ExcelJS.Worksheet | undefined): ImportedBlock[] {
  if (!ws) return [];
  const dates = sheetDates(ws);
  const seen = new Set<string>();
  const blocks: ImportedBlock[] = [];
  const last = Math.max(ws.rowCount, 7);
  for (let row = 7; row <= last; row += 1) {
    const parsed = parseBlockId(asText(ws.getCell(row, LABOR_BLOCK_ID_COL).value));
    if (!parsed) continue;
    const key = laborBlockId({ id: parsed.id }, parsed.night);
    if (seen.has(key)) continue;
    seen.add(key);
    const position = asText(ws.getCell(row, 2).value);
    const billLabel = asText(ws.getCell(row + LABOR_ST_OFFSET, 2).value);
    const billedAs = billLabel.toLowerCase() === "bill as" ? asText(ws.getCell(row + LABOR_OT_OFFSET, 2).value) : undefined;
    const clockOverride = clockLabelOverride(asText(ws.getCell(row, 5).value));
    blocks.push({
      id: parsed.id,
      night: parsed.night,
      position,
      sheet: ws.name,
      billedAs,
      clockOverride,
      days: readBlockDays(ws, row, dates),
      hourFormulasIntact: cellIsFormula(ws.getCell(row, 3).value),
    });
  }
  return blocks;
}

function laneForNewBlock(block: ImportedBlock, sheet: string): keyof Pick<EstimateXlsxCrew, "staff" | "generalForeman" | "foreman" | "direct" | "support"> {
  if (sheet === ESTIMATE_XLSX_SHEETS.foremen) return "foreman";
  if (sheet === ESTIMATE_XLSX_SHEETS.direct) return "direct";
  if (sheet === ESTIMATE_XLSX_SHEETS.support) return "support";
  if (SHAHAN_GENERAL_FOREMAN_TITLES.includes(block.position)) return "generalForeman";
  return "staff";
}

function findRow(crew: EstimateXlsxCrew, id: string): { lane: keyof EstimateXlsxCrew; row: CraftRow } | null {
  for (const lane of ["staff", "generalForeman", "foreman", "direct", "support"] as const) {
    const hit = (crew[lane] ?? []).find((row) => row.id === id);
    if (hit) return { lane, row: hit };
  }
  return null;
}

function rollupHours(days: ImportedDay[]) {
  return days.reduce(
    (sum, day) => ({
      st: sum.st + day.st,
      ot: sum.ot + day.ot,
      dt: sum.dt + day.dt,
      pd: sum.pd + day.pd,
    }),
    { st: 0, ot: 0, dt: 0, pd: 0 },
  );
}

function applyRowFromBlocks(
  existing: CraftRow,
  blocks: ImportedBlock[],
  phases: PhaseRow[],
  holidays: string[] = [],
): CraftRow {
  const dayBlocks = blocks.filter((block) => !block.night);
  const nightBlocks = blocks.filter((block) => block.night);
  const position = blocks.find((block) => block.position.trim())?.position || existing.position;
  const seeded = { ...existing, position };
  const ranges = [
    ...dayBlocks.flatMap((block) => rangesFromDays(block.days, false, phases, seeded, holidays)),
    ...nightBlocks.flatMap((block) => rangesFromDays(block.days, true, phases, seeded, holidays)),
  ];
  const hours = rollupHours(blocks.flatMap((block) => block.days));
  const night = ranges.some((range) => range.shift === "Nights");
  const day = ranges.some((range) => (range.shift ?? "Days") !== "Nights");
  const billedAs =
    blocks.find((block) => (block.billedAs ?? "").trim())?.billedAs ?? (existing as SupportLine).billedAs ?? "";
  const clockOverride = blocks.find((block) => block.clockOverride)?.clockOverride ?? existing.clockOverride ?? "auto";
  return {
    ...existing,
    id: blocks[0]?.id || existing.id,
    position,
    shift: night && day ? "Days & nights" : night ? "Nights" : "Days",
    ranges,
    st: hours.st,
    ot: hours.ot,
    dt: hours.dt,
    pd: hours.pd,
    hours: hours.st + hours.ot + hours.dt,
    billedAs,
    clockOverride,
  } as CraftRow;
}

function storedRangesForRow(stored: Record<string, CalendarRange[]> | undefined, id: string): CalendarRange[] {
  return stored?.[id] ?? [];
}

function applyBlocks(
  base: EstimateXlsxCrew,
  bySheet: Array<{ sheet: string; blocks: ImportedBlock[] }>,
  phases: PhaseRow[],
  storedRanges?: Record<string, CalendarRange[]>,
  holidays: string[] = [],
): EstimateXlsxCrew {
  const next: EstimateXlsxCrew = {
    staff: [...(base.staff ?? [])],
    generalForeman: [...(base.generalForeman ?? [])],
    foreman: [...(base.foreman ?? [])],
    direct: [...(base.direct ?? [])],
    support: [...(base.support ?? [])],
    otAfter8: Boolean(base.otAfter8),
  };
  const sheetLanes = new Map<string, Set<string>>();
  for (const { sheet, blocks } of bySheet) {
    const lanes = new Set<string>();
    const byId = new Map<string, ImportedBlock[]>();
    for (const block of blocks) {
      const list = byId.get(block.id) ?? [];
      list.push(block);
      byId.set(block.id, list);
    }
    for (const group of byId.values()) {
      const found = findRow(next, group[0].id);
      const lane = found?.lane ?? laneForNewBlock(group[0], sheet);
      lanes.add(lane);
      const existing = found?.row ?? {
        ...blankCraftRow(),
        id: group[0].id,
        ranges: storedRangesForRow(storedRanges, group[0].id),
      };
      const row = applyRowFromBlocks(existing, group, phases, holidays);
      const list = [...(next[lane] as CraftRow[])];
      const index = list.findIndex((item) => item.id === row.id);
      const written = lane === "support" ? hydrateSupportLine({ ...row, billedAs: (row as SupportLine).billedAs ?? "" }) : row;
      if (index >= 0) list[index] = written;
      else list.push(written);
      (next[lane] as CraftRow[]) = list;
    }
    sheetLanes.set(sheet, lanes);
  }
  if (sheetLanes.has(ESTIMATE_XLSX_SHEETS.staff)) {
    const keep = new Set((bySheet.find((item) => item.sheet === ESTIMATE_XLSX_SHEETS.staff)?.blocks ?? []).map((block) => block.id));
    next.staff = (next.staff ?? []).filter((row) => keep.has(row.id));
    next.generalForeman = (next.generalForeman ?? []).filter((row) => keep.has(row.id));
  }
  if (sheetLanes.has(ESTIMATE_XLSX_SHEETS.foremen)) {
    const keep = new Set((bySheet.find((item) => item.sheet === ESTIMATE_XLSX_SHEETS.foremen)?.blocks ?? []).map((block) => block.id));
    next.foreman = (next.foreman ?? []).filter((row) => keep.has(row.id));
  }
  if (sheetLanes.has(ESTIMATE_XLSX_SHEETS.direct)) {
    const keep = new Set((bySheet.find((item) => item.sheet === ESTIMATE_XLSX_SHEETS.direct)?.blocks ?? []).map((block) => block.id));
    next.direct = (next.direct ?? []).filter((row) => keep.has(row.id));
  }
  if (sheetLanes.has(ESTIMATE_XLSX_SHEETS.support)) {
    const keep = new Set((bySheet.find((item) => item.sheet === ESTIMATE_XLSX_SHEETS.support)?.blocks ?? []).map((block) => block.id));
    next.support = hydrateSupportLines((next.support ?? []).filter((row) => keep.has(row.id)));
  } else {
    next.support = hydrateSupportLines(next.support ?? []);
  }
  return next;
}

function isSheetTotalLabel(value: unknown): boolean {
  return /^(TOTAL|ESTIMATE TOTAL)/i.test(asText(value));
}

function scanCostRows(ws: ExcelJS.Worksheet): number[] {
  const rows: number[] = [];
  const last = Math.max(ws.rowCount || 7, 7);
  for (let row = 7; row <= last + 32; row += 1) {
    if (isSheetTotalLabel(ws.getCell(row, 1).value)) break;
    rows.push(row);
  }
  return rows;
}

function parsePeriod(value: unknown): ThirdPartyPeriod {
  const text = asText(value).toLowerCase();
  if (text === "weekly" || text === "monthly") return text;
  return "daily";
}

function parseCoePeriod(value: unknown): B2Period {
  const text = asText(value).toLowerCase();
  if (text === "hourly" || text === "weekly" || text === "monthly" || text === "daily") return text;
  return "daily";
}

function parseMiscSheet(ws: ExcelJS.Worksheet | undefined): ImportedCostLine[] | undefined {
  if (!ws) return undefined;
  const lines: ImportedCostLine[] = [];
  for (const row of scanCostRows(ws)) {
    const item = asText(ws.getCell(row, 1).value);
    if (/craft\s*travel/i.test(item)) continue;
    const description = asText(ws.getCell(row, 2).value);
    if (/craft\s*travel/i.test(description)) continue;
    const qty = asNum(ws.getCell(row, 3).value);
    const rate = asNum(ws.getCell(row, 4).value);
    if (!item && !description && qty === 0 && rate === 0) continue;
    if (qty === 0 && rate === 0) continue;
    lines.push({ item, description, qty, rate });
  }
  return lines;
}

function parseTravelSheet(ws: ExcelJS.Worksheet | undefined): ImportedCostLine[] | undefined {
  if (!ws) return undefined;
  const lines: ImportedCostLine[] = [];
  for (const row of scanCostRows(ws)) {
    const label = asText(ws.getCell(row, 1).value).toLowerCase();
    const kind: TravelKind = label === "craft" ? "craft" : "staff";
    const travelers = asNum(ws.getCell(row, 2).value);
    const miles = asNum(ws.getCell(row, 3).value);
    const perMile = asNum(ws.getCell(row, 4).value);
    if (!label) continue;
    if (travelers === 0 && miles === 0 && perMile === 0) continue;
    const itemId = asText(ws.getCell(row, TRAVEL_HIDDEN_ID_COL).value);
    lines.push({ item: label || kind, kind, travelers, miles, rate: perMile, qty: travelers, itemId: itemId || undefined });
  }
  return lines;
}

function parseRentalLikeSheet(ws: ExcelJS.Worksheet | undefined): ImportedCostLine[] | undefined {
  if (!ws) return undefined;
  const lines: ImportedCostLine[] = [];
  for (const row of scanCostRows(ws)) {
    const item = asText(ws.getCell(row, 1).value);
    const period = asText(ws.getCell(row, 2).value).toLowerCase();
    const qty = asNum(ws.getCell(row, 3).value);
    const periods = asNum(ws.getCell(row, 4).value);
    const rate = asNum(ws.getCell(row, 5).value);
    const freight = asNum(ws.getCell(row, 6).value);
    const itemId = asText(ws.getCell(row, 8).value);
    if (!item && qty === 0 && rate === 0 && freight === 0) continue;
    lines.push({ item, period, qty, rate, freight, periods, itemId: itemId || undefined });
  }
  return lines;
}

function parseDaysMask(raw: string): boolean[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 7) return [true, true, true, true, true, true, true];
  return [...digits].map((digit) => digit === "1");
}

function parseSkipDates(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
}

function parseYesNoFlag(value: unknown): boolean | undefined {
  const text = asText(value).toUpperCase();
  if (!text) return undefined;
  if (text === "YES" || text === "TRUE" || text === "1" || text === "Y" || text === "ON") return true;
  if (text === "NO" || text === "FALSE" || text === "0" || text === "N" || text === "OFF") return false;
  return undefined;
}

function parseOptNum(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  return asNum(value);
}

function parseCrewShift(raw: string): CraftShift | undefined {
  return (CRAFT_SHIFTS as readonly string[]).includes(raw) ? (raw as CraftShift) : undefined;
}

function parseCrewRanges(ws: ExcelJS.Worksheet | undefined): Record<string, CalendarRange[]> {
  const byRow: Record<string, CalendarRange[]> = {};
  if (!ws) return byRow;
  const last = Math.max(ws.rowCount || 2, 2);
  for (let row = 2; row <= last; row += 1) {
    const blockRaw = asText(ws.getCell(row, 1).value);
    const parsed = parseBlockId(blockRaw);
    const rowId = parsed?.id || (blockRaw.includes("|") ? "" : blockRaw);
    const start = cellYmd(ws.getCell(row, 3).value);
    const end = cellYmd(ws.getCell(row, 4).value);
    if (!rowId || (!start && !end)) continue;
    const shift = parseCrewShift(asText(ws.getCell(row, 13).value));
    const sundayHeadcount = parseOptNum(ws.getCell(row, 17).value);
    const nightSundayHeadcount = parseOptNum(ws.getCell(row, 18).value);
    const range: CalendarRange = {
      id: asText(ws.getCell(row, 2).value) || `rg-${start || "x"}-${rowId}`,
      start: start || end,
      end: end || start,
      headcount: asNum(ws.getCell(row, 5).value),
      nightHeadcount: asNum(ws.getCell(row, 6).value),
      hoursPerShift: asNum(ws.getCell(row, 7).value),
      perDiemPeople: asNum(ws.getCell(row, 8).value),
      nightPerDiemPeople: asNum(ws.getCell(row, 9).value),
      days: parseDaysMask(asText(ws.getCell(row, 10).value)),
      skipDates: parseSkipDates(asText(ws.getCell(row, 11).value)),
      phaseId: asText(ws.getCell(row, 12).value) || undefined,
      shift,
      otAfter8: parseYesNoFlag(ws.getCell(row, 14).value),
      off: parseYesNoFlag(ws.getCell(row, 15).value),
      unitId: asText(ws.getCell(row, 16).value) || undefined,
    };
    if (sundayHeadcount != null) range.sundayHeadcount = sundayHeadcount;
    if (nightSundayHeadcount != null) range.nightSundayHeadcount = nightSundayHeadcount;
    const list = byRow[rowId] ?? [];
    list.push(range);
    byRow[rowId] = list;
  }
  return byRow;
}

function parseSubsSheet(ws: ExcelJS.Worksheet | undefined): ImportedCostLine[] | undefined {
  if (!ws) return undefined;
  const lines: ImportedCostLine[] = [];
  for (const row of scanCostRows(ws)) {
    const item = asText(ws.getCell(row, 1).value);
    const description = asText(ws.getCell(row, 2).value);
    const qty = asNum(ws.getCell(row, 3).value);
    const rate = asNum(ws.getCell(row, 4).value);
    if (!item && !description && qty === 0 && rate === 0) continue;
    const itemId = asText(ws.getCell(row, SUB_HIDDEN_ID_COL).value);
    lines.push({
      item,
      description,
      qty,
      rate,
      affiliate: isOn(ws.getCell(row, 5).value),
      itemId: itemId || undefined,
    });
  }
  return lines;
}

export async function parseEstimateXlsx(bytes: Uint8Array): Promise<EstimateImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const summary = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.summary);
  if (!summary) throw new Error(ESTIMATE_IMPORT_ERROR);
  const header = parseHeader(asText(summary.getCell("A2").value));
  const setupWs = wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup);
  const schedule = parseJobSetup(setupWs);
  const jobMeta = parseJobSetupMoney(setupWs);
  const sheets = [
    ESTIMATE_XLSX_SHEETS.staff,
    ESTIMATE_XLSX_SHEETS.foremen,
    ESTIMATE_XLSX_SHEETS.direct,
    ESTIMATE_XLSX_SHEETS.support,
  ] as const;
  const rawBySheet = sheets.map((name) => ({ sheet: name, blocks: parseCraftSheet(wb.getWorksheet(name)) }));
  const typed = applyTypedHourPolicy(rawBySheet.flatMap((item) => item.blocks));
  const bySheet = rawBySheet.map((item) => ({
    sheet: item.sheet,
    blocks: typed.blocks.filter((block) => block.sheet === item.sheet),
  }));
  const blocks = typed.blocks;
  if (!blocks.length && !wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup)) throw new Error(ESTIMATE_IMPORT_ERROR);
  const crewRanges = parseCrewRanges(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crewRanges));
  const crew = applyBlocks({}, bySheet, schedule.phases, crewRanges, jobMeta?.holidays ?? []);
  return {
    ...header,
    schedule,
    crew,
    blocks,
    crewRanges,
    warnings: typed.warnings.length ? typed.warnings : undefined,
    travel: parseTravelSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel)),
    misc: parseMiscSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc)),
    rental: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental)),
    tension: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.tension)),
    crane: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crane)),
    coe: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe)),
    subs: parseSubsSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.sub)),
    jobMeta,
  };
}

function blocksBySheet(blocks: ImportedBlock[]): Array<{ sheet: string; blocks: ImportedBlock[] }> {
  const names = [
    ESTIMATE_XLSX_SHEETS.staff,
    ESTIMATE_XLSX_SHEETS.foremen,
    ESTIMATE_XLSX_SHEETS.direct,
    ESTIMATE_XLSX_SHEETS.support,
  ];
  return names
    .map((sheet) => ({ sheet, blocks: blocks.filter((block) => block.sheet === sheet) }))
    .filter((item) => item.blocks.length);
}

export type AppliedEstimateImport = Omit<EstimatePackSnapshot, "schedule" | "crew"> & {
  schedule: PhaseScheduleState;
  crew: EstimateXlsxCrew;
};

function asEquipment(raw: unknown): { largeTools: LargeToolLine[]; thirdParty: ThirdPartyLine[] } {
  const row = (raw && typeof raw === "object" ? raw : {}) as {
    largeTools?: LargeToolLine[];
    thirdParty?: ThirdPartyLine[];
  };
  return {
    largeTools: Array.isArray(row.largeTools) ? row.largeTools : [],
    thirdParty: Array.isArray(row.thirdParty) ? row.thirdParty : [],
  };
}

function asOtherCost(raw: unknown): OtherCostSheet {
  const row = (raw && typeof raw === "object" ? raw : {}) as Partial<OtherCostSheet>;
  return {
    perDiemRate: Number(row.perDiemRate) || 0,
    travel: Array.isArray(row.travel) ? row.travel : [],
    misc: Array.isArray(row.misc) ? row.misc : [],
  };
}

function windowDates(schedule: PhaseScheduleState): { start: string; end: string } {
  const window = jobSetupWindow(schedule.phases);
  return { start: window.start || "", end: window.end || "" };
}

function takeTravelPrev(existing: TravelLine[], used: Set<number>, row: ImportedCostLine): TravelLine | undefined {
  const kind: TravelKind = row.kind === "craft" ? "craft" : "staff";
  const travelers = row.travelers ?? row.qty ?? 0;
  const miles = row.miles ?? 0;
  if (row.itemId) {
    const byId = existing.findIndex((line, index) => !used.has(index) && line.id === row.itemId);
    if (byId >= 0) {
      used.add(byId);
      return existing[byId];
    }
  }
  const byPrint = existing.findIndex(
    (line, index) =>
      !used.has(index) &&
      line.kind === kind &&
      line.travelers === travelers &&
      line.miles === miles &&
      money2(line.perMile) === money2(row.rate),
  );
  if (byPrint >= 0) {
    used.add(byPrint);
    return existing[byPrint];
  }
  const byKind = existing.findIndex((line, index) => !used.has(index) && line.kind === kind);
  if (byKind >= 0) {
    used.add(byKind);
    return existing[byKind];
  }
  return undefined;
}

function applyTravelLines(existing: TravelLine[], incoming: ImportedCostLine[] | undefined): TravelLine[] {
  if (!incoming) return existing;
  const used = new Set<number>();
  return incoming.map((row, index) => {
    const kind: TravelKind = row.kind === "craft" ? "craft" : "staff";
    const prev = takeTravelPrev(existing, used, row);
    const travelers = row.travelers ?? row.qty ?? 0;
    return {
      id: prev?.id ?? row.itemId ?? `travel-${kind}-${index + 1}`,
      kind,
      source: prev?.source ?? "extra",
      headcount: Math.max(prev?.headcount ?? 0, travelers),
      travelers,
      perMile: row.rate,
      miles: row.miles ?? 0,
    };
  });
}

function applyMiscLines(existing: MiscLine[], incoming: ImportedCostLine[] | undefined): MiscLine[] {
  if (!incoming) return existing;
  return incoming.map((row, index) => ({
    id: existing[index]?.id ?? `misc-imp-${index + 1}`,
    item: row.item,
    description: row.description ?? "",
    qty: row.qty,
    each: row.rate,
  }));
}

function takePrev<T>(list: T[], used: Set<number>, match: (row: T) => boolean, fallbackIndex: number): T | undefined {
  const found = list.findIndex((row, index) => !used.has(index) && match(row));
  if (found >= 0) {
    used.add(found);
    return list[found];
  }
  if (!used.has(fallbackIndex) && list[fallbackIndex]) {
    used.add(fallbackIndex);
    return list[fallbackIndex];
  }
  return undefined;
}

function datesFromImportedPeriods(
  prior: { start?: string; end?: string } | undefined,
  window: { start: string; end: string },
  period: B2Period | ThirdPartyPeriod,
  periods: number | undefined,
): { start: string; end: string } {
  const start = prior?.start || window.start;
  const imported = Math.round(Number(periods) || 0);
  if (imported > 0) {
    if (prior?.start && prior.end && billedPeriodCount(prior.start, prior.end, period) === imported) {
      return { start: prior.start, end: prior.end };
    }
    return { start, end: endDateForPeriodCount(start, period, imported) };
  }
  if (prior?.start && prior.end) return { start: prior.start, end: prior.end };
  if (!start) return { start: window.start, end: window.end };
  return { start, end: endDateForPeriodCount(start, period, 1) };
}

function applyRentalBucket(
  existing: ThirdPartyLine[],
  incoming: ImportedCostLine[] | undefined,
  bucket: "rental" | "tension" | "crane",
  dates: { start: string; end: string },
): ThirdPartyLine[] {
  const prev = existing.filter((line) => thirdPartyBucket(line.item) === bucket);
  if (!incoming) return prev;
  const used = new Set<number>();
  return incoming.map((row, index) => {
    const item = row.item.trim().toLowerCase();
    const prior = takePrev(prev, used, (line) => line.item.trim().toLowerCase() === item, index);
    const period = parsePeriod(row.period);
    const span = datesFromImportedPeriods(prior, dates, period, row.periods);
    return resolveThirdPartyLine({
      id: prior?.id ?? `${bucket}-imp-${index + 1}`,
      item: row.item,
      period,
      rate: row.rate,
      freight: row.freight ?? 0,
      qty: row.qty,
      start: span.start,
      end: span.end,
    });
  });
}

function applyCoeLines(
  existing: LargeToolLine[],
  incoming: ImportedCostLine[] | undefined,
  dates: { start: string; end: string },
): LargeToolLine[] {
  if (!incoming) return existing;
  const used = new Set<number>();
  return incoming.map((row, index) => {
    const desc = row.item.trim().toLowerCase();
    const prior = takePrev(
      existing,
      used,
      (line) => {
        const catalog = lookupShahanEquipment(line.itemId);
        const name = (catalog?.description || line.itemId).trim().toLowerCase();
        return name === desc || line.itemId === rematchShahanEquipmentId(row.item, undefined, { period: row.period, rate: row.rate });
      },
      index,
    );
    const resolvedId =
      prior?.itemId ||
      row.itemId ||
      rematchShahanEquipmentId(row.item, undefined, { period: row.period, rate: row.rate }) ||
      row.item;
    const period = parseCoePeriod(row.period ?? prior?.period);
    const span = datesFromImportedPeriods(prior, dates, period, row.periods);
    return resolveLargeToolLine({
      id: prior?.id ?? `lt-imp-${index + 1}`,
      itemId: resolvedId,
      period,
      qty: row.qty,
      start: span.start,
      end: span.end,
      enteredCost: 0,
      freight: row.freight ?? 0,
    });
  });
}

function money2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function takeSubLine(prevLines: SubLine[], used: Set<number>, row: ImportedCostLine, index: number): SubLine | undefined {
  if (row.itemId) {
    const byId = prevLines.findIndex((line, i) => !used.has(i) && line.id === row.itemId);
    if (byId >= 0) {
      used.add(byId);
      return prevLines[byId];
    }
  }
  const vendor = row.item.trim().toLowerCase();
  const scope = (row.description ?? "").trim().toLowerCase();
  const byName = prevLines.findIndex(
    (line, i) => !used.has(i) && line.vendor.trim().toLowerCase() === vendor && line.scope.trim().toLowerCase() === scope,
  );
  if (byName >= 0) {
    used.add(byName);
    return prevLines[byName];
  }
  if (index < prevLines.length && !used.has(index)) {
    used.add(index);
    return prevLines[index];
  }
  return undefined;
}

function takeSubCard(prevCards: SubCard[], used: Set<number>, row: ImportedCostLine): SubCard | undefined {
  if (row.itemId) {
    const byId = prevCards.findIndex((card, i) => !used.has(i) && card.id === row.itemId);
    if (byId >= 0) {
      used.add(byId);
      return prevCards[byId];
    }
  }
  const vendor = row.item.trim().toLowerCase();
  const kind = (row.description ?? "").trim();
  const byName = prevCards.findIndex(
    (card, i) => !used.has(i) && card.vendor.trim().toLowerCase() === vendor && (!kind || kind === card.kind),
  );
  if (byName >= 0) {
    used.add(byName);
    return prevCards[byName];
  }
  return undefined;
}

function applySubSheet(
  existing: SubSheet,
  incoming: ImportedCostLine[] | undefined,
  ctx: SubTotalContext,
): SubSheet {
  if (!incoming) return existing;
  const prevLines = (existing.lines ?? []).filter((line) => lineAmount(line) > 0);
  const prevCards = (existing.cards ?? []).filter((card) => subCardTotal(card, ctx) > 0);
  const usedLines = new Set<number>();
  const usedCards = new Set<number>();
  const lines: SubLine[] = [];
  const cards: SubSheet["cards"] = [];
  incoming.forEach((row, index) => {
    const prevLine = takeSubLine(prevLines, usedLines, row, index);
    if (prevLine) {
      lines.push({
        ...prevLine,
        vendor: row.item || prevLine.vendor,
        scope: row.description ?? prevLine.scope,
        qty: row.qty,
        rate: row.rate,
        affiliate: row.affiliate ?? prevLine.affiliate,
      });
      return;
    }
    const prevCard = takeSubCard(prevCards, usedCards, row);
    if (prevCard) {
      const excelCost = money2(row.qty * row.rate);
      const cardCost = money2(subCardTotal(prevCard, ctx));
      if (Math.abs(excelCost - cardCost) < 0.02) {
        cards.push({
          ...prevCard,
          vendor: row.item || prevCard.vendor,
          affiliate: row.affiliate ?? prevCard.affiliate,
        });
        return;
      }
      lines.push({
        id: prevCard.id,
        vendor: row.item || prevCard.vendor,
        scope: row.description || prevCard.kind,
        qty: row.qty,
        unit: "LS",
        rate: row.rate,
        affiliate: row.affiliate ?? prevCard.affiliate,
      });
      return;
    }
    lines.push({
      id: row.itemId || `sub-imp-${index + 1}`,
      vendor: row.item,
      scope: row.description ?? "",
      qty: row.qty,
      unit: "LS",
      rate: row.rate,
      affiliate: Boolean(row.affiliate),
    });
  });
  return { lines, cards };
}

function applyImportedCosts(base: EstimatePackSnapshot, imported: EstimateImport, schedule: PhaseScheduleState) {
  const dates = windowDates(schedule);
  const equipment = asEquipment(base.equipment);
  const other = asOtherCost(base.otherCost);
  const thirdParty = [
    ...applyRentalBucket(equipment.thirdParty, imported.rental, "rental", dates),
    ...applyRentalBucket(equipment.thirdParty, imported.tension, "tension", dates),
    ...applyRentalBucket(equipment.thirdParty, imported.crane, "crane", dates),
  ];
  const ctx: SubTotalContext = {
    site: String(base.site ?? ""),
    client: String(base.client ?? ""),
    otAfter8: Boolean((base.crew as { otAfter8?: boolean } | undefined)?.otAfter8),
  };
  return {
    equipment: {
      largeTools: applyCoeLines(equipment.largeTools, imported.coe, dates),
      thirdParty,
    },
    otherCost: {
      ...other,
      travel: applyTravelLines(other.travel, imported.travel),
      misc: applyMiscLines(other.misc, imported.misc),
    },
    subcontractor: applySubSheet(normalizeSubSheet(asRecordish(base.subcontractor)), imported.subs, ctx),
  };
}

function asRecordish(raw: unknown): Partial<SubSheet> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<SubSheet>) : null;
}

export function applyEstimateImport(base: EstimatePackSnapshot, imported: EstimateImport): AppliedEstimateImport {
  const schedule = mergeSchedule(imported.schedule);
  const holidays = hydrateHolidays(
    imported.jobMeta?.holidays ??
      (base.jobMeta && typeof base.jobMeta === "object" && "holidays" in base.jobMeta
        ? (base.jobMeta as { holidays?: unknown }).holidays
        : []),
  );
  const crew = applyBlocks(asCrew(base.crew), blocksBySheet(imported.blocks), schedule.phases, imported.crewRanges, holidays);
  const costs = applyImportedCosts(base, imported, schedule);
  return {
    ...base,
    title: imported.title || base.title,
    client: imported.client || base.client,
    site: imported.site || base.site,
    updatedAt: Date.now(),
    schedule,
    crew,
    jobMeta: imported.jobMeta
      ? hydrateJobMeta({
          ...((base.jobMeta && typeof base.jobMeta === "object" ? base.jobMeta : {}) as Record<string, unknown>),
          ...imported.jobMeta,
        })
      : base.jobMeta,
    ...costs,
  };
}

export function createPackFromImport(imported: EstimateImport, ownerEmail = ""): EstimatePackSnapshot {
  const packId = newEstimatePackId();
  const costs = applyImportedCosts(
    { equipment: { largeTools: [], thirdParty: [] }, otherCost: { perDiemRate: 0, travel: [], misc: [] } } as EstimatePackSnapshot,
    imported,
    imported.schedule,
  );
  return {
    packId,
    key: newEstimateKey(packId),
    title: imported.title || "Working estimate",
    client: imported.client || "Phillips 66",
    site: imported.site || "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ownerEmail,
    schedule: imported.schedule,
    crew: {
      ...imported.crew,
      support: (imported.crew.support ?? []).map((row) => hydrateSupportLine(row)),
    },
    jobMeta: imported.jobMeta ? hydrateJobMeta(imported.jobMeta) : undefined,
    ...costs,
  };
}

export function diffEstimateImport(base: EstimatePackSnapshot | null, imported: EstimateImport): EstimateImportDiff {
  const lines: string[] = [...(imported.warnings ?? [])];
  if (!base) {
    lines.push(`New estimate: ${imported.title || "untitled"}`);
    const seats = ["staff", "generalForeman", "foreman", "direct", "support"] as const;
    const count = seats.reduce((sum, lane) => sum + (imported.crew[lane]?.length ?? 0), 0);
    lines.push(`${count} crew block${count === 1 ? "" : "s"} from the workbook`);
    return { lines, createsNew: true };
  }
  if (imported.title && imported.title !== base.title) lines.push(`Title → ${imported.title}`);
  const before = mergeSchedule(base.schedule as PhaseScheduleState | null);
  for (const id of PHASE_IDS) {
    const prev = before.phases.find((row) => row.id === id);
    const next = imported.schedule.phases.find((row) => row.id === id);
    if (!prev || !next) continue;
    if (prev.on !== next.on || prev.start !== next.start || prev.stop !== next.stop) {
      lines.push(`${next.name}: ${next.on ? "ON" : "OFF"} ${next.start}–${next.stop}`);
    }
  }
  const current = asCrew(base.crew);
  for (const block of imported.blocks) {
    const found = findRow(current, block.id);
    if (!found) {
      lines.push(`Add ${block.position || block.id}`);
      continue;
    }
    if (block.position && block.position !== found.row.position) {
      lines.push(`${found.row.position} → ${block.position}`);
    }
    if (block.billedAs && block.billedAs !== (found.row as SupportLine).billedAs) {
      lines.push(`${block.position || found.row.position} Bill as → ${block.billedAs}`);
    }
    if (block.clockOverride && block.clockOverride !== (found.row.clockOverride ?? "auto")) {
      lines.push(`${block.position || found.row.position} clock → ${block.clockOverride}`);
    }
    const hc = block.days.reduce((sum, day) => sum + day.hc, 0);
    const prevHc = (found.row.ranges ?? []).reduce((sum, range) => {
      const span = Math.max(1, Math.round(((parseYmd(range.end)?.getTime() ?? 0) - (parseYmd(range.start)?.getTime() ?? 0)) / 86_400_000) + 1);
      return sum + (block.night ? range.nightHeadcount : range.headcount) * span;
    }, 0);
    if (hc !== prevHc) lines.push(`${block.position || found.row.position} headcount days ${prevHc} → ${hc}`);
  }
  if (!lines.length) lines.push("No crew or Job setup changes.");
  return { lines, createsNew: false };
}

function asCrew(raw: unknown): EstimateXlsxCrew {
  const row = (raw && typeof raw === "object" ? raw : {}) as Partial<EstimateXlsxCrew>;
  return {
    staff: Array.isArray(row.staff) ? row.staff : [],
    generalForeman: Array.isArray(row.generalForeman) ? row.generalForeman : [],
    foreman: Array.isArray(row.foreman) ? row.foreman : [],
    direct: Array.isArray(row.direct) ? row.direct : [],
    support: Array.isArray(row.support) ? row.support : [],
    otAfter8: Boolean(row.otAfter8),
  };
}

