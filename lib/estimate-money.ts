import { computeRangeHours, type HoursSplit } from "./hours-clock.ts";
import { defaultLaborClass, type LaborClass } from "./labor-class.ts";
import {
  lookupShahanLabor,
  shahanCrewCostAmount,
  shahanCrewTitle,
  type ShahanLookupOpts,
} from "./shahan-wood-river.ts";

export const LABOR_CONTINGENCY_LABEL = "Labor contingency";
export const EQUIPMENT_CONTINGENCY_LABEL = "Equipment contingency";
export const SUBS_CONTINGENCY_LABEL = "Subs contingency";
export const CBA_INCREASE_LABEL = "CBA increase";
export const MORE_FUND_LABEL = "M.O.R.E. fund";

export type JobMoney = {
  laborContingencyPct: number;
  equipmentContingencyPct: number;
  subsContingencyPct: number;
  cbaIncreaseOn: boolean;
  cbaIncreasePct: number;
  cbaIncreaseDate: string;
  /** Empty default. Never seeded. Credit or cost. */
  moreFundPerHour: number | null;
};

export type MoneyCrewLane = "staff" | "generalForeman" | "foreman" | "direct" | "support";

export type MoneyHourRow = {
  position: string;
  billedAs?: string;
  laborClassOverride?: LaborClass | null;
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

export type MoneyCrew = {
  staff?: MoneyHourRow[];
  generalForeman?: MoneyHourRow[];
  foreman?: MoneyHourRow[];
  direct?: MoneyHourRow[];
  support?: MoneyHourRow[];
  otAfter8?: boolean;
};

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function pctOf(amount: number, pct: number) {
  const rate = Number(pct);
  if (!Number.isFinite(rate) || rate === 0 || !Number.isFinite(amount) || amount === 0) return 0;
  return roundCents(amount * (rate / 100));
}

export function emptyJobMoney(): JobMoney {
  return {
    laborContingencyPct: 0,
    equipmentContingencyPct: 0,
    subsContingencyPct: 0,
    cbaIncreaseOn: false,
    cbaIncreasePct: 0,
    cbaIncreaseDate: "",
    moreFundPerHour: null,
  };
}

function signedNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonNeg(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/** Empty stays empty. Never seeds −8/hr or any leftover default. */
export function hydrateJobMoney(raw: Partial<JobMoney> | Record<string, unknown> | null | undefined): JobMoney {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = emptyJobMoney();
  const more = signedNumber(row.moreFundPerHour);
  return {
    laborContingencyPct: nonNeg(row.laborContingencyPct, defaults.laborContingencyPct),
    equipmentContingencyPct: nonNeg(row.equipmentContingencyPct, defaults.equipmentContingencyPct),
    subsContingencyPct: nonNeg(row.subsContingencyPct, defaults.subsContingencyPct),
    cbaIncreaseOn: Boolean(row.cbaIncreaseOn),
    cbaIncreasePct: nonNeg(row.cbaIncreasePct, defaults.cbaIncreasePct),
    cbaIncreaseDate: typeof row.cbaIncreaseDate === "string" ? row.cbaIncreaseDate : "",
    moreFundPerHour: more,
  };
}

export function moreFundIsEmpty(value: number | null | undefined) {
  return value == null || value === 0;
}

export function isMeritStaffTitle(title: string, laborClass?: LaborClass | null) {
  if (laborClass === "Merit") return true;
  if (laborClass === "Union") return false;
  const hay = title.toLowerCase();
  if (/\bmerit\b/.test(hay)) return true;
  return defaultLaborClass(title) === "Merit";
}

/** CBA craft = Direct, Foreman, and union GF. Merit / Staff stay on book rates. */
export function isCbaCraftLane(
  lane: MoneyCrewLane,
  row: Pick<MoneyHourRow, "position" | "billedAs" | "laborClassOverride">,
) {
  if (lane === "staff" || lane === "support") return false;
  if (lane === "foreman" || lane === "direct") return true;
  const title = shahanCrewTitle(row);
  return !isMeritStaffTitle(title, row.laborClassOverride);
}

/** MORE applies to Direct / Foreman / Support / GF if CBA. */
export function isMoreCraftLane(
  lane: MoneyCrewLane,
  row: Pick<MoneyHourRow, "position" | "billedAs" | "laborClassOverride">,
) {
  if (lane === "direct" || lane === "foreman" || lane === "support") return true;
  if (lane === "generalForeman") return isCbaCraftLane(lane, row);
  return false;
}

export function laborContingencyDollars(laborStOtDt: number, pct: number) {
  return pctOf(laborStOtDt, pct);
}

export function equipmentContingencyDollars(largeToolsPlusThirdParty: number, pct: number) {
  return pctOf(largeToolsPlusThirdParty, pct);
}

/** Affiliate subs stay in this base. 6.5% client markup stays separate. */
export function subsContingencyDollars(vendorCardsAndOneOffs: number, pct: number) {
  return pctOf(vendorCardsAndOneOffs, pct);
}

function emptySplit(): HoursSplit {
  return { st: 0, ot: 0, dt: 0, pd: 0, hours: 0, workedDays: 0 };
}

function addSplit(left: HoursSplit, right: Pick<HoursSplit, "st" | "ot" | "dt">): HoursSplit {
  return {
    st: left.st + right.st,
    ot: left.ot + right.ot,
    dt: left.dt + right.dt,
    pd: left.pd,
    hours: left.hours + right.st + right.ot + right.dt,
    workedDays: left.workedDays,
  };
}

function splitHoursOnDate(
  row: MoneyHourRow,
  effectiveDate: string,
  site: string,
  client: string,
  otAfter8 = false,
): { before: HoursSplit; after: HoursSplit } {
  const before = emptySplit();
  const after = emptySplit();
  if (!row.position.trim() || !effectiveDate) {
    return { before, after };
  }
  for (const range of row.ranges ?? []) {
    if (range.off) continue;
    const hours = computeRangeHours({
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
      shift: range.shift ?? row.shift,
      days: range.days,
      perDiemPeople: range.perDiemPeople,
      nightPerDiemPeople: range.nightPerDiemPeople,
      otAfter8: range.otAfter8 ?? otAfter8,
      phaseId: range.phaseId,
      clockOverride: row.clockOverride ?? "auto",
      skipDates: range.skipDates,
    });
    for (const day of hours.days) {
      if (day.date >= effectiveDate) {
        after.st += day.st;
        after.ot += day.ot;
        after.dt += day.dt;
      } else {
        before.st += day.st;
        before.ot += day.ot;
        before.dt += day.dt;
      }
    }
  }
  before.hours = before.st + before.ot + before.dt;
  after.hours = after.st + after.ot + after.dt;
  return { before, after };
}

function rowOpts(row: MoneyHourRow, opts: ShahanLookupOpts = {}): ShahanLookupOpts {
  const title = shahanCrewTitle(row);
  return {
    ...opts,
    laborClass: row.laborClassOverride ?? opts.laborClass ?? defaultLaborClass(title),
  };
}

export function cbaIncreaseDollars(
  crew: MoneyCrew,
  money: Pick<JobMoney, "cbaIncreaseOn" | "cbaIncreasePct" | "cbaIncreaseDate">,
  site = "",
  client = "",
  opts: ShahanLookupOpts = {},
): number {
  if (!money.cbaIncreaseOn || money.cbaIncreasePct === 0 || !money.cbaIncreaseDate) return 0;
  const lanes: Array<[MoneyCrewLane, MoneyHourRow[] | undefined]> = [
    ["staff", crew.staff],
    ["generalForeman", crew.generalForeman],
    ["foreman", crew.foreman],
    ["direct", crew.direct],
    ["support", crew.support],
  ];
  let lift = 0;
  for (const [lane, rows] of lanes) {
    for (const row of rows ?? []) {
      if (!isCbaCraftLane(lane, row)) continue;
      const { after } = splitHoursOnDate(row, money.cbaIncreaseDate, site, client, crew.otAfter8);
      if (after.hours <= 0) continue;
      const book = shahanCrewCostAmount(shahanCrewTitle(row), after, rowOpts(row, opts));
      lift += book * (money.cbaIncreasePct / 100);
    }
  }
  return roundCents(lift);
}

export function moreFundDollars(
  crew: MoneyCrew,
  moreFundPerHour: number | null | undefined,
  site = "",
  client = "",
): number {
  if (moreFundIsEmpty(moreFundPerHour) || moreFundPerHour == null) return 0;
  return roundCents(moreFundHours(crew, site, client) * moreFundPerHour);
}

export function moreFundHours(
  crew: MoneyCrew,
  site = "",
  client = "",
): number {
  const lanes: Array<[MoneyCrewLane, MoneyHourRow[] | undefined]> = [
    ["generalForeman", crew.generalForeman],
    ["foreman", crew.foreman],
    ["direct", crew.direct],
    ["support", crew.support],
  ];
  let hours = 0;
  for (const [lane, rows] of lanes) {
    for (const row of rows ?? []) {
      if (!isMoreCraftLane(lane, row)) continue;
      for (const range of row.ranges ?? []) {
        if (range.off) continue;
        hours += computeRangeHours({
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
          shift: range.shift ?? row.shift,
          days: range.days,
          perDiemPeople: range.perDiemPeople,
          nightPerDiemPeople: range.nightPerDiemPeople,
          otAfter8: range.otAfter8 ?? crew.otAfter8,
          phaseId: range.phaseId,
          clockOverride: row.clockOverride ?? "auto",
          skipDates: range.skipDates,
        }).hours;
      }
    }
  }
  return hours;
}

export function moneyAdderLines(input: {
  labor?: number;
  equipment?: number;
  subcontractor?: number;
  money?: Partial<JobMoney>;
  cbaIncrease?: number;
  moreFund?: number;
}) {
  const money = hydrateJobMoney(input.money);
  const labor = Number(input.labor) || 0;
  const equipment = Number(input.equipment) || 0;
  const subs = Number(input.subcontractor) || 0;
  const cba = Number(input.cbaIncrease) || 0;
  const more = Number(input.moreFund) || 0;
  const laborBase = labor + (cba > 0 ? cba : 0);
  return {
    laborContingency: laborContingencyDollars(laborBase, money.laborContingencyPct),
    equipmentContingency: equipmentContingencyDollars(equipment, money.equipmentContingencyPct),
    subsContingency: subsContingencyDollars(subs, money.subsContingencyPct),
    cbaIncrease: money.cbaIncreaseOn ? cba : 0,
    moreFund: moreFundIsEmpty(money.moreFundPerHour) ? 0 : more,
  };
}
