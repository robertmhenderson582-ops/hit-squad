/**
 * Mike-shaped Total Project PPR model.
 * Budget $ / hours come from the live estimate pack (deskBudgetFromPack + crew
 * calendars). Actuals come from Turnip T3 Export 15 / 16 ClientActual fields.
 * Earned hours come from Schedule / Progress KPI (01 DailyReport_TOTAL
 * Summary Phase Grand Total fields). Empty KPI falls back to Day-0
 * stand-in: Direct earned tracks expended.
 * Support earned = Direct physical % complete × Support budget hours.
 * Variance is not the star column.
 */
import { computeRowHours } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";
import { equipmentTotals, thirdPartyCost, type EquipmentSheet } from "./equipment-sheet.ts";
import type { DeskPackageCrew, DeskPackageInput } from "./estimate-desk-total.ts";
import { hydrateJobMoney } from "./estimate-money.ts";
import { otherCostTotals, type OtherCostSheet } from "./other-cost.ts";
import { perDiemDollarsFromCrew, shahanCrewCostAmount, shahanCrewTitle } from "./shahan-wood-river.ts";
import { subcontractorTotal, type SubSheet } from "./subcontractor.ts";
import { wageLookupOpts } from "./wage-lookup.ts";
import type { CostBudget, CostReportBook, TurnipPaste, TurnipRow } from "./cost-report.ts";
import {
  resolveScheduleEarned,
  SCHEDULE_KPI_ACTIVE_NOTE,
  SCHEDULE_KPI_STANDIN_NOTE,
} from "./cost-report-schedule.ts";

export const PPR_SHEET_ROLE = "(1) Total Project PPR";
export const PPR_REPORT_TITLE = "Cost, Progress & Performance Report";
export const PPR_EARNED_NOTE = `${SCHEDULE_KPI_STANDIN_NOTE} Budget from the live Hit Squad estimate pack — not Mike’s Estimate Summary links.`;

export function pprEarnedNote(fromKpi: boolean) {
  const body = fromKpi ? SCHEDULE_KPI_ACTIVE_NOTE : SCHEDULE_KPI_STANDIN_NOTE;
  return `${body} Budget from the live Hit Squad estimate pack — not Mike’s Estimate Summary links.`;
}

export const TURNIP15_TITLE = "T3 Export 15 — Client Cost Analysis";
export const TURNIP16_TITLE = "T3 Export 16 — Client Craft Analysis";

/** Canonical Turnip T3 Export 15 headers (Client Cost Analysis). Col A is the charge/code key. */
export const TURNIP15_HEADERS = [
  "ChargeCode",
  "WO_Description",
  "LaborTotal_ClientActual_Units",
  "LaborTotal_ClientActual_Dollars",
  "PD_ClientActual_Dollars",
  "Other_ClientActual_Units",
  "TotalDollars_ClientActual",
] as const;

/** Canonical Turnip T3 Export 16 headers (Client Craft Analysis). */
export const TURNIP16_HEADERS = [
  "event_dt",
  "craft",
  "employee",
  "Units",
  "ST_Units",
  "OT_Units",
  "DT_Units",
  "ChargeCode",
  "Headcount",
] as const;

export const PPR_LANES = [
  "direct",
  "foremen",
  "support",
  "staff",
  "perDiem",
  "travel",
  "weather",
  "onboarding",
  "materials",
  "coe",
  "subs",
  "rentals",
] as const;

export type PprLaneId = (typeof PPR_LANES)[number];

export type PprLineKind = "section" | "line" | "subtotal" | "total";

export type CostBudgetLane = {
  id: string;
  lane: PprLaneId | "craft";
  label: string;
  dollars: number;
  hours: number;
};

