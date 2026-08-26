export const OTHER_COST_STORE_PREFIX = "hs_other_v1:";

export const MISC_CATALOG = [
  "Alloy rod",
  "Steel",
  "Grinding wheels",
  "Weld / cut gas",
  "Fire blanket",
  "Anti-seize",
] as const;

export type TravelLine = {
  id: string;
  kind: "staff" | "craft";
  name: string;
  traveler: boolean;
  mileageRate: number;
  travelDollars: number;
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

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyOtherCost(): OtherCostSheet {
  return { perDiemRate: 0, travel: [], misc: [] };
}

export function blankTravel(kind: TravelLine["kind"] = "staff", mileageRate = 0): TravelLine {
  return { id: uid("tr"), kind, name: "", traveler: false, mileageRate, travelDollars: 0 };
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

export function travelAmount(line: TravelLine) {
  if (!line.traveler) return 0;
  return Math.max(0, line.travelDollars);
}

export function showCraftTravelRow(mileageRate: number) {
  return Number(mileageRate) > 0;
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
      travel: Array.isArray(parsed.travel) ? parsed.travel : [],
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
  } catch {
    // keep the previous copy
  }
}
