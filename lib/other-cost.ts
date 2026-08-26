import type { CalendarRange, CraftShift } from "./craft-labor.ts";
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

export const MISC_HEADERS = ["ITEM", "DESCRIPTION", "QTY", "EACH", "TOTAL"] as const;

/** Ordinary shop wording. Not a COMP book and not prices. */
export const MISC_DESCRIPTIONS: Record<(typeof MISC_CATALOG)[number], readonly string[]> = {
  "Alloy rod": ["Stainless", "Inconel", "Carbon steel", "Chrome-moly", "Nickel alloy", "Aluminum", "Hardfacing"],
  Steel: [
    "Wide flange beam",
    "2x2 angle iron",
    "Channel",
    "Beams",
    "Plate",
    "Pipe",
    "Tube",
    "Flat bar",
    "Round bar",
    "I-beam",
    "Sheet",
  ],
  "Grinding wheels": [
    "4-1/2\" flap disc",
    "7\" grinding disc",
    "Cut-off wheel",
    "Wire wheel",
    "Cup wheel",
    "Pipeline wheel",
    "Sanding disc",
  ],
  "Weld / cut gas": ["Oxygen", "Acetylene", "Argon", "C-25", "Nitrogen", "Propane", "Helium", "Mixed shielding"],
  "Fire blanket": ["Welding blanket", "Carbon blanket", "Fiberglass blanket", "Silica blanket", "Curtain", "Pad"],
  "Anti-seize": ["Nickel", "Copper", "Silver", "Aluminum", "High-temp", "Food-grade"],
};

export const MISC_EXTRA_DESCRIPTIONS = [
  "Consumable",
  "Hardware",
  "Gasket",
  "Bolt-up",
  "Rigging",
  "Insulation",
  "Scaffold",
  "Other shop item",
] as const;

export const STAFF_TRAVEL_ID = "travel-staff";
export const CRAFT_TRAVEL_ID = "travel-craft";
export type TravelKind = "staff" | "craft";
export type TravelSource = "crew" | "extra";

export const TRAVEL_KIND_LABEL: Record<TravelKind, string> = {
  staff: "Staff",
  craft: "Craft",
};

export type TravelLine = {
  id: string;
  kind: TravelKind;
  source: TravelSource;
  headcount: number;
  travelers: number;
  perMile: number;
  miles: number;
};

export type MiscLine = {
  id: string;
  item: string;
  description: string;
  qty: number;
  each: number;
};

export type OtherCostSheet = {
  perDiemRate: number;
  travel: TravelLine[];
  misc: MiscLine[];
};