export type PprComputedLine = {
  id: string;
  kind: PprLineKind;
  label: string;
  lane?: PprLaneId | "craft";
  originalDollars: number;
  revisedDollars: number;
  forecastDollars: number;
  originalHours: number;
  revisedHours: number;
  forecastHours: number;
  expendedHoursDaily: number;
  expendedHoursToDate: number;
  expendedDollarsDaily: number;
  expendedDollarsToDate: number;
  earnedHoursDaily: number;
  earnedHoursToDate: number;
  pctDaily: number;
  pctToDate: number;
  toGoForecast: number;
  performanceToDate: number;
  hoursToGo: number;
  budgetRate: number;
  actualRate: number;
};

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function hours(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function ratio(num: number, den: number) {
  if (!den) return 0;
  return money(num / den);
}

export function craftKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Map Turnip charge / WO codes (Madison 17 language) onto live PPR buckets. */
export function pprLaneFromChargeCode(code: string): PprLaneId | "" {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/^wo[\s-]*/i, "").match(/(\d{3,4})/);
  const n = digits ? Number(digits[1]) : NaN;
  if (!Number.isFinite(n)) return "";
  if (n >= 100 && n < 200) return "direct";
  if (n >= 400 && n < 500) return "foremen";
  if (n === 505 || n === 515) return "perDiem";
  if (n >= 500 && n < 600) return "support";
  if (n === 721) return "materials";
  if (n === 725) return "rentals";
  if (n === 727) return "coe";
  if (n === 730) return "subs";
  if (n >= 702 && n < 720) return "staff";
  if (n >= 700 && n < 800) return "staff";
  return "";
}

export type LaneActual = { hours: number; dollars: number };

export function emptyLaneActuals(): Record<PprLaneId, LaneActual> {
  return {
    direct: { hours: 0, dollars: 0 },
    foremen: { hours: 0, dollars: 0 },
    support: { hours: 0, dollars: 0 },
    staff: { hours: 0, dollars: 0 },
    perDiem: { hours: 0, dollars: 0 },
    travel: { hours: 0, dollars: 0 },
    weather: { hours: 0, dollars: 0 },
    onboarding: { hours: 0, dollars: 0 },
    materials: { hours: 0, dollars: 0 },
    coe: { hours: 0, dollars: 0 },
    subs: { hours: 0, dollars: 0 },
    rentals: { hours: 0, dollars: 0 },
  };
}

function addLane(out: Record<PprLaneId, LaneActual>, lane: PprLaneId | "", patch: Partial<LaneActual>) {
  if (!lane) return;
  const cur = out[lane];
  cur.hours = hours(cur.hours + (patch.hours ?? 0));
  cur.dollars = money(cur.dollars + (patch.dollars ?? 0));
}

function rowLane(row: TurnipRow): PprLaneId | "" {
  if (row.lane && (PPR_LANES as readonly string[]).includes(row.lane)) return row.lane as PprLaneId;
  return pprLaneFromChargeCode(row.code);
}

/** Roll Export 15 ClientActual (and legacy) rows into PPR buckets. */
export function laneActualsFromPaste(paste: TurnipPaste): Record<PprLaneId, LaneActual> {
  const out = emptyLaneActuals();
  let coded = false;
  for (const row of paste.rows) {
    const lane = rowLane(row);
    if (lane) coded = true;
    const pd = Math.max(0, row.pdDollars || 0);
    if (pd) addLane(out, "perDiem", { dollars: pd });
    if (lane && lane !== "perDiem") {
      addLane(out, lane, { hours: row.hours, dollars: row.dollars });
    } else if (lane === "perDiem") {
      addLane(out, "perDiem", { hours: row.hours, dollars: row.dollars });
    }
  }
  if (!coded) {
    for (const row of paste.rows) {
      addLane(out, "direct", { hours: row.hours, dollars: row.dollars });
    }
  }
  return out;
}

export function craftHoursFromPaste(paste: TurnipPaste): Map<string, number> {
  const byCraft = new Map<string, number>();
  for (const row of paste.rows) {
    const key = craftKey(row.craft);
    if (!key || !row.hours) continue;
    byCraft.set(key, hours((byCraft.get(key) ?? 0) + row.hours));
  }
  return byCraft;
}

