import type { ClockOverride } from "./hours-clock";
import type { LaborClass } from "./labor-class";
import {
  PHASE_IDS,
  phaseForRange,
  rangeSeedsFromPhases,
  type JobUnit,
  type PhaseRow,
} from "./phase-schedule.ts";

export const STAFF_POSITIONS = [
  "Analyst Cost 01",
  "Cost Analyst",
  "Project Controls",
  "Superintendent",
  "Superintendent General PF 01",
  "General Superintendent",
  "Project Manager",
] as const;

export const CRAFT_POSITIONS = [
  "General Foreman",
  "Foreman",
  "Boilermaker Journeyman",
  "Boilermaker Helper",
  "Pipefitter Journeyman",
  "Pipefitter Helper",
  "Ironworker Journeyman",
  "Operator",
  "Laborer",
  "Millwright",
  "Electrician",
  "Welder",
  "Merit welder",
] as const;

export const LISTED_POSITIONS = [...STAFF_POSITIONS, ...CRAFT_POSITIONS] as const;

export const SUPPORT_DUTIES = [
  "Tool Room Attendant",
  "Fire Watch",
  "Hole Watch",
  "Safety Attendant",
  "Material Handler",
] as const;

export const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export const CRAFT_SHIFTS = ["Days", "Nights", "Days & nights"] as const;

export type CraftShift = (typeof CRAFT_SHIFTS)[number];

export type CalendarRange = {
  id: string;
  start: string;
  end: string;
  headcount: number;
  nightHeadcount: number;
  hoursPerShift: number;
  perDiemPeople: number;
  nightPerDiemPeople?: number;
  days: boolean[];
  otAfter8?: boolean;
  phaseId?: string;
  shift?: CraftShift;
  skipDates?: string[];
  unitId?: string;
};

export type CraftRow = {
  id: string;
  position: string;
  shift: CraftShift;
  st: number;
  ot: number;
  dt: number;
  pd: number;
  hours: number;
  cost: string;
  clockOverride: ClockOverride;
  laborClassOverride: LaborClass | null;
  ranges: CalendarRange[];
};

export function maskForDaysPerWeek(n: number): boolean[] {
  const count = Math.min(7, Math.max(0, Math.round(n)));
  if (count === 7) return [true, true, true, true, true, true, true];
  const next = [false, false, false, false, false, false, false];
  const order = [1, 2, 3, 4, 5, 6, 0];
  for (let i = 0; i < count; i += 1) next[order[i]] = true;
  return next;
}

