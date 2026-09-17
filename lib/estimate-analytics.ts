/**
 * Phase 1 Analytics — Yates workbook `Analytics` sheet, rippled from the live pack.
 *
 * Margin lives here only (never on the Estimate Total rail). Base-wage OH /
 * profit use COMP BW / `baseSt`, same lock as CBA % — never billed ST.
 * STC & PPE budget is hours × locked $/hr (East WR $3.60). The editable % is
 * predicted savings on that budget, default 0 from CCU1 overspend vs recovery.
 *
 * Yates Labor Ratebuilder CRAFT / STAFF % of BW is the Phase 1 model until a
 * site-specific Analytics book (Monroe) is on disk. CAT 2 / Wood River T&M
 * books do not have an Analytics sheet.
 *
 * Phase 2 (omitted): Procurement/Subcontracts stack, freight / tax markup,
 * Updated Total Profit / Procurement contribution. Live Turnip / CPPR actuals
 * and tariff % are also out — do not invent lock OH/Profit $ or a 9→5 formula.
 *
 * Empty drag-stack fields hydrate to WR_EAST_BRIDGE_SEED (Coker / CCU1 dig).
 * Owner 0 or any number wins. extraPd and OH/Profit lock $ stay empty.
 */
import { equipmentTotals, thirdPartyCost, type EquipmentSheet } from "./equipment-sheet.ts";
import { deskPackageBreakdown, type DeskPackageInput } from "./estimate-desk-total.ts";
import {
  emptyAnalyticsBridge,
  hydrateJobMoney,
  stcPpeSavingsRate,
  WR_EAST_BRIDGE_SEED,
  WR_EAST_LOCKED_STC,
  WR_EAST_LOCKED_STC_PER_HOUR,
  type AnalyticsBridgeMeta,
  type AnalyticsLockedAdders,
  type AnalyticsMode,
  type AnalyticsStcOverride,
  type MoneyCrew,
  type MoneyCrewLane,
  type MoneyHourRow,
} from "./estimate-money.ts";
import { commercialMarkupRate, estimateMarkupDollars } from "./estimate-total.ts";
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { miscMarkupAmount } from "./other-cost.ts";
import { perDiemDollarsFromCrew, shahanCrewTitle, type ShahanLookupOpts } from "./shahan-wood-river.ts";
import { lookupCompWageRow, wageLookupOpts } from "./wage-lookup.ts";

export const ANALYTICS_TAB_ID = "analytics" as const;
export const ANALYTICS_TAB_LABEL = "Analytics";

/** Former book D25:D27 share. Not a WR actual — do not apply as the desk default. */
export const ANALYTICS_TOOL_PROFIT_SHARE = 0.35;
/** Yates Analytics D28 — OH contribution is 25% of Total OH Based off Base Wages. */
export const ANALYTICS_OH_PROFIT_SHARE = 0.25;

/**
 * Yates Labor Ratebuilder CC3:CI4 — % of COMP / sheeted base wage.
 * CRAFT row 3: Small Tool 3.5%, Consumable 3.5%, PPE 2.75%, O/H 19.5%, Profit 15%.
 * STAFF row 4: Small Tool 1.5%, Consumable 1.5%, PPE 2.75%, O/H 17%, Profit 15%.
 */
export const YATES_ANALYTICS_BURDEN = {
  staff: { tool: 0.015, consumables: 0.015, ppe: 0.0275, oh: 0.17, profit: 0.15 },
  craft: { tool: 0.035, consumables: 0.035, ppe: 0.0275, oh: 0.195, profit: 0.15 },
} as const;

export type AnalyticsBurdenLane = keyof typeof YATES_ANALYTICS_BURDEN;

export type { AnalyticsBridgeMeta, AnalyticsLockedAdders, AnalyticsMode, AnalyticsStcOverride };
export { WR_EAST_BRIDGE_SEED, WR_EAST_LOCKED_STC, WR_EAST_LOCKED_STC_PER_HOUR };

export const ANALYTICS_STC_PPE_LABEL = "STC & PPE";

export const ANALYTICS_STC_LINES = [{ id: "stc-ppe" as const, overrideKey: "stcPpeSavingsPct" as const }];

export const ANALYTICS_STC_SAVINGS_HINT =
  "Predicted savings % — seeded 0 from WR actuals (CCU1 overspend vs recovery). Editable. Not % of base wage. Rodeo-style ~25% only if recovery clears cost.";

export function yatesStcPpeRate(lane: AnalyticsBurdenLane): number {
  const row = YATES_ANALYTICS_BURDEN[lane];
  return Math.round((row.tool + row.consumables + row.ppe) * 10000) / 10000;
}

/** Desk copy — predicted savings default. Do not name the source workbook. */
export function stcDefaultHint(): string {
  return ANALYTICS_STC_SAVINGS_HINT;
}

