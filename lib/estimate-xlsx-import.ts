/**
 * Hit Squad client workbook → live estimate pack.
 * Inverse of estimate-xlsx export. Hidden block ids + Job setup card are
 * the keys. Excel is never a parallel book (excel-ripple.ts).
 */
import ExcelJS from "exceljs";
import { blankCraftRow, hydrateSupportLine, hydrateSupportLines, type CalendarRange, type CraftRow, type SupportLine } from "./craft-labor.ts";
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
  clockLabelOverride,
  laborBlockId,
  thirdPartyBucket,
} from "./estimate-xlsx.ts";
import { hydrateJobMeta } from "./staffing-plan.ts";
import type { JobMoney } from "./estimate-money.ts";
import type { JobRates } from "./shahan-wood-river.ts";
import { rematchShahanEquipmentId } from "./shahan-wood-river.ts";
import {
  jobSetupWindow,
  resolveLargeToolLine,
  resolveThirdPartyLine,
  type LargeToolLine,
  type ThirdPartyLine,
  type ThirdPartyPeriod,
} from "./equipment-sheet.ts";
import { type MiscLine, type OtherCostSheet, type TravelKind, type TravelLine } from "./other-cost.ts";
import type { B2Period } from "./b2-east-coast.ts";
import type { ClockOverride } from "./hours-clock.ts";
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
};

export type ImportedBlock = {
  id: string;
  night: boolean;
  position: string;
  sheet: string;
  billedAs?: string;
  clockOverride?: ClockOverride;
  days: ImportedDay[];
};

export type ImportedCostLine = {
  item: string;
  description?: string;
  period?: string;
  qty: number;
  rate: number;
  freight?: number;
  travelers?: number;
  miles?: number;
  kind?: TravelKind;
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
  jobMeta?: Partial<JobRates & JobMoney>;
};

export type EstimateImportDiff = {
  lines: string[];
  createsNew: boolean;
};

function asNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim()) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }
  if (value && typeof value === "object" && "result" in value) {
    return asNum((value as { result: unknown }).result);
  }
  return 0;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value && typeof value === "object" && "result" in value) {
    return asText((value as { result: unknown }).result);
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

function readBlockDays(ws: ExcelJS.Worksheet, titleRow: number, dates: string[]): ImportedDay[] {
  return dates.map((ymd, index) => {
    const col = LABOR_DATE_START_COL + index;
    return {
      ymd,
      hc: asNum(ws.getCell(titleRow + LABOR_HC_OFFSET, col).value),
      hps: asNum(ws.getCell(titleRow + LABOR_HPS_OFFSET, col).value),
      st: asNum(ws.getCell(titleRow + LABOR_ST_OFFSET, col).value),
      ot: asNum(ws.getCell(titleRow + LABOR_OT_OFFSET, col).value),
      dt: asNum(ws.getCell(titleRow + LABOR_DT_OFFSET, col).value),
      pd: asNum(ws.getCell(titleRow + LABOR_PD_OFFSET, col).value),
    };
  });
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
    otAfter8: priorOtAfter8(existing, phase?.id, night) ?? phase?.otAfter8,
  };
}

function contiguousRuns(days: ImportedDay[]): ImportedDay[][] {
  const runs: ImportedDay[][] = [];
  let run: ImportedDay[] = [];
  const flush = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  for (const day of days) {
    const prev = run[run.length - 1];
    if (
      prev &&
      dayPattern(prev) === dayPattern(day) &&
      parseYmd(prev.ymd) &&
      parseYmd(day.ymd) &&
      (parseYmd(day.ymd)!.getTime() - parseYmd(prev.ymd)!.getTime()) / 86_400_000 === 1
    ) {
      run.push(day);
      continue;
    }
    flush();
    run = [day];
  }
  flush();
  return runs;
}

function rangeShiftOf(range: CalendarRange): CalendarRange["shift"] {
  return range.shift ?? "Days";
}

function rangeCoversImported(range: CalendarRange, ymd: string, night: boolean): boolean {
  const shift = rangeShiftOf(range);
  if (range.off) return false;
  if (night && shift === "Days") return false;
  if (!night && shift === "Nights") return false;
  if (!range.start || !range.end || ymd < range.start || ymd > range.end) return false;
  if (range.skipDates?.includes(ymd)) return false;
  const date = parseYmd(ymd);
  if (!date) return false;
  if (Array.isArray(range.days) && range.days.length === 7 && !range.days[date.getDay()]) return false;
  return true;
}

