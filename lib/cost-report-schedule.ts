/**
 * Scheduler / progress KPI for Cost report PPR earned hours.
 * Job-total earned is Day-1. Optional unit rows can roll up if the total is blank.
 * Hours win over typed Physical % when both are present.
 */

export type ScheduleKpiUnit = {
  unit: string;
  earnedHours: number;
  /** 0–1 plan percent when the scheduler sent one. */
  planPct: number | null;
};

export type ScheduleKpi = {
  /** Primary Input Required — to-date earned workhours from P6 / customer progress. */
  earnedHoursToDate: number | null;
  /** Optional daily earned. Blank → to-date minus prior snapshot. */
  earnedHoursDaily: number | null;
  /** Optional 0–1 physical % if they sent % instead of/in addition to hours. */
  physicalPctToDate: number | null;
  notes: string;
  units: ScheduleKpiUnit[];
};

export function emptyScheduleKpi(): ScheduleKpi {
  return {
    earnedHoursToDate: null,
    earnedHoursDaily: null,
    physicalPctToDate: null,
    notes: "",
    units: [],
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

/** 45 or 45% → 0.45; 0.45 stays 0.45. */
export function parsePhysicalPct(value: unknown): number | null {
  const n = finiteOrNull(value);
  if (n == null || n < 0) return null;
  if (n > 1) return hours(Math.min(n, 100) / 100);
  return hours(n);
}

export function hydrateScheduleKpi(raw: unknown): ScheduleKpi {
  const empty = emptyScheduleKpi();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const row = raw as Record<string, unknown>;
  const units = Array.isArray(row.units)
    ? row.units
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const unit = item as Record<string, unknown>;
          const name = typeof unit.unit === "string" ? unit.unit.trim() : "";
          const earnedHours = Math.max(0, finiteOrNull(unit.earnedHours) ?? 0);
          if (!name && !(earnedHours > 0)) return null;
          return {
            unit: name,
            earnedHours,
            planPct: parsePhysicalPct(unit.planPct),
          };
        })
        .filter((item): item is ScheduleKpiUnit => Boolean(item))
    : [];
  return {
    earnedHoursToDate: finiteOrNull(row.earnedHoursToDate),
    earnedHoursDaily: finiteOrNull(row.earnedHoursDaily),
    physicalPctToDate: parsePhysicalPct(row.physicalPctToDate),
    notes: typeof row.notes === "string" ? row.notes : "",
    units,
  };
}

export function scheduleKpiEntered(kpi?: ScheduleKpi | null): boolean {
  if (!kpi) return false;
  if (kpi.earnedHoursToDate != null && Number.isFinite(kpi.earnedHoursToDate)) return true;
  if (kpi.physicalPctToDate != null && Number.isFinite(kpi.physicalPctToDate)) return true;
  return kpi.units.some((unit) => unit.earnedHours > 0);
}

export function scheduleUnitHours(kpi?: ScheduleKpi | null): number {
  return hours((kpi?.units ?? []).reduce((sum, unit) => sum + Math.max(0, unit.earnedHours || 0), 0));
}

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
  const unitSum = scheduleUnitHours(kpi);
  let toDate = 0;
  let hoursAreSource = true;
  if (kpi!.earnedHoursToDate != null && Number.isFinite(kpi!.earnedHoursToDate)) {
    toDate = hours(Math.max(0, kpi!.earnedHoursToDate));
  } else if (unitSum > 0) {
    toDate = unitSum;
  } else if (kpi!.physicalPctToDate != null && directBudgetHours > 0) {
    toDate = hours(Math.max(0, kpi!.physicalPctToDate) * directBudgetHours);
    hoursAreSource = false;
  }
  const daily =
    kpi!.earnedHoursDaily != null && Number.isFinite(kpi!.earnedHoursDaily)
      ? hours(Math.max(0, kpi!.earnedHoursDaily))
      : hours(Math.max(0, toDate - priorEarnedToDate));
  const pct =
    directBudgetHours > 0 ? ratio(toDate, directBudgetHours) : hours(kpi!.physicalPctToDate ?? 0);
  return { toDate, daily, pct, fromKpi: true, hoursAreSource };
}

export const SCHEDULE_KPI_STANDIN_NOTE =
  "No scheduler earned entered — using Day-1 stand-in (Direct earned tracks expended). Support earned = Direct physical % complete × Support budget hours.";

export const SCHEDULE_KPI_ACTIVE_NOTE =
  "Earned hours from scheduler KPI on Cost report. Physical % = earned / Direct budget hours (hours win if % was also typed). Support earned = Direct % × Support budget hours.";