export function daysPerWeekFromMask(days: boolean[]): number {
  return days.filter(Boolean).length;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankRange(): CalendarRange {
  return {
    id: uid("rg"),
    start: "",
    end: "",
    headcount: 1,
    nightHeadcount: 1,
    hoursPerShift: 10,
    perDiemPeople: 1,
    nightPerDiemPeople: 1,
    days: [false, true, true, true, true, true, true],
  };
}

export function blankCraftRow(): CraftRow {
  return {
    id: uid("cr"),
    position: "",
    shift: "Days",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    clockOverride: "auto",
    laborClassOverride: null,
    ranges: [blankRange()],
  };
}

export function cloneCraftRow(row: CraftRow): CraftRow {
  return {
    ...row,
    id: uid("cr"),
    ranges: row.ranges.map((range) => ({
      ...range,
      id: uid("rg"),
      days: [...range.days],
      skipDates: range.skipDates ? [...range.skipDates] : [],
    })),
  };
}

export function perDiemCap(range: CalendarRange, _shift?: CraftShift) {
  return Math.max(0, range.headcount);
}

export function nightPerDiemCap(range: CalendarRange) {
  return Math.max(0, range.nightHeadcount);
}

export function clampPerDiem(range: CalendarRange, _shift?: CraftShift): CalendarRange {
  const dayCap = perDiemCap(range);
  const nightCap = nightPerDiemCap(range);
  const nightPd = range.nightPerDiemPeople ?? 1;
  return {
    ...range,
    perDiemPeople: Math.min(Math.max(0, range.perDiemPeople), dayCap),
    nightPerDiemPeople: Math.min(Math.max(0, nightPd), nightCap),
  };
}

export function rangeFromPhase(row: PhaseRow, prev?: CalendarRange, unitId?: string): CalendarRange {
  const seed = rangeSeedsFromPhases([row])[0];
  return {
    id: prev?.id && prev.phaseId === seed.phaseId ? prev.id : uid("rg"),
    phaseId: seed.phaseId,
    start: seed.start,
    end: seed.end,
    headcount: prev?.headcount ?? 1,
    nightHeadcount: prev?.nightHeadcount ?? 1,
    hoursPerShift: seed.hoursPerShift,
    perDiemPeople: prev?.perDiemPeople ?? 1,
    nightPerDiemPeople: prev?.nightPerDiemPeople ?? 1,
    days: seed.days,
    otAfter8: seed.otAfter8,
    shift: prev?.shift ?? "Days",
    skipDates: prev?.skipDates ? [...prev.skipDates] : [...(seed.skipDates ?? [])],
    unitId: unitId ?? prev?.unitId,
  };
}

export function extraRangeFromPhase(phase: PhaseRow, template?: CalendarRange, unitId?: string): CalendarRange {
  const base = rangeFromPhase(phase, template, unitId);
  return {
    ...base,
    id: uid("rg"),
    start: unitId && unitId !== template?.unitId ? phase.start : template?.start || phase.start,
    end: unitId && unitId !== template?.unitId ? phase.stop : template?.end || phase.stop,
    skipDates: template?.skipDates ? [...template.skipDates] : [...(base.skipDates ?? [])],
    days: template?.days ? [...template.days] : [...base.days],
    unitId: unitId ?? template?.unitId ?? base.unitId,
  };
}

export function nextUnitId(units: JobUnit[], existing: CalendarRange[] = []): string | undefined {
  const used = new Set(existing.map((range) => range.unitId).filter(Boolean));
  return units.find((unit) => !used.has(unit.id))?.id ?? units[1]?.id ?? units[0]?.id;
}

export function rangesFromPhases(
  phases: PhaseRow[],
  previous: CalendarRange[] = [],
  units: JobUnit[] = [],
  multiUnits = false,
): CalendarRange[] {
  const extras = previous.filter((range) => !range.phaseId);
  const owned = PHASE_IDS.flatMap((id) => {
    const jobPhase = phases.find((item) => item.id === id);
    const unitOn = multiUnits && units.some((unit) => unit.phases.find((item) => item.id === id)?.on);
    if (!jobPhase?.on && !unitOn) return [];
    const fallback = jobPhase ?? units[0]?.phases.find((item) => item.id === id);
    if (!fallback) return [];
    const prior = previous.filter((item) => item.phaseId === id);
    const firstUnitId = multiUnits ? units[0]?.id : undefined;
    if (prior.length === 0) return [rangeFromPhase(fallback, undefined, firstUnitId)];
    return prior.map((prev, index) => {
      const source = phaseForRange(prev, phases, units, multiUnits) ?? fallback;
      const next = rangeFromPhase(source, prev, multiUnits ? prev.unitId ?? firstUnitId : prev.unitId);
      if (multiUnits && next.unitId) {
        const tagged = units.find((unit) => unit.id === next.unitId)?.phases.find((item) => item.id === id);
        if (tagged) {
          next.start = tagged.start;
          next.end = tagged.stop;
        }
      } else if (index > 0) {
        next.start = prev.start;
        next.end = prev.end;
      }
      return next;
    });
  });
  return [...owned, ...extras];
}

export function craftRowFromPhases(phases: PhaseRow[], units: JobUnit[] = [], multiUnits = false): CraftRow {
  const next = blankCraftRow();
  const ranges = rangesFromPhases(phases, [], units, multiUnits);
  return { ...next, ranges: ranges.length ? ranges : next.ranges };
}

export function syncCraftRows(
  rows: CraftRow[],
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): CraftRow[] {
  return rows.map((row) => ({ ...row, ranges: rangesFromPhases(phases, row.ranges, units, multiUnits) }));
}