/** Phase 1 labels. Tool / Consumables / PPE collapsed to one STC & PPE overall budget. */
export const ANALYTICS_PHASE1_LINES = [
  { id: "total-price", label: "Total Price" },
  { id: "total-hours", label: "Total Hours" },
  { id: "total-oh-base-wages", label: "Total OH Based off Base Wages" },
  { id: "total-profit-base-wages", label: "Total Profit Based off Base Wages" },
  { id: "stc-ppe", label: ANALYTICS_STC_PPE_LABEL },
  { id: "oh", label: "OH" },
  { id: "labor", label: "Labor" },
  { id: "markup", label: "Markup (MISC. & General Rental)" },
  { id: "coe", label: "COE" },
  { id: "subtotal-profit", label: "Subtotal Profit" },
  { id: "margin", label: "Margin" },
  { id: "profit-per-work-hour", label: "Profit Per Work Hour" },
] as const;

export type AnalyticsLineId = (typeof ANALYTICS_PHASE1_LINES)[number]["id"];

export const ANALYTICS_ROLLUP_LINES = [{ id: "rollup-stc-ppe", label: ANALYTICS_STC_PPE_LABEL }] as const;

export type AnalyticsKind = "money" | "hours" | "percent" | "per-hour";

export type AnalyticsLine = {
  id: AnalyticsLineId;
  label: string;
  kind: AnalyticsKind;
  /** Null when the Yates line cannot be computed from pack fields yet. */
  amount: number | null;
};

export type AnalyticsRollup = {
  id: (typeof ANALYTICS_ROLLUP_LINES)[number]["id"];
  label: string;
  amount: number | null;
};

export type EstimateAnalytics = {
  lines: AnalyticsLine[];
  rollups: AnalyticsRollup[];
  /** True when any crew hour had a priced COMP / sheeted baseSt. */
  hasBaseWage: boolean;
  bridge: AnalyticsBridgeSheet;
};

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function lineKind(id: AnalyticsLineId): AnalyticsKind {
  if (id === "total-hours") return "hours";
  if (id === "margin") return "percent";
  if (id === "profit-per-work-hour") return "per-hour";
  return "money";
}

function burdenLane(lane: MoneyCrewLane): AnalyticsBurdenLane {
  return lane === "staff" ? "staff" : "craft";
}

function crewLanes(crew: MoneyCrew): Array<[MoneyCrewLane, MoneyHourRow[] | undefined]> {
  return [
    ["staff", crew.staff],
    ["generalForeman", crew.generalForeman],
    ["foreman", crew.foreman],
    ["direct", crew.direct],
    ["support", crew.support],
  ];
}

function rowOpts(row: MoneyHourRow, opts: ShahanLookupOpts = {}): ShahanLookupOpts {
  const title = shahanCrewTitle(row);
  return {
    ...opts,
    laborClass: row.laborClassOverride ?? opts.laborClass ?? defaultLaborClass(title),
  };
}

export type AnalyticsBurdenHours = {
  hours: number;
  baseWageHours: number;
  baseWageDollars: number;
  stcPpe: number;
  oh: number;
  profit: number;
};

export type AnalyticsDragLine = {
  id: string;
  label: string;
  amount: number;
  note: string;
};

export type AnalyticsBridgeSheet = {
  mode: AnalyticsMode;
  hours: number;
  bookProfit: number | null;
  bookMargin: number | null;
  afterLockedProfit: number | null;
  afterLockedMargin: number | null;
  bridgedProfit: number | null;
  bridgedMargin: number | null;
  packPd: number;
  bookStcBudget: number;
  lockedStcBudget: number;
  lockedStcPerHour: number;
  drags: AnalyticsDragLine[];
  dragTotal: number;
};

/** OH / profit stay Yates % of BW. STC & PPE budget is not sized from this table. */
export function analyticsBurdenRates(lane: MoneyCrewLane) {
  const yates = YATES_ANALYTICS_BURDEN[burdenLane(lane)];
  return {
    stcPpe: yatesStcPpeRate(burdenLane(lane)),
    oh: yates.oh,
    profit: yates.profit,
  };
}

