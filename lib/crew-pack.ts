import { computeRangeHours, sumSplits, type HoursSplit } from "./hours-clock.ts";
import { isStaffPerDiemLane } from "./shahan-wood-river.ts";

export type CrewPackRow = {
  position: string;
  billedAs?: string;
  shift?: "Days" | "Nights" | "Days & nights";
  clockOverride?: "auto" | "comp" | "staff";
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
  }[];
};

function emptySplit(): HoursSplit {
  return { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0 };
}

export function perDiemDollarsForRow(pdDays: number, rate: number) {
  return Math.round(Math.max(0, pdDays) * Math.max(0, rate) * 100) / 100;
}

export function perDiemRateForLane(
  lane: string,
  rates: { staffPerDiemRate: number; craftPerDiemRate: number },
) {
  return isStaffPerDiemLane(lane) ? rates.staffPerDiemRate : rates.craftPerDiemRate;
}

/** Day hours vs night hours on the position. Days & Nights is two shifts. */
export function dayNightHours(
  row: CrewPackRow,
  site = "",
  client = "",
  otAfter8 = false,
): { day: HoursSplit; night: HoursSplit } {
  let day = emptySplit();
  let night = emptySplit();
  if (!row.position.trim()) return { day, night };
  for (const range of row.ranges ?? []) {
    if (range.off) continue;
    const shift = range.shift ?? row.shift ?? "Days";
    const base = {
      position: row.position,
      billedAs: row.billedAs,
      site,
      client,
      start: range.start,
      end: range.end,
      hoursPerShift: range.hoursPerShift,
      headcount: range.headcount,
      nightHeadcount: range.nightHeadcount,
      sundayHeadcount: range.sundayHeadcount,
      nightSundayHeadcount: range.nightSundayHeadcount,
      days: range.days,
      perDiemPeople: range.perDiemPeople,
      nightPerDiemPeople: range.nightPerDiemPeople,
      otAfter8: range.otAfter8 ?? otAfter8,
      phaseId: range.phaseId,
      clockOverride: row.clockOverride ?? "auto",
      skipDates: range.skipDates,
    };
    if (shift === "Days & nights") {
      day = sumSplits([
        day,
        computeRangeHours({ ...base, shift: "Days", nightHeadcount: undefined, nightPerDiemPeople: undefined }),
      ]);
      night = sumSplits([
        night,
        computeRangeHours({
          ...base,
          shift: "Nights",
          headcount: range.nightHeadcount ?? 1,
          perDiemPeople: range.nightPerDiemPeople ?? 0,
          sundayHeadcount: range.nightSundayHeadcount ?? range.sundayHeadcount,
        }),
      ]);
      continue;
    }
    if (shift === "Nights") {
      night = sumSplits([night, computeRangeHours({ ...base, shift: "Nights" })]);
    } else {
      day = sumSplits([day, computeRangeHours({ ...base, shift: "Days" })]);
    }
  }
  return { day, night };
}
