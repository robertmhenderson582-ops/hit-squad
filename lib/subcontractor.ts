import {
  blankCraftRow,
  rangesFromPhases,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
} from "./craft-labor.ts";
import { billedPeriodCount } from "./equipment-sheet.ts";
import { computeRowHours, type ClockOverride } from "./hours-clock.ts";
import type { JobUnit, PhaseRow } from "./phase-schedule.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const SUB_STORE_PREFIX = "hs_sub_v1:";
export const SUB_BOOK_KEY = "hs_sub_book_v1";

export const SUB_UNITS = ["LS", "hour", "day", "each"] as const;
export type SubUnit = (typeof SUB_UNITS)[number];

/** New one-off and book pickers. Hour stays on the type so old rows still load. */
export const SUB_ONE_OFF_UNITS: SubUnit[] = ["LS", "day", "each"];

export const SUB_UNIT_LABEL: Record<SubUnit, string> = {
  LS: "LS",
  hour: "Hour",
  day: "Day",
  each: "Each",
};

export function oneOffUnitsFor(current?: SubUnit): SubUnit[] {
  if (current === "hour") return ["LS", "hour", "day", "each"];
  return [...SUB_ONE_OFF_UNITS];
}

export const SUB_CARD_KINDS = ["labor", "equipment", "both"] as const;
export type SubCardKind = (typeof SUB_CARD_KINDS)[number];

export const SUB_EQUIP_PERIODS = ["daily", "weekly", "monthly", "each"] as const;
export type SubEquipPeriod = (typeof SUB_EQUIP_PERIODS)[number];

export const SUB_EQUIP_PERIOD_LABEL: Record<SubEquipPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  each: "Each",
};

export type SubRate = {
  id: string;
  vendor: string;
  scope: string;
  unit: SubUnit;
  rate: number;
};

export const AFFILIATE_LABEL = "Affiliate — no markup";

export type SubLine = {
  id: string;
  vendor: string;
  scope: string;
  qty: number;
  unit: SubUnit;
  rate: number;
  bookId?: string;
  affiliate?: boolean;
};

export type SubLaborPosition = {
  id: string;
  position: string;
  stRate: number;
  otRate: number;
  dtRate: number;
  shift: CraftShift;
  clockOverride: ClockOverride;
  ranges: CalendarRange[];
};

export type SubEquipLine = {
  id: string;
  description: string;
  period: SubEquipPeriod;
  rate: number;
  qty: number;
  freight: number;
  start?: string;
  end?: string;
};

export type SubCard = {
  id: string;
  vendor: string;
  kind: SubCardKind;
  labor: SubLaborPosition[];
  equipment: SubEquipLine[];
  affiliate?: boolean;
};

export type SubSheet = {
  lines: SubLine[];
  cards: SubCard[];
};

export type SubTotalContext = {
  site?: string;
  client?: string;
  otAfter8?: boolean;
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function storeOf(store?: Store | null): Store | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function isSubUnit(value: unknown): value is SubUnit {
  return SUB_UNITS.includes(value as SubUnit);
}

export function emptySubSheet(): SubSheet {
  return { lines: [], cards: [] };
}

export function isSubCardKind(value: unknown): value is SubCardKind {
  return SUB_CARD_KINDS.includes(value as SubCardKind);
}

export function isSubEquipPeriod(value: unknown): value is SubEquipPeriod {
  return SUB_EQUIP_PERIODS.includes(value as SubEquipPeriod);
}

export function normalizeSubCardKind(value: unknown): SubCardKind {
  return isSubCardKind(value) ? value : "both";
}

export function normalizeSubEquipPeriod(value: unknown): SubEquipPeriod {
  return isSubEquipPeriod(value) ? value : "daily";
}

export function emptySubBook(): SubRate[] {
  return [];
}

export function looksLikeJvic(name: string) {
  const raw = (name || "").trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes("jvic.com")) return true;
  if (/(?:^|[^a-z0-9])jvic(?:$|[^a-z0-9])/.test(raw)) return true;
  return /(?:^|[^a-z0-9])j[\.\s]*v[\.\s]*i[\.\s]*c(?:$|[^a-z0-9])/.test(raw);
}

/** Auto-check when the name becomes JVIC. Leaving JVIC clears it. A manual tick on any other vendor stays. */
export function affiliateAfterVendorChange(
  previousVendor: string,
  nextVendor: string,
  currentAffiliate = false,
) {
  const was = looksLikeJvic(previousVendor);
  const now = looksLikeJvic(nextVendor);
  if (now && !was) return true;
  if (was && !now) return false;
  return Boolean(currentAffiliate);
}

