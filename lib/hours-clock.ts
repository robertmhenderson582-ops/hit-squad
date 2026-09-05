import { WOOD_RIVER_STAFF_TITLES } from "./wood-river-positions.ts";

export type SiteClock = "east-coast" | "ca-daily" | "yates" | "customer";
export type SeatKind = "staff" | "craft";
export type ClockOverride = "auto" | "comp" | "staff";
export type RunningClock = "staff" | SiteClock;

export type HoursSplit = {
  st: number;
  ot: number;
  dt: number;
  pd: number;
  hours: number;
  workedDays: number;
};

export type ComputeRangeInput = {
  position: string;
  site?: string;
  client?: string;
  plantCode?: string;
  start: string;
  end: string;
  hoursPerShift: number;
  headcount?: number;
  nightHeadcount?: number;
  sundayHeadcount?: number;
  nightSundayHeadcount?: number;
  shift?: "Days" | "Nights" | "Days & nights";
  days?: boolean[];
  perDiemPeople?: number;
  nightPerDiemPeople?: number;
  otAfter8?: boolean;
  phaseId?: string;
  billedAs?: string;
  clockOverride?: ClockOverride;
  skipDates?: string[];
  /** Job-level holidays (YYYY-MM-DD). Unioned with skipDates — no billable hours that day. */
  holidays?: string[];
};

export type RangeDay = {
  date: string;
  weekday: number;
  st: number;
  ot: number;
  dt: number;
};

export type RangeHours = HoursSplit & { days: RangeDay[] };

const STAFF_SEAT =
  /\b(superintendent|superintendents|project manager|\bpm\b|cost analyst|analyst cost|project controls|supervision|supervisor|\bmerit\b|lead site|lead safety|lead qa|coordinator|clerk|manager office|manager,? project|engineer,? (?:project|field)|planner|analyst)\b/i;

function staffTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const B1_STAFF_KEYS = new Set(WOOD_RIVER_STAFF_TITLES.map(staffTitleKey));

/** Unique sorted YYYY-MM-DD dates. Invalid stamps drop. */
export function hydrateHolidays(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;]+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!parseYmd(text) || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.sort();
}

