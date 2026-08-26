import type { CalendarRange, CraftRow, CraftShift } from "./craft-labor.ts";
import {
  craftsForCoast,
  matchIpsCraft,
  P66_CONTRACTOR,
  staffingCoastFromSite,
  type StaffingCoast,
} from "./p66-ips-crafts.ts";
import { eachYmd, parseYmd, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";
import { emptyJobRates, hydrateJobRates, type JobRates } from "./shahan-wood-river.ts";
import { buildXlsx, colLetter, type SheetCell } from "./xlsx-minimal.ts";

export const JOB_META_PREFIX = "hs_job_v1:";

export type JobMeta = {
  afeName: string;
  area: string;
} & JobRates;

export type StaffingCrewInput = {
  staff?: CraftRow[];
  generalForeman?: CraftRow[];
  foreman?: CraftRow[];
  direct?: CraftRow[];
};

export type StaffingDate = {
  ymd: string;
  header: string;
};

export type StaffingCounts = {
  day?: number;
  night?: number;
};

export type StaffingRow = {
  craftName: string;
  code: string;
  fromTemplate: boolean;
  hasAny: boolean;
  cells: Record<string, StaffingCounts>;
};

export type StaffingPlan = {
  coast: StaffingCoast;
  dates: StaffingDate[];
  rows: StaffingRow[];
  phaseHeader: string;
};

export type StaffingExportMeta = {
  projectName: string;
  afeName?: string;
  area?: string;
};

const WEEKDAY_MARK = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function emptyJobMeta(): JobMeta {
  return { afeName: "", area: "", ...emptyJobRates() };
}

export function readJobMeta(key: string): JobMeta {
  if (typeof window === "undefined" || !key) return emptyJobMeta();
  try {
    const raw = window.localStorage.getItem(`${JOB_META_PREFIX}${key}`);
    if (!raw) return emptyJobMeta();
    const parsed = JSON.parse(raw) as Partial<JobMeta>;
    return {
      afeName: typeof parsed.afeName === "string" ? parsed.afeName : "",
      area: typeof parsed.area === "string" ? parsed.area : "",
      ...hydrateJobRates(parsed),
    };
  } catch {
    return emptyJobMeta();
  }
}

export function writeJobMeta(key: string, meta: JobMeta) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${JOB_META_PREFIX}${key}`, JSON.stringify(meta));
  } catch {
    // keep the previous copy
  }
}

export function formatStaffingHeader(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy} (${WEEKDAY_MARK[date.getDay()]})`;
}

export function staffingPhasesFromSchedule(schedule: {
  multiUnits?: boolean;
  phases: PhaseRow[];
  units?: { phases: PhaseRow[] }[];
}): PhaseRow[] {
  if (schedule.multiUnits && schedule.units?.length) {
    const fromUnits = schedule.units.flatMap((unit) => unit.phases);
    if (fromUnits.some((row) => row.on && row.start && row.stop)) return fromUnits;
  }
  return schedule.phases;
}

export function calendarDatesFromPhases(phases: PhaseRow[]): StaffingDate[] {
  const on = phases.filter((row) => row.on && row.start && row.stop);
  if (!on.length) return [];
  const start = on.reduce((min, row) => (row.start < min ? row.start : min), on[0].start);
  const stop = on.reduce((max, row) => (row.stop > max ? row.stop : max), on[0].stop);
  return eachYmd(start, stop).map((ymd) => ({ ymd, header: formatStaffingHeader(ymd) }));
}

export function phaseWindowsHeader(phases: PhaseRow[]): string {
  const parts = phases
    .filter((row) => row.on && row.start && row.stop)
    .map((row) => {
      const name = PHASE_NAMES[row.id] ?? row.name;
      return `${name} ${formatStaffingHeader(row.start).replace(/ \(.+\)$/, "")}–${formatStaffingHeader(row.stop).replace(/ \(.+\)$/, "")}`;
    });
  return parts.join("; ");
}

function allCraftRows(crew: StaffingCrewInput): CraftRow[] {
  return [...(crew.staff ?? []), ...(crew.generalForeman ?? []), ...(crew.foreman ?? []), ...(crew.direct ?? [])];
}

function rangeCovers(range: CalendarRange, ymd: string): boolean {
  if (!range.start || !range.end) return false;
  if (ymd < range.start || ymd > range.end) return false;
  if (range.skipDates?.includes(ymd)) return false;
  const date = parseYmd(ymd);
  if (!date) return false;
  if (Array.isArray(range.days) && range.days.length === 7 && !range.days[date.getDay()]) return false;
  return true;
}

