import { HIS_AROMATICS_PACK_ID } from "./his-wood-river.ts";
import {
  defaultPhases,
  inclusiveDays,
  scheduleIsDemoSeedClock,
  type PhaseScheduleState,
} from "./phase-schedule.ts";

/** Sep 2 freeze Job setup. Do not invent a second Aromatics dollar lock. */
export const AROMATICS_FREEZE_PROJECT_START = "2027-01-11";
/**
 * Freeze crew runs multi-month windows off 2027-01-11. A one-day stub
 * (or anything under two weeks) is a collapsed smash, not the freeze.
 */
export const AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS = 14;

const CREW_LANES = ["staff", "generalForeman", "foreman", "direct", "support"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function aromaticsTitleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isAromaticsIdentity(pack?: { packId?: string; title?: string } | null) {
  if (!pack) return false;
  if ((pack.packId || "").trim() === HIS_AROMATICS_PACK_ID) return true;
  return aromaticsTitleKey(pack.title).includes("2027 aromatics");
}

/** Embedded Sep 2 clock. Sheets/crew stay on Drive or the freeze file — this is not a new $ baseline. */
export function aromaticsEmbeddedFreezeClock(): PhaseScheduleState {
  const dates: Record<string, { start: string; stop: string }> = {
    pre: { start: "2027-01-11", stop: "2027-02-28" },
    "oil-out": { start: "2027-03-01", stop: "2027-03-10" },
    mech: { start: "2027-03-11", stop: "2027-04-17" },
    "oil-in": { start: "2027-04-18", stop: "2027-05-03" },
    post: { start: "2027-05-04", stop: "2027-05-21" },
  };
  return {
    projectStart: AROMATICS_FREEZE_PROJECT_START,
    multiUnits: false,
    units: [],
    phases: defaultPhases().map((row) => {
      const next = dates[row.id];
      return next ? { ...row, start: next.start, stop: next.stop } : row;
    }),
  };
}

type CrewRange = { start?: string; end?: string };

function eachCrewRange(crew: unknown): Array<{ start: string; end: string }> {
  const row = asRecord(crew);
  if (!row) return [];
  const ranges: Array<{ start: string; end: string }> = [];
  for (const lane of CREW_LANES) {
    const list = row[lane];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const record = asRecord(item);
      const listRanges = record?.ranges;
      if (!Array.isArray(listRanges)) continue;
      for (const range of listRanges) {
        const entry = range as CrewRange;
        const start = typeof entry.start === "string" ? entry.start : "";
        const end = typeof entry.end === "string" ? entry.end : "";
        if (start && end) ranges.push({ start, end });
      }
    }
  }
  return ranges;
}

export function crewClockSpanDays(crew: unknown): number {
  const ranges = eachCrewRange(crew);
  if (!ranges.length) return 0;
  let min = ranges[0].start;
  let max = ranges[0].end;
  for (const range of ranges) {
    if (range.start < min) min = range.start;
    if (range.end > max) max = range.end;
  }
  return inclusiveDays(min, max);
}

/** Every dated range is a single-day stub — the 2026 seed smash that zeros Estimate Total. */
export function crewRangesAreCollapsedStubs(crew: unknown): boolean {
  const ranges = eachCrewRange(crew);
  if (!ranges.length) return false;
  return ranges.every((range) => range.start === range.end || inclusiveDays(range.start, range.end) <= 1);
}

function scheduleHasPayload(schedule: unknown) {
  const row = asRecord(schedule);
  if (!row) return false;
  if (typeof row.projectStart === "string" && row.projectStart.trim()) return true;
  return Array.isArray(row.phases) && row.phases.length > 0;
}

export function aromaticsPackLooksSmashed(pack?: { packId?: string; title?: string; schedule?: unknown; crew?: unknown } | null) {
  if (!isAromaticsIdentity(pack)) return false;
  if (scheduleHasPayload(pack?.schedule) && scheduleIsDemoSeedClock(pack?.schedule)) return true;
  if (crewRangesAreCollapsedStubs(pack?.crew)) return true;
  const span = crewClockSpanDays(pack?.crew);
  return span > 0 && span < AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS;
}

export function aromaticsStateLooksSmashed(packId: string, schedule: unknown, crew: unknown, title?: string) {
  return aromaticsPackLooksSmashed({ packId, title, schedule, crew });
}

export function aromaticsSourceCanRestore(pack?: { packId?: string; title?: string; schedule?: unknown; crew?: unknown } | null) {
  if (!pack) return false;
  if (aromaticsPackLooksSmashed(pack)) return false;
  if (scheduleHasPayload(pack.schedule) && scheduleIsDemoSeedClock(pack.schedule)) return false;
  if (crewRangesAreCollapsedStubs(pack.crew)) return false;
  const start =
    typeof asRecord(pack.schedule)?.projectStart === "string"
      ? String(asRecord(pack.schedule)?.projectStart)
      : "";
  const clockOk = start === AROMATICS_FREEZE_PROJECT_START || Boolean(start && !scheduleIsDemoSeedClock(pack.schedule));
  const crewOk = crewClockSpanDays(pack.crew) >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS;
  return Boolean(clockOk || crewOk);
}

export function aromaticsPackIsThinner(
  local?: { packId?: string; title?: string; schedule?: unknown; crew?: unknown } | null,
  richer?: { packId?: string; title?: string; schedule?: unknown; crew?: unknown } | null,
) {
  if (!isAromaticsIdentity(local) && !isAromaticsIdentity(richer)) return false;
  if (aromaticsPackLooksSmashed(local) && aromaticsSourceCanRestore(richer)) return true;
  const localSpan = crewClockSpanDays(local?.crew);
  const richSpan = crewClockSpanDays(richer?.crew);
  return richSpan >= AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS && localSpan < richSpan && localSpan < AROMATICS_FREEZE_MIN_CREW_SPAN_DAYS;
}