export function unionSkipDates(skipDates?: readonly string[] | null, holidays?: readonly string[] | null): string[] {
  return hydrateHolidays([...(skipDates ?? []), ...(holidays ?? [])]);
}

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eachDate(start: string, end: string): Date[] {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to || from > to) return [];
  const dates: Date[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function mondayKey(date: Date): string {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = next.getDay();
  const shift = dow === 0 ? -6 : 1 - dow;
  next.setDate(next.getDate() + shift);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function siteClockFromText(site = "", client = "", plantCode = ""): SiteClock {
  const hay = `${site} ${client} ${plantCode}`.toLowerCase();
  if (hay.includes("rodeo")) return "ca-daily";
  if (hay.includes("yates") || hay.includes("georgia power") || hay.includes("piedmont")) return "yates";
  if (hay.includes("wood river") || hay.includes("bayway") || hay.includes("pca0001103") || hay.includes("east coast")) {
    return "east-coast";
  }
  return "customer";
}

export function boundOtLabel(site = "", client = "", plantCode = ""): string {
  const clock = siteClockFromText(site, client, plantCode);
  if (clock === "east-coast") return "East Coast (PCA0001103)";
  if (clock === "ca-daily") return "CA daily (8 / 12 / 7th-day)";
  if (clock === "yates") return "Yates (weekday 8 + OT · Saturday OT · Sunday DT)";
  return "Customer rule";
}

export function isStaffSeat(position: string): boolean {
  if (STAFF_SEAT.test(position)) return true;
  if (B1_STAFF_KEYS.has(staffTitleKey(position))) return true;
  const code = position.match(/\b(PF|BM|OE|LB|IW|TM|M)\b/i);
  return Boolean(code && code[1].toUpperCase() === "M");
}

export function seatKind(position: string): SeatKind {
  return isStaffSeat(position) ? "staff" : "craft";
}

export function runningClock(
  position: string,
  site: string,
  client: string,
  override: ClockOverride = "auto",
  plantCode = "",
): RunningClock {
  const siteClock = siteClockFromText(site, client, plantCode);
  if (override === "staff") return "staff";
  if (override === "comp") return siteClock;
  return seatKind(position) === "staff" ? "staff" : siteClock;
}

export function clockTitle(position: string, billedAs = ""): string {
  return billedAs.trim() || position;
}

/** Pre / Post follow Job setup. Oil Out / Mechanical / Oil In (and unbound ranges) are always OT after 8. */
export function eastCoastCraftOtAfter8(phaseId?: string, jobOtAfter8 = false): boolean {
  if (phaseId === "pre" || phaseId === "post") return Boolean(jobOtAfter8);
  return true;
}

export function clockNote(
  position: string,
  site: string,
  client: string,
  override: ClockOverride = "auto",
  plantCode = "",
  billedAs = "",
): string {
  const clock = runningClock(clockTitle(position, billedAs), site, client, override, plantCode);
  if (clock === "staff") return "Staff clock · Sunday DT · weekday ST to 10 · weekly 40 · no DT after 12 · no 7th-day";
  if (clock === "east-coast") {
    return "East Coast COMP · weekday ST to 8 · Saturday all OT · Sunday DT · weekly 40 · not DT after 12";
  }
  if (clock === "ca-daily") return "CA daily COMP · 8 / 12 / 7th-day · DT after 12 only on CA";
  if (clock === "yates") return "Yates COMP · weekday 8 ST + OT · Saturday OT · Sunday DT";
  return "Customer rule · weekday ST to 8 · Saturday all OT · Sunday DT · weekly 40 · no DT after 12";
}

function dailySplit(
  hours: number,
  dow: number,
  clock: RunningClock,
  otAfter8: boolean,
  seventhDay: boolean,
): { st: number; ot: number; dt: number } {
  if (hours <= 0) return { st: 0, ot: 0, dt: 0 };

  if (clock === "ca-daily") {
    if (seventhDay) {
      const ot = Math.min(8, hours);
      return { st: 0, ot, dt: Math.max(0, hours - 8) };
    }
    const st = Math.min(8, hours);
    const ot = Math.min(4, Math.max(0, hours - 8));
    const dt = Math.max(0, hours - 12);
    return { st, ot, dt };
  }

  if (dow === 0) return { st: 0, ot: 0, dt: hours };

  // CBA craft (Excel WEEKDAY=7): every Saturday hour is OT. Not DT. Staff keeps its own Saturday clock.
  if (dow === 6 && clock !== "staff") return { st: 0, ot: hours, dt: 0 };

  if (clock === "yates") {
    const st = Math.min(8, hours);
    return { st, ot: Math.max(0, hours - st), dt: 0 };
  }

  if (clock === "east-coast") {
    if (!otAfter8) return { st: hours, ot: 0, dt: 0 };
    const st = Math.min(8, hours);
    return { st, ot: Math.max(0, hours - st), dt: 0 };
  }

  if (clock === "staff") {
    const dailySt = otAfter8 ? 8 : 10;
    const st = Math.min(dailySt, hours);
    return { st, ot: Math.max(0, hours - st), dt: 0 };
  }

  const st = Math.min(8, hours);
  return { st, ot: Math.max(0, hours - st), dt: 0 };
}

export function applyWeekly40(days: { key: string; st: number; ot: number; dt: number }[], headcount: number) {
  const weeklySt = 40 * Math.max(1, headcount);
  const weeks = new Map<string, typeof days>();
  for (const day of days) {
    const list = weeks.get(day.key) ?? [];
    list.push(day);
    weeks.set(day.key, list);
  }
  for (const week of weeks.values()) {
    let kept = 0;
    for (const day of week) {
      const room = Math.max(0, weeklySt - kept);
      if (day.st <= room) {
        kept += day.st;
        continue;
      }
      const extra = day.st - room;
      day.st = room;
      day.ot += extra;
      kept = weeklySt;
    }
  }
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mergeDualCrew(day: RangeHours, night: RangeHours): RangeHours {
  const totals = sumSplits([day, night]);
  const byDate = new Map<string, RangeDay>();
  for (const part of [...day.days, ...night.days]) {
    const existing = byDate.get(part.date);
    if (!existing) {
      byDate.set(part.date, { ...part });
      continue;
    }
    existing.st += part.st;
    existing.ot += part.ot;
    existing.dt += part.dt;
  }
  return {
    ...totals,
    workedDays: byDate.size,
    days: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

type WeekDaySplit = { key: string; date: string; weekday: number; st: number; ot: number; dt: number };

function emptyHours(): RangeHours {
  return { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0, days: [] };
}

function hoursFromSplits(raw: WeekDaySplit[], workedDays: number, pd: number): RangeHours {
  const st = raw.reduce((sum, day) => sum + day.st, 0);
  const ot = raw.reduce((sum, day) => sum + day.ot, 0);
  const dt = raw.reduce((sum, day) => sum + day.dt, 0);
  return {
    st,
    ot,
    dt,
    pd,
    hours: st + ot + dt,
    workedDays,
    days: raw.map(({ date, weekday, st: daySt, ot: dayOt, dt: dayDt }) => ({
      date,
      weekday,
      st: daySt,
      ot: dayOt,
      dt: dayDt,
    })),
  };
}

/** Daily ST/OT/DT before weekly-40. Same Monday-week across ranges still shares the 40 ST bank. */
export function computeRangeDaySplits(input: ComputeRangeInput): {
  raw: WeekDaySplit[];
  head: number;
  workedDays: number;
  pd: number;
} {
  if (!input.position.trim() || input.shift === "Days & nights") {
    return { raw: [], head: 1, workedDays: 0, pd: 0 };
  }
  const daysMask = input.days ?? [false, true, true, true, true, true, true];
  const head = Math.max(1, input.headcount ?? 1);
  const title = clockTitle(input.position, input.billedAs);
  const clock = runningClock(
    title,
    input.site ?? "",
    input.client ?? "",
    input.clockOverride ?? "auto",
    input.plantCode ?? "",
  );
  const flagged = Boolean(input.otAfter8);
  const otAfter8 = clock === "east-coast" ? eastCoastCraftOtAfter8(input.phaseId, flagged) : flagged;
  const dates = eachDate(input.start, input.end);
  const raw: WeekDaySplit[] = [];
  let workedDays = 0;
  const workedInWeek = new Map<string, number>();
  const skip = new Set(unionSkipDates(input.skipDates, input.holidays));
  for (const date of dates) {
    const stamp = ymd(date);
    if (skip.has(stamp)) continue;
    const dow = date.getDay();
    if (!daysMask[dow]) continue;
    const dayHead =
      dow === 0 && input.sundayHeadcount != null && Number.isFinite(Number(input.sundayHeadcount))
        ? Math.max(0, Number(input.sundayHeadcount))
        : head;
    if (dayHead <= 0) continue;
    const key = mondayKey(date);
    const prior = workedInWeek.get(key) ?? 0;
    const seventh = clock === "ca-daily" && prior >= 6;
    workedInWeek.set(key, prior + 1);
    const split = dailySplit(input.hoursPerShift, dow, clock, otAfter8, seventh);
    raw.push({
      key,
      date: stamp,
      weekday: dow,
      st: split.st * dayHead,
      ot: split.ot * dayHead,
      dt: split.dt * dayHead,
    });
    workedDays += 1;
  }
  return { raw, head, workedDays, pd: workedDays * Math.max(0, input.perDiemPeople ?? 0) };
}

export function computeRangeHours(input: ComputeRangeInput): RangeHours {
  if (!input.position.trim()) return emptyHours();
  if (input.shift === "Days & nights") {
    return mergeDualCrew(
      computeRangeHours({
        ...input,
        shift: "Days",
        nightHeadcount: undefined,
        nightPerDiemPeople: undefined,
        nightSundayHeadcount: undefined,
      }),
      computeRangeHours({
        ...input,
        shift: "Nights",
        headcount: input.nightHeadcount ?? 1,
        perDiemPeople: input.nightPerDiemPeople ?? 0,
        sundayHeadcount: input.nightSundayHeadcount ?? input.sundayHeadcount,
        nightHeadcount: undefined,
        nightPerDiemPeople: undefined,
        nightSundayHeadcount: undefined,
      }),
    );
  }
  const { raw, head, workedDays, pd } = computeRangeDaySplits(input);
  applyWeekly40(raw, head);
  return hoursFromSplits(raw, workedDays, pd);
}

export function computeRowHours(
  row: {
    position: string;
    billedAs?: string;
    shift?: "Days" | "Nights" | "Days & nights";
    clockOverride?: ClockOverride;
    ranges: {
      start: string;
      end: string;
      hoursPerShift: number;
      headcount: number;
      nightHeadcount: number;
      sundayHeadcount?: number;
      nightSundayHeadcount?: number;
      perDiemPeople: number;
      nightPerDiemPeople?: number;
      days: boolean[];
      otAfter8?: boolean;
      phaseId?: string;
      shift?: "Days" | "Nights" | "Days & nights";
      skipDates?: string[];
      off?: boolean;
      description?: string;
    }[];
  },
  site = "",
  client = "",
  crewOtAfter8 = false,
  plantCode = "",
  holidays: string[] = [],
): HoursSplit {
  if (!row.position.trim()) {
    return { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0 };
  }
  return sumSplits(
    row.ranges
      .filter((range) => !range.off)
      .map((range) =>
      computeRangeHours({
        position: row.position,
        billedAs: row.billedAs,
        site,
        client,
        plantCode,
        start: range.start,
        end: range.end,
        hoursPerShift: range.hoursPerShift,
        headcount: range.headcount,
        nightHeadcount: range.nightHeadcount,
        sundayHeadcount: range.sundayHeadcount,
        nightSundayHeadcount: range.nightSundayHeadcount,
        shift: range.shift ?? row.shift,
        days: range.days,
        perDiemPeople: range.perDiemPeople,
        nightPerDiemPeople: range.nightPerDiemPeople,
        otAfter8: range.otAfter8 ?? crewOtAfter8,
        phaseId: range.phaseId,
        clockOverride: row.clockOverride ?? "auto",
        skipDates: range.skipDates,
        holidays,
      }),
    ),
  );
}

export function sumSplits(parts: HoursSplit[]): HoursSplit {
  return parts.reduce(
    (sum, part) => ({
      st: sum.st + part.st,
      ot: sum.ot + part.ot,
      dt: sum.dt + part.dt,
      pd: sum.pd + part.pd,
      hours: sum.hours + part.hours,
      workedDays: sum.workedDays + part.workedDays,
    }),
    { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0 },
  );
}