export function priorCostSnapshot(book: CostReportBook, statusDate: string) {
  const asOf = statusDate;
  return [...book.snapshots]
    .filter((shot) => shot.statusDate && shot.statusDate < asOf)
    .sort((a, b) => b.statusDate.localeCompare(a.statusDate) || b.savedAt - a.savedAt)[0];
}

function crewLaneHoursDollars(
  rows: DeskPackageCrew["direct"],
  site: string,
  client: string,
  holidays: string[],
  otAfter8: boolean,
) {
  let hrs = 0;
  let dollars = 0;
  const crafts: CostBudgetLane[] = [];
  const opts = wageLookupOpts(site);
  (rows ?? []).forEach((row, index) => {
    if (!row.position?.trim()) return;
    const split = computeRowHours(row, site, client, otAfter8, "", holidays);
    const title = shahanCrewTitle(row);
    const amount = shahanCrewCostAmount(title, split, {
      ...opts,
      laborClass: row.laborClassOverride ?? opts.laborClass ?? defaultLaborClass(title),
    });
    hrs += split.hours;
    dollars += amount;
    crafts.push({
      id: `craft:${title || row.position.trim()}:${index}`,
      lane: "craft",
      label: row.position.trim(),
      dollars: money(amount),
      hours: hours(split.hours),
    });
  });
  return { hours: hours(hrs), dollars: money(dollars), crafts };
}