function shiftCounts(shift: CraftShift, range: CalendarRange): StaffingCounts {
  const dayHead = Math.max(0, Number(range.headcount) || 0);
  const nightHead = Math.max(0, Number(range.nightHeadcount) || 0);
  if (shift === "Nights") return nightHead || dayHead ? { night: dayHead || nightHead } : {};
  if (shift === "Days & nights") {
    const next: StaffingCounts = {};
    if (dayHead) next.day = dayHead;
    if (nightHead) next.night = nightHead;
    return next;
  }
  return dayHead ? { day: dayHead } : {};
}

function addCounts(into: StaffingCounts, add: StaffingCounts): StaffingCounts {
  const next = { ...into };
  if (add.day) next.day = (next.day ?? 0) + add.day;
  if (add.night) next.night = (next.night ?? 0) + add.night;
  return next;
}

function hasCounts(cell: StaffingCounts | undefined): boolean {
  return Boolean(cell && ((cell.day ?? 0) > 0 || (cell.night ?? 0) > 0));
}

export function generateStaffingPlan(input: {
  site?: string;
  client?: string;
  plantCode?: string;
  phases: PhaseRow[];
  crew: StaffingCrewInput;
}): StaffingPlan {
  const coast = staffingCoastFromSite(input.site, input.client, input.plantCode);
  const template = craftsForCoast(coast);
  const dates = calendarDatesFromPhases(input.phases);
  const rows = new Map<string, StaffingRow>();

  function ensureRow(craftName: string, code: string, fromTemplate: boolean): StaffingRow {
    const key = `${code}::${craftName}`;
    const existing = rows.get(key);
    if (existing) return existing;
    const next: StaffingRow = { craftName, code, fromTemplate, hasAny: false, cells: {} };
    rows.set(key, next);
    return next;
  }

  for (const craft of template) ensureRow(craft.name, craft.code, true);

  for (const row of allCraftRows(input.crew)) {
    if (!row.position.trim()) continue;
    const matched = matchIpsCraft(row.position, template);
    const target = matched
      ? ensureRow(matched.name, matched.code, true)
      : ensureRow(row.position.trim(), "", false);
    for (const range of row.ranges ?? []) {
      const shift = range.shift ?? row.shift ?? "Days";
      for (const date of dates) {
        if (!rangeCovers(range, date.ymd)) continue;
        const add = shiftCounts(shift, range);
        if (!hasCounts(add)) continue;
        target.cells[date.ymd] = addCounts(target.cells[date.ymd] ?? {}, add);
        target.hasAny = true;
      }
    }
  }

  const ordered: StaffingRow[] = [];
  const seen = new Set<StaffingRow>();
  for (const craft of template) {
    const row = rows.get(`${craft.code}::${craft.name}`);
    if (row) {
      ordered.push(row);
      seen.add(row);
    }
  }
  for (const row of rows.values()) {
    if (!seen.has(row)) ordered.push(row);
  }

  return {
    coast,
    dates,
    rows: ordered,
    phaseHeader: phaseWindowsHeader(input.phases),
  };
}

export function visibleStaffingRows(plan: StaffingPlan, showFullTemplate: boolean): StaffingRow[] {
  return plan.rows.filter((row) => row.hasAny || (showFullTemplate && row.fromTemplate));
}

export function exportStaffingRows(plan: StaffingPlan): StaffingRow[] {
  return plan.rows.filter((row) => row.fromTemplate || row.hasAny);
}

export function cellValue(cell: StaffingCounts | undefined, key: "day" | "night"): number | undefined {
  const value = cell?.[key];
  return value && value > 0 ? value : undefined;
}

export function staffingFilename(meta: StaffingExportMeta): string {
  const base = (meta.afeName || meta.projectName || "Staffing-Plan").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `P66-Staffing-Plan-${base || "Staffing-Plan"}.xlsx`;
}

