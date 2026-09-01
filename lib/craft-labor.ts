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
  SHAHAN_CRAFT_TITLES,
  SHAHAN_STAFF_TITLES,
  SHAHAN_SUPPORT_TITLES,
} from "./shahan-wood-river.ts";

export const STAFF_POSITIONS = SHAHAN_STAFF_TITLES;
export const CRAFT_POSITIONS = SHAHAN_CRAFT_TITLES;
export const LISTED_POSITIONS = [...STAFF_POSITIONS, ...CRAFT_POSITIONS];
export const SUPPORT_DUTIES = SHAHAN_SUPPORT_TITLES;

export const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export const CRAFT_SHIFTS = ["Days", "Nights", "Days & nights"] as const;

export type CraftShift = (typeof CRAFT_SHIFTS)[number];

/** Locked labels for an extra stretch on the same phase. Other is free text. */
export const RANGE_DESCRIPTION_REASONS = [
  "Hiring progression",
  "Training",
  "Onboarding/Learning",
] as const;

export const RANGE_DESCRIPTION_OTHER = "Other";

export type RangeDescriptionReason = (typeof RANGE_DESCRIPTION_REASONS)[number];

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
  /** Label only. Never feeds ST / OT / DT / PD / hours / cost. */
  description?: string;
};

export function rangeDescriptionLabel(description?: string): string {
  return description?.trim() ?? "";
}

export function isListedRangeDescription(description?: string): boolean {
  return (RANGE_DESCRIPTION_REASONS as readonly string[]).includes(rangeDescriptionLabel(description));
}

export function rangeDescriptionChoice(description?: string, wantOther = false): string {
  const label = rangeDescriptionLabel(description);
  if (isListedRangeDescription(label)) return label;
  if (label || wantOther) return RANGE_DESCRIPTION_OTHER;
  return "";
}

export type ExtraRangeEnvelope = {
  minStart: string;
  maxEnd: string;
};

function laterYmd(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function earlierYmd(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** First crew range on the phase, intersected with Job setup when that range is bound. */
export function extraRangeEnvelope(
  first?: Pick<CalendarRange, "start" | "end" | "phaseId"> | null,
  phase?: Pick<PhaseRow, "id" | "start" | "stop"> | null,
): ExtraRangeEnvelope | null {
  let minStart = first?.start ?? "";
  let maxEnd = first?.end ?? "";
  const bound = Boolean(phase && first?.phaseId && first.phaseId === phase.id);
  if (bound) {
    minStart = laterYmd(minStart, phase?.start ?? "");
    maxEnd = earlierYmd(maxEnd, phase?.stop ?? "");
  }
  if (!minStart && !maxEnd) return null;
  if (minStart && maxEnd && minStart > maxEnd) return { minStart, maxEnd: minStart };
  return { minStart, maxEnd };
}

export function extraRangeFitsEnvelope(
  extra: Pick<CalendarRange, "start" | "end">,
  envelope: ExtraRangeEnvelope | null,
): boolean {
  if (!envelope) return true;
  if (!extra.start && !extra.end) return true;
  if (extra.start && envelope.minStart && extra.start < envelope.minStart) return false;
  if (extra.end && envelope.maxEnd && extra.end > envelope.maxEnd) return false;
  return true;
}

export function extraRangeIsValid(
  extra: Pick<CalendarRange, "start" | "end">,
  first?: Pick<CalendarRange, "start" | "end" | "phaseId"> | null,
  phase?: Pick<PhaseRow, "id" | "start" | "stop"> | null,
): boolean {
  return extraRangeFitsEnvelope(extra, extraRangeEnvelope(first, phase));
}

export function clampExtraRangeDates<T extends Pick<CalendarRange, "start" | "end">>(
  extra: T,
  envelope: ExtraRangeEnvelope | null,
): T {
  if (!envelope) return extra;
  let start = extra.start;
  let end = extra.end;
  if (start) {
    if (envelope.minStart && start < envelope.minStart) start = envelope.minStart;
    if (envelope.maxEnd && start > envelope.maxEnd) start = envelope.maxEnd;
  }
  if (end) {
    if (envelope.maxEnd && end > envelope.maxEnd) end = envelope.maxEnd;
    if (envelope.minStart && end < envelope.minStart) end = envelope.minStart;
  }
  if (start && end && end < start) end = start;
  return { ...extra, start, end };
}

export function extraSharesFirstEnvelope(extra: Pick<CalendarRange, "unitId">, first: Pick<CalendarRange, "unitId">) {
  if (extra.unitId && first.unitId && extra.unitId !== first.unitId) return false;
  return true;
}

export function applyExtraRangeEnvelopes(ranges: CalendarRange[], phases: PhaseRow[] = []): CalendarRange[] {
  return ranges.map((range) => {
    if (!range.phaseId) return range;
    const first = ranges.find((item) => item.phaseId === range.phaseId);
    if (!first || first.id === range.id || !extraSharesFirstEnvelope(range, first)) return range;
    const phase = phases.find((item) => item.id === range.phaseId);
    return clampExtraRangeDates(range, extraRangeEnvelope(first, phase));
  });
}

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
    position: row.position,
    shift: row.shift,
    clockOverride: row.clockOverride,
    laborClassOverride: row.laborClassOverride,
    ranges: row.ranges.map((range) => ({
      ...range,
      id: uid("rg"),
      phaseId: range.phaseId,
      unitId: range.unitId,
      start: range.start,
      end: range.end,
      headcount: range.headcount,
      nightHeadcount: range.nightHeadcount,
      hoursPerShift: range.hoursPerShift,
      perDiemPeople: range.perDiemPeople,
      nightPerDiemPeople: range.nightPerDiemPeople,
      days: [...range.days],
      otAfter8: range.otAfter8,
      shift: range.shift,
      skipDates: range.skipDates ? [...range.skipDates] : [],
      description: range.description,
    })),
  };
}

/** Copy a crew row. Do not re-seed from Job setup — that mints a different ST/OT/DT split. */
export function duplicateCraftRow(row: CraftRow): CraftRow {
  const title = row.position.trim();
  const copy = cloneCraftRow(row);
  if (!title) {
    return { ...copy, position: "", ranges: [] };
  }
  return { ...copy, position: title };
}

export function cloneSupportLine(row: SupportLine): SupportLine {
  const copy = cloneCraftRow(row);
  return { ...copy, id: uid("sup"), billedAs: row.billedAs };
}

export function duplicateSupportLine(row: SupportLine): SupportLine {
  const copy = duplicateCraftRow(row);
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
    description: prev?.description,
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
    description: "",
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
        next.description = prev.description;
        const first = prior[0];
        if (first && extraSharesFirstEnvelope(next, first)) {
          return clampExtraRangeDates(next, extraRangeEnvelope(first, source));
        }
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
  return applyExtraRangeEnvelopes([...owned, ...extras], phases);
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
