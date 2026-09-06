/**
 * Scheduler / progress KPI for Cost report PPR earned hours.
 * Field names match 01 DailyReport_TOTAL Summary Phase Grand Total.
 * Job-total earned is Day-1. Optional Area rows roll up if the total is blank.
 * Hours win over typed Earned % when both are present.
 */
import {
  DAILY_REPORT_UPLOAD_NOTE,
  dailyReportToKpiPatch,
  type DailyReportParse,
  type DailyReportPhaseCode,
} from "./daily-report-total.ts";

export type ScheduleKpiArea = {
  area: string;
  earnedHours: number;
  /** 0–1 Plan % when the scheduler sent one. */
  planPct: number | null;
};

export type ScheduleKpiPhase = {
  code: DailyReportPhaseCode;
  earnedHours: number | null;
  plannedHours: number | null;
  planPct: number | null;
  earnedPct: number | null;
};

export type ScheduleKpi = {
  /** Earned Mhr — primary PPR Earned To Date. */
  earnedHours: number | null;
  /** Planned Mhr from DailyReport_TOTAL. */
  plannedHours: number | null;
  /** Target Mhr from DailyReport_TOTAL. */
  targetHours: number | null;
  /** Earned % / Actual % (0–1). Used when earned hours are blank. */
  earnedPct: number | null;
  /** Plan % (0–1). Stored; does not drive PPR Earned. */
  planPct: number | null;
  /** Inc Earned. Blank → to-date minus prior snapshot. */
  incEarned: number | null;
  notes: string;
  areas: ScheduleKpiArea[];
  phases: ScheduleKpiPhase[];
};

export function emptyScheduleKpi(): ScheduleKpi {
  return {
    earnedHours: null,
    plannedHours: null,
    targetHours: null,
    earnedPct: null,
    planPct: null,
    incEarned: null,
    notes: "",
    areas: [],
    phases: [],
  };
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function hours(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function ratio(num: number, den: number) {
  if (!den) return 0;
  return hours(num / den);
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const n = finiteOrNull(value);
    if (n != null) return n;
  }
  return null;
}

/** 45 or 45% → 0.45; 0.45 stays 0.45. */
export function parsePhysicalPct(value: unknown): number | null {
  const n = finiteOrNull(value);
  if (n == null || n < 0) return null;
  if (n > 1) return hours(Math.min(n, 100) / 100);
  return hours(n);
}

const PHASE_CODES = new Set<DailyReportPhaseCode>(["PRE", "SD", "TA", "SU", "POST"]);

export function hydrateScheduleKpi(raw: unknown): ScheduleKpi {
  const empty = emptyScheduleKpi();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const row = raw as Record<string, unknown>;
  const areaSource = Array.isArray(row.areas) ? row.areas : Array.isArray(row.units) ? row.units : [];
  const areas = areaSource
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const unit = item as Record<string, unknown>;
      const name =
        (typeof unit.area === "string" ? unit.area : typeof unit.unit === "string" ? unit.unit : "").trim();
      const earnedHours = Math.max(0, finiteOrNull(unit.earnedHours) ?? 0);
      if (!name && !(earnedHours > 0)) return null;
      return {
        area: name,
        earnedHours,
        planPct: parsePhysicalPct(unit.planPct),
      };
    })
    .filter((item): item is ScheduleKpiArea => Boolean(item));
  const phases = Array.isArray(row.phases)
    ? row.phases
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const phase = item as Record<string, unknown>;
          const code = String(phase.code ?? "")
            .trim()
            .toUpperCase() as DailyReportPhaseCode;
          if (!PHASE_CODES.has(code)) return null;
          return {
            code,
            earnedHours: finiteOrNull(phase.earnedHours),
            plannedHours: finiteOrNull(phase.plannedHours),
            planPct: parsePhysicalPct(phase.planPct),
            earnedPct: parsePhysicalPct(phase.earnedPct),
          };
        })
        .filter((item): item is ScheduleKpiPhase => Boolean(item))
    : [];
  return {
    earnedHours: firstFinite(row.earnedHours, row.earnedHoursToDate),
    plannedHours: finiteOrNull(row.plannedHours),
    targetHours: finiteOrNull(row.targetHours),
    earnedPct: parsePhysicalPct(firstFinite(row.earnedPct, row.physicalPctToDate)),
    planPct: parsePhysicalPct(row.planPct),
    incEarned: firstFinite(row.incEarned, row.earnedHoursDaily),
    notes: typeof row.notes === "string" ? row.notes : "",
    areas,
    phases,
  };
}