function existingDayPlug(row: CraftRow, ymd: string, night: boolean): Pick<ImportedDay, "hc" | "hps" | "pd"> {
  const ranges = (row.ranges ?? []).filter((range) => rangeCoversImported(range, ymd, night));
  if (!ranges.length) return { hc: 0, hps: 0, pd: 0 };
  let hourUnits = 0;
  let pd = 0;
  let hps = 0;
  for (const range of ranges) {
    const shift = rangeShiftOf(range);
    const nightsOnly = night && shift === "Nights";
    const hc = nightsOnly ? range.headcount : night ? range.nightHeadcount : range.headcount;
    const rangeHps = Number(range.hoursPerShift) || 0;
    hourUnits += (Number(hc) || 0) * rangeHps;
    pd += nightsOnly || !night ? Number(range.perDiemPeople) || 0 : Number(range.nightPerDiemPeople) || 0;
    if (rangeHps > 0) hps = rangeHps;
  }
  const hc = hps > 0 ? hourUnits / hps : 0;
  if (hc <= 0 && pd <= 0) return { hc: 0, hps: 0, pd: 0 };
  return { hc, hps, pd };
}

function sameQty(left: number, right: number) {
  return Math.abs(left - right) < 0.02;
}

function existingMatchesDays(row: CraftRow | undefined, days: ImportedDay[], night: boolean): boolean {
  if (!row?.ranges?.length) return false;
  return days.every((day) => {
    const plug = existingDayPlug(row, day.ymd, night);
    return sameQty(plug.hc, day.hc) && sameQty(plug.pd, day.pd) && (day.hc <= 0 || sameQty(plug.hps, day.hps) || plug.hps === 0);
  });
}

function existingRangesForSide(row: CraftRow, night: boolean): CalendarRange[] {
  return (row.ranges ?? []).filter((range) => {
    const shift = rangeShiftOf(range);
    return night ? shift === "Nights" : shift !== "Nights";
  });
}

function rangesFromDays(days: ImportedDay[], night: boolean, phases: PhaseRow[], existing?: CraftRow): CalendarRange[] {
  if (existing && existingMatchesDays(existing, days, night)) {
    return existingRangesForSide(existing, night);
  }
  const byYmd = new Map(days.map((day) => [day.ymd, day]));
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
    const skipDates = window.filter((day) => !dayLive(day) || dayPattern(day) !== dayPattern(pattern)).map((day) => day.ymd);
    ranges.push(rangeFromPattern(window, night, phase, phase.start, phase.stop, pattern, skipDates, existing));
    const extras = window.filter((day) => dayLive(day) && dayPattern(day) !== dayPattern(pattern));
    for (const run of contiguousRuns(extras)) {
      ranges.push(rangeFromPattern(run, night, phase, run[0].ymd, run[run.length - 1].ymd, run[0], [], existing));
    }
  }
  const leftover = days.filter((day) => !used.has(day.ymd) && dayLive(day));
  for (const run of contiguousRuns(leftover)) {
    ranges.push(rangeFromPattern(run, night, phaseOwningDate(phases, run[0].ymd), run[0].ymd, run[run.length - 1].ymd, run[0], [], existing));
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
  };
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