export function applyVendorName<T extends { vendor: string; affiliate?: boolean }>(row: T, vendor: string): T {
  return { ...row, vendor, affiliate: affiliateAfterVendorChange(row.vendor, vendor, row.affiliate) };
}

export function blankSubLine(): SubLine {
  return { id: uid("sb"), vendor: "", scope: "", qty: 1, unit: "LS", rate: 0, affiliate: false };
}

export function blankSubRate(): SubRate {
  return { id: uid("sr"), vendor: "", scope: "", unit: "LS", rate: 0 };
}

export function blankSubLaborPosition(
  phases: PhaseRow[] = [],
  units: JobUnit[] = [],
  multiUnits = false,
): SubLaborPosition {
  const seeded = blankCraftRow();
  const ranges = phases.length ? rangesFromPhases(phases, [], units, multiUnits) : seeded.ranges;
  return {
    id: uid("sl"),
    position: "",
    stRate: 0,
    otRate: 0,
    dtRate: 0,
    shift: "Days",
    clockOverride: "auto",
    ranges,
  };
}

export function blankSubEquipLine(): SubEquipLine {
  return { id: uid("se"), description: "", period: "daily", rate: 0, qty: 1, freight: 0, start: "", end: "" };
}

export function blankSubCard(): SubCard {
  return { id: uid("sc"), vendor: "", kind: "both", labor: [], equipment: [], affiliate: false };
}

export function normalizeSubUnit(value: unknown): SubUnit {
  return isSubUnit(value) ? value : "LS";
}

export function lineQty(line: Pick<SubLine, "qty" | "unit">) {
  const qty = Number(line.qty);
  if (line.unit === "LS" && !(qty > 0)) return 1;
  return Math.max(0, Number.isFinite(qty) ? qty : 0);
}

export function lineAmount(line: Pick<SubLine, "qty" | "unit" | "rate">) {
  return lineQty(line) * Math.max(0, Number(line.rate) || 0);
}

export function applyTypedAmount(line: SubLine, amount: number): SubLine {
  const dollars = Math.max(0, Number(amount) || 0);
  const qty = lineQty({ ...line, qty: line.qty > 0 ? line.qty : 1 });
  return { ...line, qty, rate: qty > 0 ? dollars / qty : dollars };
}

export function applyBookRate(line: SubLine, rate: SubRate): SubLine {
  return {
    ...line,
    vendor: rate.vendor,
    scope: rate.scope,
    unit: rate.unit,
    rate: rate.rate,
    bookId: rate.id,
    qty: rate.unit === "LS" && !(line.qty > 0) ? 1 : line.qty,
    affiliate: affiliateAfterVendorChange(line.vendor, rate.vendor, line.affiliate),
  };
}

export function bookLabel(rate: SubRate) {
  const name = rate.vendor.trim() || "Sub";
  const scope = rate.scope.trim();
  return scope ? `${name} — ${scope}` : name;
}

export function laborHoursCost(
  hours: { st?: number; ot?: number; dt?: number },
  rates: { stRate?: number; otRate?: number; dtRate?: number },
) {
  const st = Math.max(0, Number(hours.st) || 0) * Math.max(0, Number(rates.stRate) || 0);
  const ot = Math.max(0, Number(hours.ot) || 0) * Math.max(0, Number(rates.otRate) || 0);
  const dt = Math.max(0, Number(hours.dt) || 0) * Math.max(0, Number(rates.dtRate) || 0);
  return st + ot + dt;
}

export function subLaborAsCraftRow(row: SubLaborPosition): CraftRow {
  return {
    id: row.id,
    position: row.position,
    shift: row.shift,
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    clockOverride: row.clockOverride,
    laborClassOverride: null,
    ranges: row.ranges,
  };
}

export function subLaborHours(
  row: SubLaborPosition,
  site = "",
  client = "",
  otAfter8 = false,
) {
  return computeRowHours(subLaborAsCraftRow(row), site, client, otAfter8);
}

export function subLaborCost(
  row: SubLaborPosition,
  site = "",
  client = "",
  otAfter8 = false,
) {
  return laborHoursCost(subLaborHours(row, site, client, otAfter8), row);
}

export function subEquipSpan(line: Pick<SubEquipLine, "period" | "start" | "end">) {
  const start = typeof line.start === "string" ? line.start.trim() : "";
  const end = typeof line.end === "string" ? line.end.trim() : "";
  if (!start || !end || line.period === "each") return 1;
  return billedPeriodCount(start, end, line.period);
}