/** Hours × COMP BW × Yates OH / profit %. Skips seats with no priced baseSt. Never billed ST. */
export function analyticsBurdenFromCrew(
  crew: MoneyCrew,
  site = "",
  client = "",
  holidays: string[] = [],
  opts: ShahanLookupOpts = {},
): AnalyticsBurdenHours {
  const lookup = wageLookupOpts(site, opts);
  const next: AnalyticsBurdenHours = {
    hours: 0,
    baseWageHours: 0,
    baseWageDollars: 0,
    stcPpe: 0,
    oh: 0,
    profit: 0,
  };
  for (const [lane, rows] of crewLanes(crew)) {
    const rates = analyticsBurdenRates(lane);
    for (const row of rows ?? []) {
      if (!row.position.trim()) continue;
      const hours = computeRowHours(row, site, client, crew.otAfter8, "", holidays).hours;
      if (hours <= 0) continue;
      next.hours += hours;
      const title = shahanCrewTitle(row);
      const wage = lookupCompWageRow(title, site, rowOpts(row, lookup).laborClass);
      const baseWage = Number(wage?.baseSt);
      if (!Number.isFinite(baseWage) || baseWage <= 0) continue;
      next.baseWageHours += hours;
      const base = hours * baseWage;
      next.baseWageDollars += base;
      next.stcPpe += base * rates.stcPpe;
      next.oh += base * rates.oh;
      next.profit += base * rates.profit;
    }
  }
  return {
    hours: next.hours,
    baseWageHours: next.baseWageHours,
    baseWageDollars: money(next.baseWageDollars),
    stcPpe: money(next.stcPpe),
    oh: money(next.oh),
    profit: money(next.profit),
  };
}

export function lockedAdderBudgets(hours: number, locked: AnalyticsLockedAdders) {
  const hrs = Math.max(0, hours);
  return {
    stc: money(hrs * locked.stcPpePerHour),
    oh: locked.ohPerHour == null ? null : money(hrs * locked.ohPerHour),
    profit: locked.profitPerHour == null ? null : money(hrs * locked.profitPerHour),
  };
}

function nbDragTotal(nb: AnalyticsBridgeMeta["nb"]) {
  return money((nb.onboarding ?? 0) + (nb.drugDisa ?? 0) + (nb.safety920 ?? 0) + (nb.siteClasses ?? 0));
}


