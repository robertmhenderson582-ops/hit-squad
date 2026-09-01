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
  shift?: "Days" | "Nights" | "Days & nights";
  days?: boolean[];
  perDiemPeople?: number;
  nightPerDiemPeople?: number;
  otAfter8?: boolean;
  clockOverride?: ClockOverride;
  skipDates?: string[];
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
  /\b(superintendent|superintendents|project manager|\bpm\b|cost analyst|analyst cost|project controls|supervision|supervisor|\bmerit\b)\b/i;

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

export function clockNote(
  position: string,
  site: string,
  client: string,
  override: ClockOverride = "auto",
  plantCode = "",
): string {
  const clock = runningClock(position, site, client, override, plantCode);
  if (clock === "staff") return "Staff clock · Sunday DT · weekday ST to 10 · weekly 40 · no DT after 12 · no 7th-day";
  if (clock === "east-coast") return "East Coast COMP · Sunday DT · weekday ST to 10 · weekly 40 · not DT after 12";
  if (clock === "ca-daily") return "CA daily COMP · 8 / 12 / 7th-day · DT after 12 only on CA";
  if (clock === "yates") return "Yates COMP · weekday 8 ST + OT · Saturday OT · Sunday DT";
  return "Customer rule · weekly 40 · Sunday DT · no DT after 12";
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

  if (clock === "yates") {
    if (dow === 6) return { st: 0, ot: hours, dt: 0 };
    const st = Math.min(8, hours);
    return { st, ot: Math.max(0, hours - st), dt: 0 };
  }

  const cap = otAfter8 || clock === "customer" ? 8 : 10;
  const stCap = clock === "customer" && !otAfter8 ? 8 : cap;
  const staffOrEast = clock === "staff" || clock === "east-coast";
  const dailySt = staffOrEast ? (otAfter8 ? 8 : 10) : stCap;
  const st = Math.min(dailySt, hours);
  return { st, ot: Math.max(0, hours - st), dt: 0 };
}

function applyWeekly40(days: { key: string; st: number; ot: number; dt: number }[], headcount: number) {
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

export function computeRangeHours(input: ComputeRangeInput): RangeHours {
  if (!input.position.trim()) {
    return { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0, days: [] };
  }
  if (input.shift === "Days & nights") {
    return mergeDualCrew(
      computeRangeHours({
        ...input,
        shift: "Days",
        nightHeadcount: undefined,
        nightPerDiemPeople: undefined,
      }),
      computeRangeHours({
        ...input,
        shift: "Nights",
        headcount: input.nightHeadcount ?? 1,
        perDiemPeople: input.nightPerDiemPeople ?? 0,
        nightHeadcount: undefined,
        nightPerDiemPeople: undefined,
      }),
    );
  }

  const daysMask = input.days ?? [false, true, true, true, true, true, true];
  const head = Math.max(1, input.headcount ?? 1);
  const clock = runningClock(
    input.position,
    input.site ?? "",
    input.client ?? "",
    input.clockOverride ?? "auto",
    input.plantCode ?? "",
  );
  const otAfter8 = Boolean(input.otAfter8);
  const dates = eachDate(input.start, input.end);
  const raw: { key: string; date: string; weekday: number; st: number; ot: number; dt: number }[] = [];
  let workedDays = 0;
  const workedInWeek = new Map<string, number>();

  const skip = new Set(input.skipDates ?? []);
  for (const date of dates) {
    const stamp = ymd(date);
    if (skip.has(stamp)) continue;
    const dow = date.getDay();
    if (!daysMask[dow]) continue;
    const key = mondayKey(date);
    const prior = workedInWeek.get(key) ?? 0;
    const seventh = clock === "ca-daily" && prior >= 6;
    workedInWeek.set(key, prior + 1);
    const split = dailySplit(input.hoursPerShift, dow, clock, otAfter8, seventh);
    raw.push({
      key,
      date: ymd(date),
      weekday: dow,
      st: split.st * head,
      ot: split.ot * head,
      dt: split.dt * head,
    });
    workedDays += 1;
  }

  applyWeekly40(raw, head);

  const st = raw.reduce((sum, day) => sum + day.st, 0);
  const ot = raw.reduce((sum, day) => sum + day.ot, 0);
  const dt = raw.reduce((sum, day) => sum + day.dt, 0);
  const dayPd = Math.max(0, input.perDiemPeople ?? 0);
  const pd = workedDays * dayPd;
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

export function computeRowHours(
  row: {
    position: string;
    shift?: "Days" | "Nights" | "Days & nights";
    clockOverride?: ClockOverride;
    ranges: {
      start: string;
      end: string;
      hoursPerShift: number;
      headcount: number;
      nightHeadcount: number;
      perDiemPeople: number;
      nightPerDiemPeople?: number;
      days: boolean[];
      otAfter8?: boolean;
      shift?: "Days" | "Nights" | "Days & nights";
      skipDates?: string[];
      off?: boolean;
    }[];
  },
  site = "",
  client = "",
  crewOtAfter8 = false,
  plantCode = "",
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
        site,
        client,
        plantCode,
        start: range.start,
        end: range.end,
        hoursPerShift: range.hoursPerShift,
        headcount: range.headcount,
        nightHeadcount: range.nightHeadcount,
        shift: range.shift ?? row.shift,
        days: range.days,
        perDiemPeople: range.perDiemPeople,
        nightPerDiemPeople: range.nightPerDiemPeople,
        otAfter8: range.otAfter8 ?? crewOtAfter8,
        clockOverride: row.clockOverride ?? "auto",
        skipDates: range.skipDates,
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
