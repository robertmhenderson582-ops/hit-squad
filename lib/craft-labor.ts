import type { ClockOverride } from "@/lib/hours-clock";
import type { LaborClass } from "@/lib/labor-class";

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
  days: boolean[];
  otAfter8?: boolean;
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
    ranges: row.ranges.map((range) => ({ ...range, id: uid("rg") })),
  };
}

export function perDiemCap(range: CalendarRange, shift: CraftShift) {
  const head =
    shift === "Days & nights" ? range.headcount + range.nightHeadcount : range.headcount;
  return Math.max(0, head);
}

export function clampPerDiem(range: CalendarRange, shift: CraftShift): CalendarRange {
  const cap = perDiemCap(range, shift);
  return { ...range, perDiemPeople: Math.min(Math.max(0, range.perDiemPeople), cap) };
}

export function uniqueCraftNames(rows: CraftRow[]) {
  return [...new Set(rows.map((row) => row.position).filter(Boolean))];
}
