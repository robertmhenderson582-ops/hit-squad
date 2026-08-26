import type { CalendarRange, CraftRow, CraftShift, SupportLine } from "./craft-labor.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export const OTHER_COST_STORE_PREFIX = "hs_other_v1:";

export const MISC_CATALOG = [
  "Alloy rod",
  "Steel",
  "Grinding wheels",
  "Weld / cut gas",
  "Fire blanket",
  "Anti-seize",
] as const;

export const TRAVEL_LANES = ["staff", "generalForeman", "foreman", "direct", "support"] as const;
export type TravelLane = (typeof TRAVEL_LANES)[number];

export const TRAVEL_LANE_LABEL: Record<TravelLane, string> = {
  staff: "Staff",
  generalForeman: "GF",
  foreman: "Foreman",
  direct: "Direct Craft",
  support: "Support",
};

export type TravelLine = {
  id: string;
  lane: TravelLane;
  name: string;
  headcount: number;
  travelers: number;
  perMile: number;
  miles: number;
};

export type MiscLine = {
  id: string;
  item: string;
  qty: number;
  each: number;
};

export type OtherCostSheet = {
  perDiemRate: number;
  travel: TravelLine[];
  misc: MiscLine[];
};

export type TravelCrewRow = {
  id: string;
  position?: string;
  shift?: CraftShift;
  ranges?: CalendarRange[];
};

export type TravelCrew = {
  staff?: TravelCrewRow[];
  generalForeman?: TravelCrewRow[];
  foreman?: TravelCrewRow[];
  direct?: TravelCrewRow[];
  support?: Array<TravelCrewRow & { billedAs?: string }>;
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyOtherCost(): OtherCostSheet {
  return { perDiemRate: 0, travel: [], misc: [] };
}

export function blankMisc(item = ""): MiscLine {
  return { id: uid("mc"), item, qty: 1, each: 0 };
}

export function seedMiscCatalog(): MiscLine[] {
  return MISC_CATALOG.map((item) => blankMisc(item));
}

export function miscAmount(line: MiscLine) {
  return Math.max(0, line.qty) * Math.max(0, line.each);
}

function asLane(value: unknown): TravelLane {
  return TRAVEL_LANES.includes(value as TravelLane) ? (value as TravelLane) : "direct";
}

function rangePeople(shift: CraftShift | undefined, range: Pick<CalendarRange, "headcount" | "nightHeadcount">) {
  const days = Math.max(0, Number(range.headcount) || 0);
  const nights = Math.max(0, Number(range.nightHeadcount) || 0);
  if (shift === "Days & nights") return days + nights;
  if (shift === "Nights") return nights || days;
  return days;
}

/** Peak people on the Crew row. Days + nights when the row works both. */
export function crewPositionHeadcount(row: Pick<CraftRow, "shift" | "ranges"> | TravelCrewRow) {
  const ranges = Array.isArray(row.ranges) ? row.ranges : [];
  if (!ranges.length) return 0;
  return ranges.reduce((max, range) => Math.max(max, rangePeople(range.shift ?? row.shift, range)), 0);
}

export function capTravelers(travelers: number, headcount: number) {
  const cap = Math.max(0, Number(headcount) || 0);
  const count = Math.max(0, Number(travelers) || 0);
  return Math.min(Math.floor(count), cap);
}

export function travelAmount(line: Pick<TravelLine, "travelers" | "perMile" | "miles" | "headcount">) {
  return (
    capTravelers(line.travelers, line.headcount) *
    Math.max(0, Number(line.miles) || 0) *
    Math.max(0, Number(line.perMile) || 0)
  );
}

export function crewTravelPositions(crew: TravelCrew = {}) {
  const rows: Array<{ id: string; lane: TravelLane; name: string; headcount: number }> = [];
  for (const lane of TRAVEL_LANES) {
    for (const row of crew[lane] ?? []) {
      if (!row?.id) continue;
      const headcount = crewPositionHeadcount(row);
      if (headcount <= 0) continue;
      const name = String(row.position || "").trim() || "Position";
      rows.push({ id: row.id, lane, name, headcount });
    }
  }
  return rows;
}

export function hydrateTravelLine(raw: unknown): TravelLine | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if ("traveler" in item && !("travelers" in item) && !("miles" in item)) return null;
  const id = String(item.id || item.crewId || "");
  if (!id || id.startsWith("tr-")) return null;
  const headcount = Math.max(0, Number(item.headcount) || 0);
  return {
    id,
    lane: asLane(item.lane),
    name: String(item.name || ""),
    headcount,
    travelers: capTravelers(Number(item.travelers) || 0, headcount),
    perMile: Math.max(0, Number(item.perMile) || 0),
    miles: Math.max(0, Number(item.miles) || 0),
  };
}