export function subEquipAmount(line: Pick<SubEquipLine, "rate" | "qty" | "freight" | "period" | "start" | "end">) {
  const rate = Math.max(0, Number(line.rate) || 0);
  const qty = Math.max(0, Number(line.qty) || 0);
  const freight = Math.max(0, Number(line.freight) || 0);
  return rate * qty * subEquipSpan(line) + freight;
}

export function cardShowsLabor(kind: SubCardKind) {
  return kind === "labor" || kind === "both";
}

export function cardShowsEquipment(kind: SubCardKind) {
  return kind === "equipment" || kind === "both";
}

export function subCardTotal(card: SubCard, ctx: SubTotalContext = {}) {
  const site = ctx.site ?? "";
  const client = ctx.client ?? "";
  const otAfter8 = Boolean(ctx.otAfter8);
  const labor = cardShowsLabor(card.kind)
    ? card.labor.reduce((sum, row) => sum + subLaborCost(row, site, client, otAfter8), 0)
    : 0;
  const equipment = cardShowsEquipment(card.kind)
    ? card.equipment.reduce((sum, line) => sum + subEquipAmount(line), 0)
    : 0;
  return labor + equipment;
}

function sumSheetDollars(
  sheet: SubSheet | null | undefined,
  ctx: SubTotalContext,
  include: (affiliate: boolean) => boolean,
) {
  if (!sheet) return 0;
  const lines = Array.isArray(sheet.lines)
    ? sheet.lines.reduce((sum, line) => (include(Boolean(line.affiliate)) ? sum + lineAmount(line) : sum), 0)
    : 0;
  const cards = Array.isArray(sheet.cards)
    ? sheet.cards.reduce((sum, card) => (include(Boolean(card.affiliate)) ? sum + subCardTotal(card, ctx) : sum), 0)
    : 0;
  return lines + cards;
}

export function subcontractorTotal(sheet: SubSheet | null | undefined, ctx: SubTotalContext = {}) {
  return sumSheetDollars(sheet, ctx, () => true);
}

/** Affiliate cards and one-offs stay in Subcontractor cost. They stay out of the 6.5% markup base. */
export function subcontractorMarkupBase(sheet: SubSheet | null | undefined, ctx: SubTotalContext = {}) {
  return sumSheetDollars(sheet, ctx, (affiliate) => !affiliate);
}

export function normalizeSubLine(raw: Partial<SubLine> | null | undefined): SubLine {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sb"),
    vendor: typeof raw?.vendor === "string" ? raw.vendor : "",
    scope: typeof raw?.scope === "string" ? raw.scope : "",
    qty: Number(raw?.qty) || 0,
    unit: normalizeSubUnit(raw?.unit),
    rate: Math.max(0, Number(raw?.rate) || 0),
    bookId: typeof raw?.bookId === "string" && raw.bookId ? raw.bookId : undefined,
    affiliate: Boolean(raw?.affiliate),
  };
}

export function normalizeCalendarRange(raw: Partial<CalendarRange> | null | undefined): CalendarRange {
  const days = Array.isArray(raw?.days) ? raw.days.map(Boolean) : [false, true, true, true, true, true, true];
  while (days.length < 7) days.push(false);
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("rg"),
    start: typeof raw?.start === "string" ? raw.start : "",
    end: typeof raw?.end === "string" ? raw.end : "",
    headcount: Math.max(1, Number(raw?.headcount) || 1),
    nightHeadcount: Math.max(1, Number(raw?.nightHeadcount) || 1),
    hoursPerShift: Math.max(0, Number(raw?.hoursPerShift) || 0),
    perDiemPeople: Math.max(0, Number(raw?.perDiemPeople) || 0),
    nightPerDiemPeople: Math.max(0, Number(raw?.nightPerDiemPeople) || 0),
    days: days.slice(0, 7),
    otAfter8: raw?.otAfter8,
    phaseId: typeof raw?.phaseId === "string" && raw.phaseId ? raw.phaseId : undefined,
    shift: raw?.shift === "Nights" || raw?.shift === "Days & nights" ? raw.shift : raw?.shift === "Days" ? "Days" : undefined,
    skipDates: Array.isArray(raw?.skipDates) ? raw.skipDates.filter((item): item is string => typeof item === "string") : [],
    unitId: typeof raw?.unitId === "string" && raw.unitId ? raw.unitId : undefined,
  };
}

