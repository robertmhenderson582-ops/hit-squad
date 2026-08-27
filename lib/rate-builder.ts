/** One-craft rate builder. Fringe methods stay open — do not collapse them. */

export const RATE_OT_MULTIPLIER = 1.5;
export const RATE_DT_MULTIPLIER = 2;
export const RATE_SHIFT_HOURS = 8;

export const FRINGE_METHODS = [
  "hour-worked",
  "hour-paid",
  "pct-taxable",
  "pct-gross",
  "pct-st-only",
  "weekly-cap-40",
  "per-shift",
  "included-in-wage",
] as const;

export type FringeMethod = (typeof FRINGE_METHODS)[number];

export const FRINGE_METHOD_LABEL: Record<FringeMethod, string> = {
  "hour-worked": "$ / hour worked",
  "hour-paid": "$ / hour paid",
  "pct-taxable": "% of taxable wage",
  "pct-gross": "% of gross",
  "pct-st-only": "% of ST only",
  "weekly-cap-40": "Weekly cap (first 40)",
  "per-shift": "Per shift / day",
  "included-in-wage": "Included in wage",
};

export type FringeRow = {
  id: string;
  name: string;
  method: FringeMethod;
  amount: number;
  ridesOt: boolean;
};

export type BuiltCraft = {
  id: string;
  craft: string;
  local?: string;
  baseSt: number;
  fringes: FringeRow[];
};

export type CompositeReadout = {
  st: number;
  ot: number;
  dt: number;
};

export function isFringeMethod(value: string): value is FringeMethod {
  return (FRINGE_METHODS as readonly string[]).includes(value);
}

export function newFringeRow(over: Partial<FringeRow> = {}): FringeRow {
  return {
    id: over.id || `fringe-${Math.random().toString(36).slice(2, 8)}`,
    name: over.name || "",
    method: over.method && isFringeMethod(over.method) ? over.method : "hour-worked",
    amount: Number.isFinite(over.amount) ? Number(over.amount) : 0,
    ridesOt: Boolean(over.ridesOt),
  };
}

export function newBuiltCraft(over: Partial<BuiltCraft> = {}): BuiltCraft {
  return {
    id: over.id || `craft-${Math.random().toString(36).slice(2, 8)}`,
    craft: over.craft || "",
    local: over.local,
    baseSt: Number.isFinite(over.baseSt) ? Number(over.baseSt) : 0,
    fringes: Array.isArray(over.fringes) ? over.fringes.map((row) => newFringeRow(row)) : [],
  };
}

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function wageFor(bucket: "st" | "ot" | "dt", baseSt: number) {
  if (bucket === "ot") return baseSt * RATE_OT_MULTIPLIER;
  if (bucket === "dt") return baseSt * RATE_DT_MULTIPLIER;
  return baseSt;
}

function paidHours(bucket: "st" | "ot" | "dt") {
  if (bucket === "ot") return RATE_OT_MULTIPLIER;
  if (bucket === "dt") return RATE_DT_MULTIPLIER;
  return 1;
}

function ridesBucket(fringe: FringeRow, bucket: "st" | "ot" | "dt") {
  return bucket === "st" || fringe.ridesOt;
}

function dollarFringe(fringe: FringeRow, bucket: "st" | "ot" | "dt", baseSt: number) {
  if (!ridesBucket(fringe, bucket)) return 0;
  if (fringe.method === "hour-worked") return fringe.amount;
  if (fringe.method === "hour-paid") return fringe.amount * paidHours(bucket);
  if (fringe.method === "weekly-cap-40") return bucket === "st" ? fringe.amount : 0;
  if (fringe.method === "per-shift") return fringe.amount / RATE_SHIFT_HOURS;
  return 0;
}

function percentFringe(
  fringe: FringeRow,
  bucket: "st" | "ot" | "dt",
  baseSt: number,
  taxable: number,
  gross: number,
) {
  if (!ridesBucket(fringe, bucket)) return 0;
  const pct = fringe.amount / 100;
  if (fringe.method === "pct-st-only") return baseSt * pct;
  if (fringe.method === "pct-taxable") return taxable * pct;
  if (fringe.method === "pct-gross") return gross * pct;
  return 0;
}

export function fringeOnBucket(fringe: FringeRow, bucket: "st" | "ot" | "dt", baseSt: number, taxable: number, gross: number) {
  if (fringe.method === "included-in-wage") return 0;
  if (fringe.method === "pct-taxable" || fringe.method === "pct-gross" || fringe.method === "pct-st-only") {
    return percentFringe(fringe, bucket, baseSt, taxable, gross);
  }
  return dollarFringe(fringe, bucket, baseSt);
}

export function compositeRates(craft: Pick<BuiltCraft, "baseSt" | "fringes">): CompositeReadout {
  const baseSt = Math.max(0, Number(craft.baseSt) || 0);
  const fringes = craft.fringes ?? [];
  const buckets = ["st", "ot", "dt"] as const;
  const next: CompositeReadout = { st: 0, ot: 0, dt: 0 };
  for (const bucket of buckets) {
    const wage = wageFor(bucket, baseSt);
    const dollars = fringes.reduce((sum, row) => sum + dollarFringe(row, bucket, baseSt), 0);
    const taxable = wage;
    const gross = wage + dollars;
    const percents = fringes.reduce((sum, row) => sum + percentFringe(row, bucket, baseSt, taxable, gross), 0);
    next[bucket] = money(wage + dollars + percents);
  }
  return next;
}