function applyRowFromBlocks(existing: CraftRow, blocks: ImportedBlock[], phases: PhaseRow[]): CraftRow {
  const dayBlocks = blocks.filter((block) => !block.night);
  const nightBlocks = blocks.filter((block) => block.night);
  const ranges = [
    ...dayBlocks.flatMap((block) => rangesFromDays(block.days, false, phases, existing)),
    ...nightBlocks.flatMap((block) => rangesFromDays(block.days, true, phases, existing)),
  ];
  const hours = rollupHours(blocks.flatMap((block) => block.days));
  const night = ranges.some((range) => range.shift === "Nights");
  const day = ranges.some((range) => (range.shift ?? "Days") !== "Nights");
  const position = blocks.find((block) => block.position)?.position || existing.position;
  const billedAs = blocks.find((block) => block.billedAs)?.billedAs ?? (existing as SupportLine).billedAs ?? "";
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

function applyBlocks(
  base: EstimateXlsxCrew,
  bySheet: Array<{ sheet: string; blocks: ImportedBlock[] }>,
  phases: PhaseRow[],
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
      const existing = found?.row ?? { ...blankCraftRow(), id: group[0].id };
      const row = applyRowFromBlocks(existing, group, phases);
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
    if (/^craft travel$/i.test(item)) continue;
    const description = asText(ws.getCell(row, 2).value);
    const qty = asNum(ws.getCell(row, 3).value);
    const rate = asNum(ws.getCell(row, 4).value);
    if (!item && !description && qty === 0 && rate === 0) continue;
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
    if (!label && travelers === 0 && miles === 0 && perMile === 0) continue;
    if (!label && travelers === 0) continue;
    lines.push({ item: label || kind, kind, travelers, miles, rate: perMile, qty: travelers });
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
    const rate = asNum(ws.getCell(row, 5).value);
    const freight = asNum(ws.getCell(row, 6).value);
    if (!item && qty === 0 && rate === 0 && freight === 0) continue;
    lines.push({ item, period, qty, rate, freight });
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
  const bySheet = sheets.map((name) => ({ sheet: name, blocks: parseCraftSheet(wb.getWorksheet(name)) }));
  const blocks = bySheet.flatMap((item) => item.blocks);
  if (!blocks.length && !wb.getWorksheet(ESTIMATE_XLSX_SHEETS.jobSetup)) throw new Error(ESTIMATE_IMPORT_ERROR);
  const crew = applyBlocks({}, bySheet, schedule.phases);
  return {
    ...header,
    schedule,
    crew,
    blocks,
    travel: parseTravelSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.travel)),
    misc: parseMiscSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.misc)),
    rental: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.rental)),
    tension: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.tension)),
    crane: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.crane)),
    coe: parseRentalLikeSheet(wb.getWorksheet(ESTIMATE_XLSX_SHEETS.coe)),
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

function applyTravelLines(existing: TravelLine[], incoming: ImportedCostLine[] | undefined): TravelLine[] {
  if (!incoming) return existing;
  const staff = existing.filter((line) => line.kind === "staff");
  const craft = existing.filter((line) => line.kind === "craft");
  let si = 0;
  let ci = 0;
  return incoming.map((row) => {
    const kind: TravelKind = row.kind === "craft" ? "craft" : "staff";
    const prev = kind === "craft" ? staff[ci++] : staff[si++];
    return {
      id: prev?.id ?? `travel-${kind}-${Date.now()}-${kind === "craft" ? ci : si}`,
      kind,
      source: prev?.source ?? "extra",
      headcount: Math.max(prev?.headcount ?? 0, row.travelers ?? row.qty ?? 0),
      travelers: row.travelers ?? row.qty ?? 0,
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

function applyRentalBucket(
  existing: ThirdPartyLine[],
  incoming: ImportedCostLine[] | undefined,
  bucket: "rental" | "tension" | "crane",
  dates: { start: string; end: string },
): ThirdPartyLine[] {
  const prev = existing.filter((line) => thirdPartyBucket(line.item) === bucket);
  if (!incoming) return prev;
  return incoming.map((row, index) =>
    resolveThirdPartyLine({
      id: prev[index]?.id ?? `${bucket}-imp-${index + 1}`,
      item: row.item,
      period: parsePeriod(row.period),
      rate: row.rate,
      freight: row.freight ?? 0,
      qty: row.qty,
      start: prev[index]?.start || dates.start,
      end: prev[index]?.end || dates.end,
    }),
  );
}

function applyCoeLines(
  existing: LargeToolLine[],
  incoming: ImportedCostLine[] | undefined,
  dates: { start: string; end: string },
): LargeToolLine[] {
  if (!incoming) return existing;
  return incoming.map((row, index) => {
    const prev = existing[index];
    const itemId = rematchShahanEquipmentId(row.item) || prev?.itemId || row.item;
    return resolveLargeToolLine({
      id: prev?.id ?? `lt-imp-${index + 1}`,
      itemId,
      period: parseCoePeriod(row.period ?? prev?.period),
      qty: row.qty,
      start: prev?.start || dates.start,
      end: prev?.end || dates.end,
      enteredCost: 0,
      freight: row.freight ?? 0,
    });
  });
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
  };
}

export function applyEstimateImport(base: EstimatePackSnapshot, imported: EstimateImport): AppliedEstimateImport {
  const schedule = mergeSchedule(imported.schedule);
  const crew = applyBlocks(asCrew(base.crew), blocksBySheet(imported.blocks), schedule.phases);
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
  const lines: string[] = [];
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