export function scheduleKpiEntered(kpi?: ScheduleKpi | null): boolean {
  if (!kpi) return false;
  if (kpi.earnedHours != null && Number.isFinite(kpi.earnedHours)) return true;
  if (kpi.earnedPct != null && Number.isFinite(kpi.earnedPct)) return true;
  if (kpi.areas.some((area) => area.earnedHours > 0)) return true;
  return kpi.phases.some((phase) => phase.earnedHours != null && phase.earnedHours > 0);
}

export function scheduleAreaHours(kpi?: ScheduleKpi | null): number {
  const areas = hours((kpi?.areas ?? []).reduce((sum, area) => sum + Math.max(0, area.earnedHours || 0), 0));
  const phases = hours(
    (kpi?.phases ?? []).reduce((sum, phase) => sum + Math.max(0, phase.earnedHours || 0), 0),
  );
  return areas > 0 ? areas : phases;
}

/** @deprecated use scheduleAreaHours */
export const scheduleUnitHours = scheduleAreaHours;

export type ResolvedScheduleEarned = {
  toDate: number;
  daily: number;
  pct: number;
  fromKpi: boolean;
  hoursAreSource: boolean;
};

export function resolveScheduleEarned(
  kpi: ScheduleKpi | undefined | null,
  directBudgetHours: number,
  priorEarnedToDate = 0,
): ResolvedScheduleEarned {
  if (!scheduleKpiEntered(kpi)) {
    return { toDate: 0, daily: 0, pct: 0, fromKpi: false, hoursAreSource: false };
  }
  const areaSum = scheduleAreaHours(kpi);
  let toDate = 0;
  let hoursAreSource = true;
  if (kpi!.earnedHours != null && Number.isFinite(kpi!.earnedHours)) {
    toDate = hours(Math.max(0, kpi!.earnedHours));
  } else if (areaSum > 0) {
    toDate = areaSum;
  } else if (kpi!.earnedPct != null) {
    const base = kpi!.plannedHours && kpi!.plannedHours > 0 ? kpi!.plannedHours : directBudgetHours;
    toDate = hours(Math.max(0, kpi!.earnedPct) * Math.max(0, base));
    hoursAreSource = false;
  }
  const daily =
    kpi!.incEarned != null && Number.isFinite(kpi!.incEarned)
      ? hours(Math.max(0, kpi!.incEarned))
      : hours(Math.max(0, toDate - priorEarnedToDate));
  const pct =
    directBudgetHours > 0 ? ratio(toDate, directBudgetHours) : hours(kpi!.earnedPct ?? 0);
  return { toDate, daily, pct, fromKpi: true, hoursAreSource };
}

export const SCHEDULE_KPI_STANDIN_NOTE =
  "No scheduler earned entered — using Day-0 stand-in (Direct earned tracks expended). Support earned = Direct physical % complete × Support budget hours.";

export const SCHEDULE_KPI_ACTIVE_NOTE =
  "Earned Mhr from 01 DailyReport_TOTAL KPI on Cost report (Summary Phase Grand Total). Physical % = earned / Direct budget hours (hours win if Earned % was also typed). Support earned = Direct % × Support budget hours.";

export const SCHEDULE_KPI_UPLOAD_NOTE = DAILY_REPORT_UPLOAD_NOTE;

export function scheduleKpiFromDailyReport(parsed: DailyReportParse, prior?: ScheduleKpi | null): ScheduleKpi {
  const patch = dailyReportToKpiPatch(parsed);
  return hydrateScheduleKpi({
    ...(prior ?? emptyScheduleKpi()),
    ...patch,
    notes: prior?.notes?.trim() || `${parsed.sheet} Phase Grand Total`,
  });
}

/** @deprecated Day-1 alias — prefer ScheduleKpiArea */
export type ScheduleKpiUnit = ScheduleKpiArea;