export function normalizeSubLaborPosition(raw: Partial<SubLaborPosition> | null | undefined): SubLaborPosition {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sl"),
    position: typeof raw?.position === "string" ? raw.position : "",
    stRate: Math.max(0, Number(raw?.stRate) || 0),
    otRate: Math.max(0, Number(raw?.otRate) || 0),
    dtRate: Math.max(0, Number(raw?.dtRate) || 0),
    shift: raw?.shift === "Nights" || raw?.shift === "Days & nights" ? raw.shift : "Days",
    clockOverride: raw?.clockOverride === "comp" || raw?.clockOverride === "staff" ? raw.clockOverride : "auto",
    ranges: Array.isArray(raw?.ranges) ? raw.ranges.map((range) => normalizeCalendarRange(range)) : [],
  };
}

export function normalizeSubEquipLine(raw: Partial<SubEquipLine> | null | undefined): SubEquipLine {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("se"),
    description: typeof raw?.description === "string" ? raw.description : "",
    period: normalizeSubEquipPeriod(raw?.period),
    rate: Math.max(0, Number(raw?.rate) || 0),
    qty: Math.max(0, Number(raw?.qty) || 0),
    freight: Math.max(0, Number(raw?.freight) || 0),
    start: typeof raw?.start === "string" ? raw.start : "",
    end: typeof raw?.end === "string" ? raw.end : "",
  };
}

export function normalizeSubCard(raw: Partial<SubCard> | null | undefined): SubCard {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sc"),
    vendor: typeof raw?.vendor === "string" ? raw.vendor : "",
    kind: normalizeSubCardKind(raw?.kind),
    labor: Array.isArray(raw?.labor) ? raw.labor.map((row) => normalizeSubLaborPosition(row)) : [],
    equipment: Array.isArray(raw?.equipment) ? raw.equipment.map((line) => normalizeSubEquipLine(line)) : [],
    affiliate: Boolean(raw?.affiliate),
  };
}

export function normalizeSubSheet(raw: Partial<SubSheet> | null | undefined): SubSheet {
  return {
    lines: Array.isArray(raw?.lines) ? raw.lines.map((line) => normalizeSubLine(line)) : [],
    cards: Array.isArray(raw?.cards) ? raw.cards.map((card) => normalizeSubCard(card)) : [],
  };
}

export function syncSubLaborPositions(
  rows: SubLaborPosition[],
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SubLaborPosition[] {
  return rows.map((row) => ({
    ...row,
    ranges: rangesFromPhases(phases, row.ranges, units, multiUnits),
  }));
}

export function syncSubSheet(
  sheet: SubSheet,
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): SubSheet {
  return {
    ...sheet,
    cards: sheet.cards.map((card) => ({
      ...card,
      labor: syncSubLaborPositions(card.labor, phases, units, multiUnits),
    })),
  };
}

export function normalizeSubRate(raw: Partial<SubRate> | null | undefined): SubRate {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sr"),
    vendor: typeof raw?.vendor === "string" ? raw.vendor : "",
    scope: typeof raw?.scope === "string" ? raw.scope : "",
    unit: normalizeSubUnit(raw?.unit),
    rate: Math.max(0, Number(raw?.rate) || 0),
  };
}

export function normalizeSubBook(raw: unknown): SubRate[] {
  if (!Array.isArray(raw)) return emptySubBook();
  return raw.map((row) => normalizeSubRate(row as Partial<SubRate>));
}

export function readSubSheet(key: string, store?: Store | null): SubSheet {
  const target = storeOf(store);
  if (!target || !key) return emptySubSheet();
  try {
    const raw = target.getItem(`${SUB_STORE_PREFIX}${key}`);
    if (!raw) return emptySubSheet();
    return normalizeSubSheet(JSON.parse(raw) as Partial<SubSheet>);
  } catch {
    return emptySubSheet();
  }
}

export function writeSubSheet(key: string, sheet: Partial<SubSheet> | SubSheet, store?: Store | null) {
  const target = storeOf(store);
  if (!target || !key) return;
  try {
    target.setItem(`${SUB_STORE_PREFIX}${key}`, JSON.stringify(normalizeSubSheet(sheet)));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

export function readSubBook(store?: Store | null): SubRate[] {
  const target = storeOf(store);
  if (!target) return emptySubBook();
  try {
    const raw = target.getItem(SUB_BOOK_KEY);
    if (!raw) return emptySubBook();
    return normalizeSubBook(JSON.parse(raw));
  } catch {
    return emptySubBook();
  }
}

export function writeSubBook(book: SubRate[], store?: Store | null) {
  const target = storeOf(store);
  if (!target) return;
  try {
    target.setItem(SUB_BOOK_KEY, JSON.stringify(normalizeSubBook(book)));
  } catch {
    // keep the previous copy
  }
}
