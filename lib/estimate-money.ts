import { computeRangeHours, hydrateHolidays, type HoursSplit } from "./hours-clock.ts";
import { defaultLaborClass, type LaborClass } from "./labor-class.ts";
import { shahanCrewTitle, type ShahanLookupOpts } from "./shahan-wood-river.ts";
import { lookupCompWageRow } from "./wage-lookup.ts";

export const LABOR_CONTINGENCY_LABEL = "Labor contingency";
export const EQUIPMENT_CONTINGENCY_LABEL = "Equipment contingency";
export const SUBS_CONTINGENCY_LABEL = "Subs contingency";
export const CBA_INCREASE_LABEL = "CBA increase";
export const MORE_FUND_LABEL = "M.O.R.E. fund";

/** Analytics STC & PPE % override (percent points). Null = combined craft/staff book. */
export type AnalyticsStcOverride = {
  stcPpePct: number | null;
};

export type AnalyticsMode = "pct" | "locked";

/** East WR Merit misc (Bolt / Amend 11) — sourced split, desk uses the sum only. */
export const WR_EAST_LOCKED_STC = {
  toolPerHour: 0.5,
  consumablesPerHour: 1.25,
  ppePerHour: 1.85,
} as const;

export const WR_EAST_LOCKED_STC_PER_HOUR =
  WR_EAST_LOCKED_STC.toolPerHour + WR_EAST_LOCKED_STC.consumablesPerHour + WR_EAST_LOCKED_STC.ppePerHour;

/**
 * Wood River dig seeds for empty bridge fields (Coker 108441 / cat-vs-coker).
 * CMRAVE fringe-only erosion $/hr; Coker WO 502 onboarding; Coker T3 501 Drug/DISA
 * (billable coding in source); 920 NB safety/small tools; CCU1 Teksolv analog for
 * site classes; Coker JV Tensioning actual. extraPd stays empty. Do not invent
 * OH/Profit lock $ or a 9→5 formula.
 */
export const WR_EAST_BRIDGE_SEED = {
  erosionPerHour: 0.05,
  nb: {
    onboarding: 126383.43,
    drugDisa: 66478.51,
    safety920: 48176.58,
    siteClasses: 16718,
  },
  extraPd: null as number | null,
  jvic: 944335.07,
} as const;

export const ANALYTICS_BRIDGE_SEED_NOTE =
  "Blank fields use Wood River dig seeds from recent actuals (Coker / CCU1). Editable. Not a lock.";

export type AnalyticsLockedAdders = {
  stcPpePerHour: number;
  ohPerHour: number | null;
  profitPerHour: number | null;
};

export type AnalyticsNbDrag = {
  onboarding: number | null;
  drugDisa: number | null;
  safety920: number | null;
  siteClasses: number | null;
};

/** Live-pack COMP / MSA bridge. Mode, locked $/hr, and estimate-side drag assumptions. */
export type AnalyticsBridgeMeta = {
  mode: AnalyticsMode;
  locked: AnalyticsLockedAdders;
  erosionPerHour: number | null;
  erosionPctOfBw: number | null;
  nb: AnalyticsNbDrag;
  extraPd: number | null;
  jvic: number | null;
};

export type JobMoney = {
  laborContingencyPct: number;
  equipmentContingencyPct: number;
  subsContingencyPct: number;
  cbaIncreaseOn: boolean;
  cbaIncreasePct: number;
  cbaIncreaseDate: string;
  /** Empty default. Never seeded. Credit or cost. */
  moreFundPerHour: number | null;
  /** Plant / job holidays (YYYY-MM-DD). No billable hours those days. */
  holidays: string[];
  /** Live-pack Analytics STC & PPE % override. Null = combined craft/staff book. */
  analyticsStc: AnalyticsStcOverride;
  analyticsBridge: AnalyticsBridgeMeta;
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

export function emptyAnalyticsStc(): AnalyticsStcOverride {
  return { stcPpePct: null };
}

export function emptyAnalyticsNb(): AnalyticsNbDrag {
  return {
    onboarding: WR_EAST_BRIDGE_SEED.nb.onboarding,
    drugDisa: WR_EAST_BRIDGE_SEED.nb.drugDisa,
    safety920: WR_EAST_BRIDGE_SEED.nb.safety920,
    siteClasses: WR_EAST_BRIDGE_SEED.nb.siteClasses,
  };
}

export function emptyAnalyticsLocked(): AnalyticsLockedAdders {
  return {
    stcPpePerHour: WR_EAST_LOCKED_STC_PER_HOUR,
    ohPerHour: null,
    profitPerHour: null,
  };
}

export function emptyAnalyticsBridge(): AnalyticsBridgeMeta {
  return {
    mode: "pct",
    locked: emptyAnalyticsLocked(),
    erosionPerHour: WR_EAST_BRIDGE_SEED.erosionPerHour,
    erosionPctOfBw: null,
    nb: emptyAnalyticsNb(),
    extraPd: WR_EAST_BRIDGE_SEED.extraPd,
    jvic: WR_EAST_BRIDGE_SEED.jvic,
  };
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
    holidays: [],
    analyticsStc: emptyAnalyticsStc(),
    analyticsBridge: emptyAnalyticsBridge(),
  };
}

function signedNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Percent-point override. Empty / invalid → null (book default). 0 is a real override. */
export function hydrateAnalyticsStcPct(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

function sumPresentPcts(...values: unknown[]): number | null {
  let total = 0;
  let present = false;
  for (const value of values) {
    const parsed = hydrateAnalyticsStcPct(value);
    if (parsed == null) continue;
    present = true;
    total += parsed;
  }
  return present ? total : null;
}

/** One STC & PPE %. Migrates old tool + consumables + ppe overrides by summing present values. */
export function hydrateAnalyticsStc(raw: unknown): AnalyticsStcOverride {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if ("stcPpePct" in row) return { stcPpePct: hydrateAnalyticsStcPct(row.stcPpePct) };
  return { stcPpePct: sumPresentPcts(row.toolPct, row.consumablesPct, row.ppePct) };
}

function lockedStcRate(value: unknown, fallback: number) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export function hydrateAnalyticsLocked(raw: unknown): AnalyticsLockedAdders {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaults = emptyAnalyticsLocked();
  const hasCombined = row.stcPpePerHour != null && row.stcPpePerHour !== "";
  const hasSplit =
    (row.toolPerHour != null && row.toolPerHour !== "") ||
    (row.consumablesPerHour != null && row.consumablesPerHour !== "") ||
    (row.ppePerHour != null && row.ppePerHour !== "");
  const migratedSplit = hasSplit
    ? lockedStcRate(row.toolPerHour, WR_EAST_LOCKED_STC.toolPerHour) +
      lockedStcRate(row.consumablesPerHour, WR_EAST_LOCKED_STC.consumablesPerHour) +
      lockedStcRate(row.ppePerHour, WR_EAST_LOCKED_STC.ppePerHour)
    : defaults.stcPpePerHour;
  return {
    stcPpePerHour: hasCombined ? lockedStcRate(row.stcPpePerHour, defaults.stcPpePerHour) : migratedSplit,
    ohPerHour: hydrateAnalyticsStcPct(row.ohPerHour),
    profitPerHour: hydrateAnalyticsStcPct(row.profitPerHour),
  };
}

export function hydrateAnalyticsNb(raw: unknown): AnalyticsNbDrag {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    onboarding: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.onboarding), WR_EAST_BRIDGE_SEED.nb.onboarding),
    drugDisa: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.drugDisa), WR_EAST_BRIDGE_SEED.nb.drugDisa),
    safety920: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.safety920), WR_EAST_BRIDGE_SEED.nb.safety920),
    siteClasses: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.siteClasses), WR_EAST_BRIDGE_SEED.nb.siteClasses),
  };
}

function coalesceBridgeSeed(value: number | null, seed: number | null): number | null {
  return value != null ? value : seed;
}

export function hydrateAnalyticsBridge(raw: unknown): AnalyticsBridgeMeta {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mode: row.mode === "locked" ? "locked" : "pct",
    locked: hydrateAnalyticsLocked(row.locked),
    erosionPerHour: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.erosionPerHour), WR_EAST_BRIDGE_SEED.erosionPerHour),
    erosionPctOfBw: hydrateAnalyticsStcPct(row.erosionPctOfBw),
    nb: hydrateAnalyticsNb(row.nb),
    extraPd: hydrateAnalyticsStcPct(row.extraPd),
    jvic: coalesceBridgeSeed(hydrateAnalyticsStcPct(row.jvic), WR_EAST_BRIDGE_SEED.jvic),
  };
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
    holidays: hydrateHolidays(row.holidays),
    analyticsStc: hydrateAnalyticsStc(row.analyticsStc),
    analyticsBridge: hydrateAnalyticsBridge(row.analyticsBridge),
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

/** Labor ST/OT/DT $ only. CBA is its own adder — do not fold it into this base. */
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

function splitHoursOnDate(
  row: MoneyHourRow,
  effectiveDate: string,
  site: string,
  client: string,
  otAfter8 = false,
  holidays: string[] = [],
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
      holidays,
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

/** CBA % of COMP / Shahan baseSt × hours on/after the date. Never billed ST/OT/DT. */
export function cbaIncreaseDollars(
  crew: MoneyCrew,
  money: Pick<JobMoney, "cbaIncreaseOn" | "cbaIncreasePct" | "cbaIncreaseDate" | "holidays">,
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
      const { after } = splitHoursOnDate(
        row,
        money.cbaIncreaseDate,
        site,
        client,
        crew.otAfter8,
        money.holidays,
      );
      if (after.hours <= 0) continue;
      const title = shahanCrewTitle(row);
      const wage = lookupCompWageRow(title, site, rowOpts(row, opts).laborClass);
      const baseWage = Number(wage?.baseSt);
      if (!Number.isFinite(baseWage) || baseWage <= 0) continue;
      lift += (after.st + after.ot + after.dt) * baseWage * (money.cbaIncreasePct / 100);
    }
  }
  return roundCents(lift);
}

export function moreFundDollars(
  crew: MoneyCrew,
  moreFundPerHour: number | null | undefined,
  site = "",
  client = "",
  holidays: string[] = [],
): number {
  if (moreFundIsEmpty(moreFundPerHour) || moreFundPerHour == null) return 0;
  return roundCents(moreFundHours(crew, site, client, holidays) * moreFundPerHour);
}

export function moreFundHours(
  crew: MoneyCrew,
  site = "",
  client = "",
  holidays: string[] = [],
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
          holidays,
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
  return {
    laborContingency: laborContingencyDollars(labor, money.laborContingencyPct),
    equipmentContingency: equipmentContingencyDollars(equipment, money.equipmentContingencyPct),
    subsContingency: subsContingencyDollars(subs, money.subsContingencyPct),
    cbaIncrease: money.cbaIncreaseOn ? cba : 0,
    moreFund: moreFundIsEmpty(money.moreFundPerHour) ? 0 : more,
  };
}
