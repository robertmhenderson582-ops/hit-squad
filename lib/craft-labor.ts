import type { ClockOverride } from "./hours-clock";
import type { LaborClass } from "./labor-class";
import {
  PHASE_IDS,
  phaseForRange,
  rangeSeedsFromPhases,
  type JobUnit,
  type PhaseRow,
} from "./phase-schedule.ts";
import {
  WOOD_RIVER_CRAFT_TITLES,
  WOOD_RIVER_STAFF_TITLES,
  WOOD_RIVER_SUPPORT_TITLES,
} from "./wood-river-positions.ts";

export const STAFF_POSITIONS = WOOD_RIVER_STAFF_TITLES;
export const CRAFT_POSITIONS = WOOD_RIVER_CRAFT_TITLES;
export const LISTED_POSITIONS = [...STAFF_POSITIONS, ...CRAFT_POSITIONS];
export const SUPPORT_DUTIES = WOOD_RIVER_SUPPORT_TITLES;

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

export type SupportLine = CraftRow & {
  billedAs: string;
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
    ranges: [],
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

export function cloneSupportLine(row: SupportLine): SupportLine {
  const copy = cloneCraftRow(row);
  return { ...copy, id: uid("sup"), billedAs: row.billedAs };
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
    hoursPerShift: prev && Number.isFinite(prev.hoursPerShift) ? prev.hoursPerShift : seed.hoursPerShift,
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
  const newUnit = Boolean(unitId && unitId !== template?.unitId);
  return {
    ...base,
    id: uid("rg"),
    start: newUnit ? phase.start : "",
    end: newUnit ? phase.stop : "",
    hoursPerShift: newUnit ? base.hoursPerShift : 0,
    headcount: newUnit ? (template?.headcount ?? 1) : 1,
    nightHeadcount: newUnit ? (template?.nightHeadcount ?? 1) : 1,
    perDiemPeople: newUnit ? (template?.perDiemPeople ?? 1) : 0,
    nightPerDiemPeople: newUnit ? (template?.nightPerDiemPeople ?? 1) : 0,
    skipDates: newUnit ? [...(base.skipDates ?? [])] : [],
    days: template?.days ? [...template.days] : [...base.days],
    unitId: newUnit ? unitId : template?.unitId,
  };
}

export function rangesOverlap(a: Pick<CalendarRange, "start" | "end">, b: Pick<CalendarRange, "start" | "end">) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return a.start <= b.end && b.start <= a.end;
}

export function phaseRangesOverlap(ranges: CalendarRange[], phaseId?: string) {
  const list = ranges.filter((range) => (phaseId ? range.phaseId === phaseId : true));
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (rangesOverlap(list[i], list[j])) return true;
    }
  }
  return false;
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
      if (index > 0) {
        next.start = prev.start;
        next.end = prev.end;
        next.hoursPerShift = prev.hoursPerShift;
        return next;
      }
      if (multiUnits && next.unitId) {
        const tagged = units.find((unit) => unit.id === next.unitId)?.phases.find((item) => item.id === id);
        if (tagged) {
          next.start = tagged.start;
          next.end = tagged.stop;
        }
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
  return rows.map((row) => {
    if (!row.position.trim() && row.ranges.length === 0) return row;
    return { ...row, ranges: rangesFromPhases(phases, row.ranges, units, multiUnits) };
  });
}

export function assignCraftPosition(
  row: CraftRow,
  position: string,
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): CraftRow {
  if (!position.trim()) {
    return { ...row, position: "", ranges: [] };
  }
  if (row.ranges.length === 0) {
    return { ...craftRowFromPhases(phases, units, multiUnits), id: row.id, position };
  }
  return { ...row, position };
}

export function blankSupportLine(): SupportLine {
  return { ...blankCraftRow(), id: uid("sup"), billedAs: "" };
}

export function addSupportLine(
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SupportLine {
  const next = blankSupportLine();
  return { ...next, ranges: craftRowFromPhases(phases, units, multiUnits).ranges };
}

export function hydrateSupportLine(raw: Partial<SupportLine> | null | undefined): SupportLine {
  const next = blankSupportLine();
  if (!raw || typeof raw !== "object") return next;
  return {
    ...next,
    ...raw,
    id: raw.id || next.id,
    position: raw.position ?? "",
    billedAs: raw.billedAs ?? "",
    shift: raw.shift ?? next.shift,
    clockOverride: raw.clockOverride ?? next.clockOverride,
    laborClassOverride: raw.laborClassOverride ?? next.laborClassOverride,
    ranges: Array.isArray(raw.ranges) ? raw.ranges : [],
  };
}

export function hydrateSupportLines(rows: unknown): SupportLine[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => hydrateSupportLine(row as Partial<SupportLine>));
}

function seedSupportRanges(
  row: SupportLine,
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SupportLine {
  if (row.ranges.some((range) => range.phaseId)) return row;
  return { ...row, ranges: rangesFromPhases(phases, row.ranges, units, multiUnits) };
}

export function assignSupportDuty(
  row: SupportLine,
  position: string,
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SupportLine {
  const billedAs = row.billedAs;
  if (!position.trim()) {
    return seedSupportRanges({ ...hydrateSupportLine(row), position: "", billedAs }, phases, units, multiUnits);
  }
  const next = assignCraftPosition(hydrateSupportLine(row), position, phases, units, multiUnits);
  return { ...next, billedAs };
}

export function assignSupportBilledAs(
  row: SupportLine,
  billedAs: string,
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SupportLine {
  return seedSupportRanges({ ...hydrateSupportLine(row), billedAs }, phases, units, multiUnits);
}

export function syncSupportRows(
  rows: SupportLine[],
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SupportLine[] {
  return hydrateSupportLines(rows).map((row) => ({
    ...row,
    ranges: rangesFromPhases(phases, row.ranges, units, multiUnits),
  }));
}
