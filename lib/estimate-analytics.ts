/**
 * Phase 1 Analytics — Yates workbook `Analytics` sheet, rippled from the live pack.
 *
 * Labels are locked to that sheet. Do not invent columns. Margin lives here only
 * (never on the Estimate Total rail). Base-wage OH / profit / Tool / Con / PPE
 * use COMP BW / `baseSt`, same lock as CBA % — never billed ST.
 *
 * Yates Labor Ratebuilder CRAFT / STAFF % of BW is the Phase 1 model until a
 * site-specific Analytics book (Monroe) is on disk. CAT 2 / Wood River T&M
 * books do not have an Analytics sheet.
 *
 * Phase 2 (omitted): Procurement/Subcontracts stack, freight / tax markup,
 * Updated Total Profit / Procurement contribution.
 */
import { equipmentTotals, thirdPartyCost, type EquipmentSheet } from "./equipment-sheet.ts";
import { deskPackageBreakdown, type DeskPackageInput } from "./estimate-desk-total.ts";
import { hydrateJobMoney, type MoneyCrew, type MoneyCrewLane, type MoneyHourRow } from "./estimate-money.ts";
import { estimateMarkupDollars } from "./estimate-total.ts";
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { miscMarkupAmount } from "./other-cost.ts";
import { shahanCrewTitle, type ShahanLookupOpts } from "./shahan-wood-river.ts";
import { lookupCompWageRow, wageLookupOpts } from "./wage-lookup.ts";

export const ANALYTICS_TAB_ID = "analytics" as const;
export const ANALYTICS_TAB_LABEL = "Analytics";
export const ANALYTICS_NOUN = "Analytics";
export const ANALYTICS_LIVE_NOTE =
  "Profit / OH / Tool-Con-PPE from the live estimate pack. Read-only. Margin stays on this tab — not the Estimate Total rail.";
export const ANALYTICS_PHASE2_NOTE =
  "Phase 2 later: Procurement/Subcontracts (Est.), freight / sales-tax markup, Updated Total Profit.";

/** Yates Analytics D25:D27 — Tool / Consumables / PPE profit share of those budgets. */
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

/** Locked Phase 1 labels — match the Yates Analytics sheet. Do not rename. */
export const ANALYTICS_PHASE1_LINES = [
  { id: "total-price", label: "Total Price" },
  { id: "total-hours", label: "Total Hours" },
  { id: "total-oh-base-wages", label: "Total OH Based off Base Wages" },
  { id: "total-profit-base-wages", label: "Total Profit Based off Base Wages" },
  { id: "tool", label: "Tool" },
  { id: "consumables", label: "Consumables" },
  { id: "ppe", label: "PPE" },
  { id: "oh", label: "OH" },
  { id: "labor", label: "Labor" },
  { id: "markup", label: "Markup (MISC. & General Rental)" },
  { id: "coe", label: "COE" },
  { id: "subtotal-profit", label: "Subtotal Profit" },
  { id: "margin", label: "Margin" },
  { id: "profit-per-work-hour", label: "Profit Per Work Hour" },
] as const;

export type AnalyticsLineId = (typeof ANALYTICS_PHASE1_LINES)[number]["id"];

export const ANALYTICS_ROLLUP_LINES = [
  { id: "rollup-tool", label: "Tool" },
  { id: "rollup-con", label: "Con" },
  { id: "rollup-ppe", label: "PPE" },
] as const;

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
  tool: number;
  consumables: number;
  ppe: number;
  oh: number;
  profit: number;
};

/** Hours × COMP BW × Yates model %. Skips seats with no priced baseSt. Never billed ST. */
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
    tool: 0,
    consumables: 0,
    ppe: 0,
    oh: 0,
    profit: 0,
  };
  for (const [lane, rows] of crewLanes(crew)) {
    const rates = YATES_ANALYTICS_BURDEN[burdenLane(lane)];
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
      next.tool += base * rates.tool;
      next.consumables += base * rates.consumables;
      next.ppe += base * rates.ppe;
      next.oh += base * rates.oh;
      next.profit += base * rates.profit;
    }
  }
  return {
    hours: next.hours,
    baseWageHours: next.baseWageHours,
    tool: money(next.tool),
    consumables: money(next.consumables),
    ppe: money(next.ppe),
    oh: money(next.oh),
    profit: money(next.profit),
  };
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
  const holidays = hydrateJobMoney(input.jobMeta).holidays;
  const burden = analyticsBurdenFromCrew(
    input.crew ?? {},
    input.site ?? "",
    input.client ?? "",
    holidays,
    wageLookupOpts(input.site ?? ""),
  );
  const hours = packHours(input, burden);
  const breakdown = deskPackageBreakdown({ ...input, hours });
  const hasBaseWage = burden.baseWageHours > 0;
  const markup = analyticsMarkupDollars(input);
  const coe = analyticsCoeDollars(input.equipment);
  const toolProfit = hasBaseWage ? money(burden.tool * ANALYTICS_TOOL_PROFIT_SHARE) : null;
  const conProfit = hasBaseWage ? money(burden.consumables * ANALYTICS_TOOL_PROFIT_SHARE) : null;
  const ppeProfit = hasBaseWage ? money(burden.ppe * ANALYTICS_TOOL_PROFIT_SHARE) : null;
  const ohProfit = hasBaseWage ? money(burden.oh * ANALYTICS_OH_PROFIT_SHARE) : null;
  const laborProfit = hasBaseWage ? burden.profit : null;
  const contributionReady =
    toolProfit != null && conProfit != null && ppeProfit != null && ohProfit != null && laborProfit != null;
  const subtotal = contributionReady
    ? money(toolProfit + conProfit + ppeProfit + ohProfit + laborProfit + markup + coe)
    : null;
  const amounts: Record<AnalyticsLineId, number | null> = {
    "total-price": breakdown.total > 0 ? money(breakdown.total) : breakdown.total === 0 ? 0 : null,
    "total-hours": hours > 0 ? hours : hours === 0 ? 0 : null,
    "total-oh-base-wages": hasBaseWage ? burden.oh : null,
    "total-profit-base-wages": hasBaseWage ? burden.profit : null,
    tool: toolProfit,
    consumables: conProfit,
    ppe: ppeProfit,
    oh: ohProfit,
    labor: laborProfit,
    markup: markup > 0 ? markup : 0,
    coe: coe > 0 ? coe : 0,
    "subtotal-profit": subtotal,
    margin: subtotal != null && breakdown.total > 0 ? subtotal / breakdown.total : null,
    "profit-per-work-hour": subtotal != null && hours > 0 ? money(subtotal / hours) : null,
  };

  return {
    hasBaseWage,
    lines: ANALYTICS_PHASE1_LINES.map((row) => ({
      id: row.id,
      label: row.label,
      kind: lineKind(row.id),
      amount: amounts[row.id],
    })),
    rollups: [
      { id: "rollup-tool", label: "Tool", amount: hasBaseWage ? burden.tool : null },
      { id: "rollup-con", label: "Con", amount: hasBaseWage ? burden.consumables : null },
      { id: "rollup-ppe", label: "PPE", amount: hasBaseWage ? burden.ppe : null },
    ],
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