export type TravelCrewRow = {
  id?: string;
  position?: string;
  shift?: CraftShift;
  ranges?: Array<Partial<CalendarRange> & { headcount?: number; nightHeadcount?: number; shift?: CraftShift }>;
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

function rangePeople(shift: CraftShift | undefined, range: { headcount?: number; nightHeadcount?: number }) {
  const days = Math.max(0, Number(range.headcount) || 0);
  const nights = Math.max(0, Number(range.nightHeadcount) || 0);
  if (shift === "Days & nights") return days + nights;
  if (shift === "Nights") return nights || days;
  return days;
}

/** Peak people on the Crew row. Days + nights when the row works both. */
export function crewPositionHeadcount(row: { shift?: CraftShift; ranges?: TravelCrewRow["ranges"] }) {
  const ranges = Array.isArray(row.ranges) ? row.ranges : [];
  if (!ranges.length) return 0;
  return ranges.reduce((max, range) => Math.max(max, rangePeople(range.shift ?? row.shift, range)), 0);
}

export function crewLaneHeadcount(rows: TravelCrewRow[] | undefined) {
  return (rows ?? []).reduce((sum, row) => sum + crewPositionHeadcount(row), 0);
}

export function crewTravelHeadcounts(crew: TravelCrew = {}) {
  return {
    staff: crewLaneHeadcount(crew.staff) + crewLaneHeadcount(crew.generalForeman),
    craft: crewLaneHeadcount(crew.foreman) + crewLaneHeadcount(crew.direct) + crewLaneHeadcount(crew.support),
  };
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

export function defaultTravelLine(
  kind: TravelKind,
  headcount = 0,
  prev?: Partial<TravelLine>,
  seedPerMile = 0,
): TravelLine {
  return {
    id: kind === "staff" ? STAFF_TRAVEL_ID : CRAFT_TRAVEL_ID,
    kind,
    source: "crew",
    headcount,
    travelers: capTravelers(prev?.travelers ?? 0, headcount),
    perMile: prev ? Math.max(0, Number(prev.perMile) || 0) : Math.max(0, seedPerMile),
    miles: prev ? Math.max(0, Number(prev.miles) || 0) : 0,
  };
}

export function blankTravel(kind: TravelKind = "staff", mileageRate = 0): TravelLine {
  return {
    id: uid("tr"),
    kind,
    source: "extra",
    headcount: 0,
    travelers: 0,
    perMile: Math.max(0, Number(mileageRate) || 0),
    miles: 0,
  };
}

export function emptyOtherCost(): OtherCostSheet {
  return {
    perDiemRate: 0,
    travel: [defaultTravelLine("staff", 0), defaultTravelLine("craft", 0)],
    misc: [],
  };
}

export function blankMisc(item = ""): MiscLine {
  return { id: uid("mc"), item, description: "", qty: 1, each: 0 };
}

export function hydrateMiscLine(raw: unknown): MiscLine {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: String(item.id || uid("mc")),
    item: String(item.item || ""),
    description: String(item.description || ""),
    qty: Number(item.qty) || 0,
    each: Number(item.each) || 0,
  };
}

export function miscDescriptionsFor(item: string): string[] {
  const name = item.trim().toLowerCase();
  if (!name) return [];
  const listed = MISC_CATALOG.find((row) => row.toLowerCase() === name);
  if (listed) return [...MISC_DESCRIPTIONS[listed]];
  const fuzzy = MISC_CATALOG.find((row) => name.includes(row.toLowerCase()) || row.toLowerCase().includes(name));
  if (fuzzy) return [...MISC_DESCRIPTIONS[fuzzy]];
  return [...MISC_EXTRA_DESCRIPTIONS];
}

export function seedMiscCatalog(): MiscLine[] {
  return MISC_CATALOG.map((item) => blankMisc(item));
}

export function miscAmount(line: MiscLine) {
  return Math.max(0, line.qty) * Math.max(0, line.each);
}

function asKind(raw: Record<string, unknown>): TravelKind {
  if (raw.kind === "staff" || raw.kind === "craft") return raw.kind;
  if (raw.lane === "staff" || raw.lane === "generalForeman") return "staff";
  return "craft";
}

export function hydrateTravelLine(raw: unknown): TravelLine | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if ("traveler" in item && !("travelers" in item) && !("miles" in item)) return null;
  if ("lane" in item && !("kind" in item) && !("source" in item)) return null;
  const kind = asKind(item);
  const source: TravelSource =
    item.source === "extra" || (item.id && String(item.id).startsWith("tr-")) ? "extra" : "crew";
  const headcount = Math.max(0, Number(item.headcount) || 0);
  const id =
    source === "crew"
      ? kind === "staff"
        ? STAFF_TRAVEL_ID
        : CRAFT_TRAVEL_ID
      : String(item.id || uid("tr"));
  return {
    id,
    kind,
    source,
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
  const counts = crewTravelHeadcounts(crew);
  const seed = Math.max(0, Number(defaults.perMile) || 0);
  const staffPrev = travel.find((line) => line.id === STAFF_TRAVEL_ID || (line.source === "crew" && line.kind === "staff"));
  const craftPrev = travel.find((line) => line.id === CRAFT_TRAVEL_ID || (line.source === "crew" && line.kind === "craft"));
  const extras = travel
    .filter((line) => line.source === "extra")
    .map((line) => ({ ...line, travelers: capTravelers(line.travelers, line.headcount) }));
  return [
    defaultTravelLine("staff", counts.staff, staffPrev, seed),
    defaultTravelLine("craft", counts.craft, craftPrev, seed),
    ...extras,
  ];
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
      misc: Array.isArray(parsed.misc) && parsed.misc.length ? parsed.misc.map(hydrateMiscLine) : seedMiscCatalog(),
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
    misc: Array.isArray(parsed.misc) && parsed.misc.length ? parsed.misc.map(hydrateMiscLine) : seedMiscCatalog(),
  };
}