export function staffingExportCells(plan: StaffingPlan, meta: StaffingExportMeta): { cells: SheetCell[]; merges: string[] } {
  const headerLabel = meta.afeName?.trim() ? "AFE Name" : "Project Name";
  const headerValue = meta.afeName?.trim() || meta.projectName;
  const rows = exportStaffingRows(plan);
  const cells: SheetCell[] = [
    { ref: "A1", type: "text", value: headerLabel },
    { ref: "B1", type: "text", value: headerValue },
    { ref: "A2", type: "text", value: "Contractor" },
    { ref: "B2", type: "text", value: P66_CONTRACTOR },
    { ref: "A3", type: "text", value: "Area" },
    { ref: "B3", type: "text", value: meta.area?.trim() || "" },
    { ref: "A4", type: "text", value: "Phases" },
    { ref: "B4", type: "text", value: plan.phaseHeader },
    { ref: "A6", type: "text", value: "Craft Name" },
    { ref: "B6", type: "text", value: "Craft Code" },
    { ref: "A7", type: "text", value: "" },
    { ref: "B7", type: "text", value: "" },
  ];
  const merges: string[] = [];

  plan.dates.forEach((date, index) => {
    const dayCol = colLetter(3 + index * 2);
    const nightCol = colLetter(4 + index * 2);
    cells.push({ ref: `${dayCol}6`, type: "text", value: date.header });
    cells.push({ ref: `${dayCol}7`, type: "text", value: "Day" });
    cells.push({ ref: `${nightCol}7`, type: "text", value: "Night" });
    merges.push(`${dayCol}6:${nightCol}6`);
  });

  const totalDayCol = colLetter(3 + plan.dates.length * 2);
  const totalNightCol = colLetter(4 + plan.dates.length * 2);
  cells.push({ ref: `${totalDayCol}6`, type: "text", value: "Totals" });
  cells.push({ ref: `${totalDayCol}7`, type: "text", value: "Day" });
  cells.push({ ref: `${totalNightCol}7`, type: "text", value: "Night" });
  merges.push(`${totalDayCol}6:${totalNightCol}6`);

  const firstData = 8;
  rows.forEach((row, rowIndex) => {
    const excelRow = firstData + rowIndex;
    cells.push({ ref: `A${excelRow}`, type: "text", value: row.craftName });
    if (row.code) cells.push({ ref: `B${excelRow}`, type: "text", value: row.code });
    const dayRefs: string[] = [];
    const nightRefs: string[] = [];
    plan.dates.forEach((date, index) => {
      const dayCol = colLetter(3 + index * 2);
      const nightCol = colLetter(4 + index * 2);
      const day = cellValue(row.cells[date.ymd], "day");
      const night = cellValue(row.cells[date.ymd], "night");
      if (day !== undefined) cells.push({ ref: `${dayCol}${excelRow}`, type: "number", value: day });
      if (night !== undefined) cells.push({ ref: `${nightCol}${excelRow}`, type: "number", value: night });
      dayRefs.push(`${dayCol}${excelRow}`);
      nightRefs.push(`${nightCol}${excelRow}`);
    });
    if (dayRefs.length) {
      cells.push({ ref: `${totalDayCol}${excelRow}`, type: "formula", value: `SUM(${dayRefs.join(",")})` });
      cells.push({ ref: `${totalNightCol}${excelRow}`, type: "formula", value: `SUM(${nightRefs.join(",")})` });
    }
  });

  const lastData = firstData + rows.length - 1;
  const totalsRow = firstData + rows.length;
  cells.push({ ref: `A${totalsRow}`, type: "text", value: "Totals" });
  if (rows.length) {
    plan.dates.forEach((_, index) => {
      const dayCol = colLetter(3 + index * 2);
      const nightCol = colLetter(4 + index * 2);
      cells.push({
        ref: `${dayCol}${totalsRow}`,
        type: "formula",
        value: `SUM(${dayCol}${firstData}:${dayCol}${lastData})`,
      });
      cells.push({
        ref: `${nightCol}${totalsRow}`,
        type: "formula",
        value: `SUM(${nightCol}${firstData}:${nightCol}${lastData})`,
      });
    });
    cells.push({
      ref: `${totalDayCol}${totalsRow}`,
      type: "formula",
      value: `SUM(${totalDayCol}${firstData}:${totalDayCol}${lastData})`,
    });
    cells.push({
      ref: `${totalNightCol}${totalsRow}`,
      type: "formula",
      value: `SUM(${totalNightCol}${firstData}:${totalNightCol}${lastData})`,
    });
  }

  return { cells, merges };
}

export function staffingPlanToXlsx(plan: StaffingPlan, meta: StaffingExportMeta): Uint8Array {
  const { cells, merges } = staffingExportCells(plan, meta);
  return buildXlsx("Staffing Plan", cells, merges);
}