export function syncTravelFromCrew(
  travel: TravelLine[],
  crew: TravelCrew,
  defaults: { perMile?: number } = {},
): TravelLine[] {
  const kept = new Map(travel.map((line) => [line.id, line]));
  const seed = Math.max(0, Number(defaults.perMile) || 0);
  return crewTravelPositions(crew).map((row) => {
    const prev = kept.get(row.id);
    return {
      id: row.id,
      lane: row.lane,
      name: row.name,
      headcount: row.headcount,
      travelers: capTravelers(prev?.travelers ?? 0, row.headcount),
      perMile: prev ? Math.max(0, Number(prev.perMile) || 0) : seed,
      miles: prev ? Math.max(0, Number(prev.miles) || 0) : 0,
    };
  });
}

export function syncOtherCostTravel(
  sheet: OtherCostSheet,
  crew: TravelCrew,
  defaults: { perMile?: number } = {},
): OtherCostSheet {
  return { ...sheet, travel: syncTravelFromCrew(sheet.travel, crew, defaults) };
}

export function persistCrewTravel(key: string, crew: TravelCrew, perMile = 0) {
  if (typeof window === "undefined" || !key) return;
  const sheet = readOtherCost(key);
  const next = syncOtherCostTravel(sheet, crew, { perMile });
  if (JSON.stringify(sheet.travel) !== JSON.stringify(next.travel)) writeOtherCost(key, next);
}

export function perDiemAmount(rate: number, pdDays: number) {
  return Math.max(0, rate) * Math.max(0, pdDays);
}

export function otherCostTotals(sheet: OtherCostSheet, pdDays = 0) {
  const perDiem = perDiemAmount(sheet.perDiemRate, pdDays);
  const travel = sheet.travel.reduce((sum, line) => sum + travelAmount(line), 0);
  const misc = sheet.misc.reduce((sum, line) => sum + miscAmount(line), 0);
  return { perDiem, travel, misc, total: perDiem + travel + misc };
}

export function readOtherCost(key: string): OtherCostSheet {
  if (typeof window === "undefined" || !key) return emptyOtherCost();
  try {
    const raw = window.localStorage.getItem(`${OTHER_COST_STORE_PREFIX}${key}`);
    if (!raw) return { ...emptyOtherCost(), misc: seedMiscCatalog() };
    const parsed = JSON.parse(raw) as Partial<OtherCostSheet>;
    return {
      perDiemRate: Number(parsed.perDiemRate) || 0,
      travel: Array.isArray(parsed.travel)
        ? parsed.travel.map(hydrateTravelLine).filter((line): line is TravelLine => Boolean(line))
        : [],
      misc: Array.isArray(parsed.misc) && parsed.misc.length ? parsed.misc : seedMiscCatalog(),
    };
  } catch {
    return { ...emptyOtherCost(), misc: seedMiscCatalog() };
  }
}

export function writeOtherCost(key: string, sheet: OtherCostSheet) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${OTHER_COST_STORE_PREFIX}${key}`, JSON.stringify(sheet));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

export function parseOtherCostJson(raw: unknown): OtherCostSheet {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<OtherCostSheet>;
  return {
    perDiemRate: Number(parsed.perDiemRate) || 0,
    travel: Array.isArray(parsed.travel)
      ? parsed.travel.map(hydrateTravelLine).filter((line): line is TravelLine => Boolean(line))
      : [],
    misc: Array.isArray(parsed.misc) && parsed.misc.length ? parsed.misc : seedMiscCatalog(),
  };
}