/** Live-pack hours/$ mapped into Mike’s PPR buckets. Never Mike’s Estimate Summary book. */
export function pprLanesFromPack(input: DeskPackageInput): CostBudgetLane[] {
  const site = input.site ?? "";
  const client = input.client ?? "";
  const holidays = hydrateJobMoney(input.jobMeta).holidays;
  const otAfter8 = Boolean(input.crew?.otAfter8);
  const crew = input.crew ?? {};
  const equipment: EquipmentSheet = input.equipment ?? { largeTools: [], thirdParty: [] };
  const other: OtherCostSheet = input.otherCost ?? { perDiemRate: 0, travel: [], misc: [] };
  const rest = otherCostTotals({ ...other, perDiemRate: 0 }, 0);
  const thirdCost = (equipment.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const tools = equipmentTotals(equipment).largeTools;
  const pd = perDiemDollarsFromCrew(
    crew,
    {
      staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
      craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
    },
    site,
    client,
    holidays,
  );
  const direct = crewLaneHoursDollars(crew.direct, site, client, holidays, otAfter8);
  const foremen = crewLaneHoursDollars(crew.foreman, site, client, holidays, otAfter8);
  const support = crewLaneHoursDollars(crew.support, site, client, holidays, otAfter8);
  const staff = crewLaneHoursDollars(
    [...(crew.staff ?? []), ...(crew.generalForeman ?? [])],
    site,
    client,
    holidays,
    otAfter8,
  );
  const subs = subcontractorTotal(input.subcontractor as SubSheet | null, {
    site,
    client,
    otAfter8,
  });
  return [
    ...direct.crafts,
    { id: "direct", lane: "direct", label: "Direct Labor", dollars: direct.dollars, hours: direct.hours },
    { id: "foremen", lane: "foremen", label: "Foremen", dollars: foremen.dollars, hours: foremen.hours },
    { id: "support", lane: "support", label: "Support", dollars: support.dollars, hours: support.hours },
    { id: "staff", lane: "staff", label: "Staff", dollars: staff.dollars, hours: staff.hours },
    { id: "perDiem", lane: "perDiem", label: "Per Diem", dollars: money(pd), hours: 0 },
    { id: "travel", lane: "travel", label: "Mileage / Travel", dollars: money(rest.travel), hours: 0 },
    { id: "weather", lane: "weather", label: "Weather Delays", dollars: 0, hours: 0 },
    { id: "onboarding", lane: "onboarding", label: "Onboarding", dollars: 0, hours: 0 },
    { id: "materials", lane: "materials", label: "Materials", dollars: money(rest.misc), hours: 0 },
    { id: "coe", lane: "coe", label: "Company Owned Equipment", dollars: money(tools), hours: 0 },
    { id: "subs", lane: "subs", label: "Subcontractors", dollars: money(subs), hours: 0 },
    { id: "rentals", lane: "rentals", label: "3rd Party General Rentals", dollars: money(thirdCost), hours: 0 },
  ];
}

function laneOf(budget: CostBudget, id: PprLaneId): CostBudgetLane {
  return (
    budget.lanes?.find((lane) => lane.id === id) ?? {
      id,
      lane: id,
      label: id,
      dollars: 0,
      hours: 0,
    }
  );
}

function craftsOf(budget: CostBudget): CostBudgetLane[] {
  return (budget.lanes ?? []).filter((lane) => lane.lane === "craft" && (lane.hours > 0 || lane.dollars > 0 || lane.label.trim()));
}

function computedLine(
  id: string,
  kind: PprLineKind,
  label: string,
  budget: { dollars: number; hours: number },
  actual: LaneActual,
  prior: LaneActual,
  earnedToDate: number,
  earnedDaily: number,
  originalDollars = budget.dollars,
): PprComputedLine {
  const revised = budget.dollars;
  const forecast = budget.dollars;
  const hrs = budget.hours;
  const expH = actual.hours;
  const expD = actual.dollars;
  const dailyH = hours(Math.max(0, expH - prior.hours));
  const dailyD = money(Math.max(0, expD - prior.dollars));
  const pctToDate = hrs > 0 ? ratio(earnedToDate, hrs) : ratio(expD, forecast);
  const pctDaily = hrs > 0 ? ratio(earnedDaily, hrs) : ratio(dailyD, forecast);
  return {
    id,
    kind,
    label,
    originalDollars: money(originalDollars),
    revisedDollars: money(revised),
    forecastDollars: money(forecast),
    originalHours: hours(hrs),
    revisedHours: hours(hrs),
    forecastHours: hours(hrs),
    expendedHoursDaily: dailyH,
    expendedHoursToDate: hours(expH),
    expendedDollarsDaily: dailyD,
    expendedDollarsToDate: money(expD),
    earnedHoursDaily: hours(earnedDaily),
    earnedHoursToDate: hours(earnedToDate),
    pctDaily,
    pctToDate,
    toGoForecast: money(forecast - expD),
    performanceToDate: ratio(earnedToDate, expH),
    hoursToGo: hours(hrs - earnedToDate),
    budgetRate: ratio(forecast, hrs),
    actualRate: ratio(expD, expH),
  };
}

function sumLines(id: string, kind: PprLineKind, label: string, lines: PprComputedLine[]): PprComputedLine {
  const pick = lines.filter((line) => line.kind === "line" || line.kind === "subtotal");
  const add = (key: keyof PprComputedLine) => pick.reduce((sum, line) => sum + Number(line[key] || 0), 0);
  const forecastD = money(add("forecastDollars"));
  const forecastH = hours(add("forecastHours"));
  const expH = hours(add("expendedHoursToDate"));
  const expD = money(add("expendedDollarsToDate"));
  const earned = hours(add("earnedHoursToDate"));
  return {
    id,
    kind,
    label,
    originalDollars: money(add("originalDollars")),
    revisedDollars: money(add("revisedDollars")),
    forecastDollars: forecastD,
    originalHours: hours(add("originalHours")),
    revisedHours: hours(add("revisedHours")),
    forecastHours: forecastH,
    expendedHoursDaily: hours(add("expendedHoursDaily")),
    expendedHoursToDate: expH,
    expendedDollarsDaily: money(add("expendedDollarsDaily")),
    expendedDollarsToDate: expD,
    earnedHoursDaily: hours(add("earnedHoursDaily")),
    earnedHoursToDate: earned,
    pctDaily: forecastH > 0 ? ratio(add("earnedHoursDaily"), forecastH) : ratio(add("expendedDollarsDaily"), forecastD),
    pctToDate: forecastH > 0 ? ratio(earned, forecastH) : ratio(expD, forecastD),
    toGoForecast: money(forecastD - expD),
    performanceToDate: ratio(earned, expH),
    hoursToGo: hours(forecastH - earned),
    budgetRate: ratio(forecastD, forecastH),
    actualRate: ratio(expD, expH),
  };
}

function zeroActual(): LaneActual {
  return { hours: 0, dollars: 0 };
}

/**
 * Build the print-sheet rows. Craft lines keep live-pack titles.
 * Scheduler KPI earned (when entered) drives Direct earned / % complete.
 * Empty KPI falls back to Day-0 stand-in: Direct earned = expended.
 * Support earned = Direct physical % complete × Support budget hours.
 */
export function buildPprLines(budget: CostBudget, book: CostReportBook): PprComputedLine[] {
  const current = laneActualsFromPaste(book.export15);
  const priorShot = priorCostSnapshot(book, book.statusDate);
  const prior = priorShot ? laneActualsFromPaste(priorShot.export15) : emptyLaneActuals();
  const craftHours = craftHoursFromPaste(book.export16);
  const priorCraftHours = priorShot ? craftHoursFromPaste(priorShot.export16) : new Map<string, number>();
  const crafts = craftsOf(budget);
  const directBudget = laneOf(budget, "direct");
  const changeOrders = money(budget.changeOrders ?? 0);
  const priorKpi = resolveScheduleEarned(priorShot?.schedule, directBudget.hours, 0);
  const kpi = resolveScheduleEarned(book.schedule, directBudget.hours, priorKpi.toDate);
  const useKpi = kpi.fromKpi;

  const craftLines: PprComputedLine[] = crafts.map((craft) => {
    const key = craftKey(craft.label);
    const expH = craftHours.get(key) ?? 0;
    const priorH = priorCraftHours.get(key) ?? 0;
    const share = directBudget.hours > 0 ? craft.hours / directBudget.hours : crafts.length ? 1 / crafts.length : 0;
    const expD = money((current.direct.dollars || 0) * share);
    const priorD = money((prior.direct.dollars || 0) * share);
    const earned = useKpi ? hours(kpi.toDate * share) : expH;
    const earnedDaily = useKpi ? hours(kpi.daily * share) : hours(Math.max(0, expH - priorH));
    const line = computedLine(
      craft.id,
      "line",
      craft.label,
      { dollars: craft.dollars, hours: craft.hours },
      { hours: expH, dollars: expD },
      { hours: priorH, dollars: priorD },
      earned,
      earnedDaily,
    );
    line.lane = "craft";
    return line;
  });

  if (!craftLines.length) {
    const earned = useKpi ? kpi.toDate : current.direct.hours;
    const earnedDaily = useKpi ? kpi.daily : hours(Math.max(0, current.direct.hours - prior.direct.hours));
    craftLines.push(
      computedLine(
        "direct-line",
        "line",
        "Direct craft",
        { dollars: directBudget.dollars, hours: directBudget.hours },
        current.direct,
        prior.direct,
        earned,
        earnedDaily,
      ),
    );
  } else {
    const assignedH = craftLines.reduce((sum, line) => sum + line.expendedHoursToDate, 0);
    const leftoverH = hours(Math.max(0, current.direct.hours - assignedH));
    const assignedD = craftLines.reduce((sum, line) => sum + line.expendedDollarsToDate, 0);
    const leftoverD = money(Math.max(0, current.direct.dollars - assignedD));
    const assignedEarned = craftLines.reduce((sum, line) => sum + line.earnedHoursToDate, 0);
    const leftoverEarned = useKpi ? hours(Math.max(0, kpi.toDate - assignedEarned)) : leftoverH;
    const leftoverEarnedDaily = useKpi ? hours(Math.max(0, kpi.daily - craftLines.reduce((sum, line) => sum + line.earnedHoursDaily, 0))) : leftoverH;
    if (leftoverH > 0 || leftoverD > 0 || leftoverEarned > 0) {
      craftLines.push(
        computedLine(
          "direct-unassigned",
          "line",
          "Direct — other",
          { dollars: 0, hours: 0 },
          { hours: leftoverH, dollars: leftoverD },
          zeroActual(),
          leftoverEarned,
          leftoverEarnedDaily,
        ),
      );
    }
  }

  const standInPct = directBudget.hours > 0 ? ratio(current.direct.hours, directBudget.hours) : 0;
  const directPct = useKpi ? kpi.pct : standInPct;
  const supportPriorPct = useKpi
    ? priorKpi.fromKpi
      ? priorKpi.pct
      : 0
    : directBudget.hours > 0
      ? ratio(prior.direct.hours, directBudget.hours)
      : 0;

  function laborLine(id: PprLaneId, label: string, earnedMode: "expended" | "progress-pct"): PprComputedLine {
    const b = laneOf(budget, id);
    const exp = current[id];
    const prev = prior[id];
    let earned: number;
    let earnedDaily: number;
    if (earnedMode === "progress-pct") {
      earned = hours(directPct * b.hours);
      earnedDaily = hours(Math.max(0, earned - hours(supportPriorPct * b.hours)));
    } else if (useKpi) {
      earned = 0;
      earnedDaily = 0;
    } else {
      earned = exp.hours;
      earnedDaily = hours(Math.max(0, exp.hours - prev.hours));
    }
    const line = computedLine(id, "line", label, { dollars: b.dollars, hours: b.hours }, exp, prev, earned, earnedDaily);
    line.lane = id;
    return line;
  }

  const indirect = [
    laborLine("foremen", "Foremen", useKpi ? "progress-pct" : "expended"),
    laborLine("support", "Support", "progress-pct"),
    laborLine("staff", "Staff", useKpi ? "progress-pct" : "expended"),
    laborLine("perDiem", "Per Diem", "expended"),
    laborLine("travel", "Mileage / Travel", "expended"),
    laborLine("weather", "Weather Delays", "expended"),
    laborLine("onboarding", "Onboarding", "expended"),
  ];

  const materials = [
    laborLine("materials", "Materials", "expended"),
    laborLine("coe", "Company Owned Equipment", "expended"),
    laborLine("subs", "Subcontractors", "expended"),
    laborLine("rentals", "3rd Party General Rentals", "expended"),
  ];

  const subDirect = sumLines("sub-direct", "subtotal", "Subtotal Direct Labor", craftLines);
  const subLabor = sumLines("sub-labor", "subtotal", "Subtotal Labor / PD", [...craftLines, ...indirect]);
  const subMat = sumLines("sub-mat", "subtotal", "Subtotal Material & Subcontracts", materials);
  const total = sumLines("total", "total", "TOTAL PROJECT", [subLabor, subMat]);
  if (changeOrders) {
    total.revisedDollars = money(total.revisedDollars + changeOrders);
    total.forecastDollars = money(total.forecastDollars + changeOrders);
    total.toGoForecast = money(total.forecastDollars - total.expendedDollarsToDate);
  }

  const section = (id: string, label: string): PprComputedLine =>
    computedLine(id, "section", label, { dollars: 0, hours: 0 }, zeroActual(), zeroActual(), 0, 0);

  return [
    section("sec-direct", "DIRECT LABOR"),
    ...craftLines,
    subDirect,
    section("sec-indirect", "INDIRECT LABOR"),
    ...indirect,
    subLabor,
    section("sec-mat", "MATERIALS & SUBCONTRACTS"),
    ...materials,
    subMat,
    total,
  ];
}

export function pprTotalLine(lines: PprComputedLine[]) {
  return lines.find((line) => line.kind === "total");
}