function thirdPartyCostTotal(equipment: EquipmentSheet | undefined) {
  return (equipment?.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
}

/** MISC. + general / third-party rental only — subs stay off this Yates label (Phase 2). */
export function analyticsMarkupDollars(input: DeskPackageInput): number {
  return estimateMarkupDollars({
    thirdParty: thirdPartyCostTotal(input.equipment),
    misc: miscMarkupAmount(input.otherCost ?? { misc: [] }),
    client: input.client,
    site: input.site,
  });
}

export function analyticsCoeDollars(equipment: EquipmentSheet | undefined): number {
  return money(equipmentTotals(equipment ?? { largeTools: [], thirdParty: [] }).largeTools);
}

function packHours(input: DeskPackageInput, burden: AnalyticsBurdenHours): number {
  if (typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0) {
    return input.hours;
  }
  return burden.hours;
}

export function deriveEstimateAnalytics(input: DeskPackageInput): EstimateAnalytics {
  const jobMoney = hydrateJobMoney(input.jobMeta);
  const holidays = jobMoney.holidays;
  const bridgeMeta = jobMoney.analyticsBridge ?? emptyAnalyticsBridge();
  const burden = analyticsBurdenFromCrew(
    input.crew ?? {},
    input.site ?? "",
    input.client ?? "",
    holidays,
    wageLookupOpts(input.site ?? ""),
  );
  const savingsRate = stcPpeSavingsRate(jobMoney.analyticsStc);
  const hours = packHours(input, burden);
  const breakdown = deskPackageBreakdown({ ...input, hours });
  const hasBaseWage = burden.baseWageHours > 0;
  const markup = analyticsMarkupDollars(input);
  const coe = analyticsCoeDollars(input.equipment);
  const lockedHours = burden.baseWageHours > 0 ? burden.baseWageHours : hours;
  const locked = lockedAdderBudgets(lockedHours, bridgeMeta.locked);
  const packPd = perDiemDollarsFromCrew(
    input.crew ?? {},
    {
      staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
      craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
      perDiemMode: input.jobMeta?.perDiemMode,
    },
    input.site ?? "",
    input.client ?? "",
    holidays,
  );

  const bookOh = hasBaseWage ? burden.oh : null;
  const bookLabor = hasBaseWage ? burden.profit : null;
  const useLocked = bridgeMeta.mode === "locked";
  const shownStc = lockedHours > 0 ? locked.stc : null;
  const shownOh = useLocked && locked.oh != null ? locked.oh : bookOh;
  const shownLabor = useLocked && locked.profit != null ? locked.profit : bookLabor;
  const stcProfit = shownStc != null ? money(shownStc * savingsRate) : null;
  const ohProfit = shownOh != null ? money(shownOh * ANALYTICS_OH_PROFIT_SHARE) : null;
  const laborProfit = shownLabor;
  const contributionReady = stcProfit != null && ohProfit != null && laborProfit != null;
  const subtotal = contributionReady
    ? money(stcProfit + ohProfit + laborProfit + markup + coe)
    : null;
  const price = breakdown.total > 0 ? money(breakdown.total) : breakdown.total === 0 ? 0 : null;
  const amounts: Record<AnalyticsLineId, number | null> = {
    "total-price": price,
    "total-hours": hours > 0 ? hours : hours === 0 ? 0 : null,
    "total-oh-base-wages": shownOh,
    "total-profit-base-wages": shownLabor,
    "stc-ppe": stcProfit,
    oh: ohProfit,
    labor: laborProfit,
    markup: markup > 0 ? markup : 0,
    coe: coe > 0 ? coe : 0,
    "subtotal-profit": subtotal,
    margin: subtotal != null && breakdown.total > 0 ? subtotal / breakdown.total : null,
    "profit-per-work-hour": subtotal != null && hours > 0 ? money(subtotal / hours) : null,
  };

  const bookStcBudget = money(shownStc ?? 0);
  const stcBookShare = stcProfit ?? 0;
  const bookProfit =
    hasBaseWage && bookOh != null && bookLabor != null
      ? money(stcBookShare + money(bookOh * ANALYTICS_OH_PROFIT_SHARE) + bookLabor + markup + coe)
      : null;
  const lockedProfit = hasBaseWage
    ? money(
        stcBookShare +
          money((locked.oh ?? bookOh ?? 0) * ANALYTICS_OH_PROFIT_SHARE) +
          (locked.profit ?? bookLabor ?? 0) +
          markup +
          coe,
      )
    : null;
  const afterLockedProfit = useLocked ? lockedProfit : bookProfit;
  const erosion =
    money((bridgeMeta.erosionPerHour ?? 0) * lockedHours + ((bridgeMeta.erosionPctOfBw ?? 0) / 100) * burden.baseWageDollars);
  const stcDrag = 0;
  const nb = nbDragTotal(bridgeMeta.nb);
  const extraPd = money(bridgeMeta.extraPd ?? 0);
  const jvic = money(bridgeMeta.jvic ?? 0);
  const jvicDrag = money(jvic * commercialMarkupRate(input.client ?? "", input.site ?? ""));
  const drags: AnalyticsDragLine[] = [
    {
      id: "erosion",
      label: "Wage / fringe erosion vs fixed OH + profit",
      amount: erosion,
      note: "Fixed adders do not rise with wages.",
    },
    {
      id: "stc-embed",
      label: "STC & PPE budget vs COMP embed",
      amount: stcDrag,
      note: `Budget $${bookStcBudget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = $${bridgeMeta.locked.stcPpePerHour}/hr × ${lockedHours.toLocaleString("en-US", { maximumFractionDigits: 1 })} hrs. Predicted savings is separate.`,
    },
    {
      id: "nb",
      label: "NB (no sell)",
      amount: nb,
      note: "Onboarding, Drug/DISA, 920, site classes.",
    },
    {
      id: "pd",
      label: "PD volume",
      amount: extraPd,
      note: packPd
        ? `Pack PD $${packPd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        : "Pack PD from the live estimate.",
    },
    {
      id: "jvic",
      label: "JVIC passthrough (no markup)",
      amount: jvicDrag,
      note: "Profit $0. Drag is markup if it had sold.",
    },
  ];
  const dragTotal = money(drags.reduce((sum, row) => sum + row.amount, 0));
  const bridgedProfit = afterLockedProfit != null ? money(afterLockedProfit - dragTotal) : null;
  const marginOf = (profit: number | null) =>
    profit != null && breakdown.total > 0 ? profit / breakdown.total : null;

  return {
    hasBaseWage,
    lines: ANALYTICS_PHASE1_LINES.map((row) => ({
      id: row.id,
      label: row.label,
      kind: lineKind(row.id),
      amount: amounts[row.id],
    })),
    rollups: [{ id: "rollup-stc-ppe", label: ANALYTICS_STC_PPE_LABEL, amount: shownStc }],
    bridge: {
      mode: bridgeMeta.mode,
      hours: lockedHours,
      bookProfit,
      bookMargin: marginOf(bookProfit),
      afterLockedProfit,
      afterLockedMargin: marginOf(afterLockedProfit),
      bridgedProfit,
      bridgedMargin: marginOf(bridgedProfit),
      packPd,
      bookStcBudget,
      lockedStcBudget: locked.stc,
      lockedStcPerHour: money(bridgeMeta.locked.stcPpePerHour),
      drags,
      dragTotal,
    },
  };
}

export function analyticsLine(
  sheet: EstimateAnalytics,
  id: AnalyticsLineId,
): AnalyticsLine | undefined {
  return sheet.lines.find((line) => line.id === id);
}

export function analyticsRollup(
  sheet: EstimateAnalytics,
  id: AnalyticsRollup["id"],
): AnalyticsRollup | undefined {
  return sheet.rollups.find((line) => line.id === id);
}
