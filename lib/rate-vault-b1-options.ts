/**
 * Wood River Exhibit B-1 rate-builder controls.
 *
 * The official hall sheet is not a three-way fringe enum. Row-6 and the
 * header block expose Rate $ / % / Varies, ST/OT/DT Calc, Mult, Base Wage
 * vs Tax BW, and ST/OT/DT ride flags — the same surface on Fringes and on
 * Pay Tax / Ins / Misc / O/H / Profit. Drop Down List strings from a later
 * desk extract merge through `b1-dropdowns.json` without rewriting this file.
 *
 * Legacy `ridesOt` maps in. Unknown book strings are kept, never discarded.
 */

import dropdownSeed from "./rate-vault/b1-dropdowns.json" with { type: "json" };

export const RATE_VAULT_B1_DROPDOWN_EXTENSION_PATH = "lib/rate-vault/b1-dropdowns.json";

export const RATE_VAULT_B1_RATE_KIND_LABEL = "Rate $/%/Varies";
export const RATE_VAULT_B1_BASE_LABEL = "Base";
export const RATE_VAULT_B1_CALC_LABELS = {
  st: "ST Calc",
  ot: "OT Calc",
  dt: "DT Calc",
} as const;
export const RATE_VAULT_B1_MULT_LABEL = "Mult";
export const RATE_VAULT_B1_RIDE_LABELS = {
  st: "Ride ST",
  ot: "Ride OT",
  dt: "Ride DT",
} as const;
export const RATE_VAULT_B1_REVISION_LABEL = "Revision";
export const RATE_VAULT_B1_EFF_THROUGH_LABEL = "Eff Through";

export const RATE_VAULT_B1_BUCKETS = ["st", "ot", "dt"] as const;
export type RateVaultB1Bucket = (typeof RATE_VAULT_B1_BUCKETS)[number];

export type RateVaultB1DropdownCatalog = {
  rateKind: string[];
  base: string[];
  calc: string[];
  ride: string[];
  rateType?: string[];
  extra?: Record<string, string[]>;
  note?: string;
  source?: string;
};

const DEFAULT_CATALOG: RateVaultB1DropdownCatalog = {
  rateKind: ["$", "%", "Varies"],
  base: ["Base Wage", "Tax BW"],
  calc: ["Hours Worked", "Hours Paid", "Straight Time", "Y", "N", "Varies"],
  ride: ["Y", "N"],
  rateType: ["1-ST"],
  extra: {},
};

function uniqStrings(values: readonly unknown[]) {
  const out: string[] = [];
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || out.includes(next)) continue;
    out.push(next);
  }
  return out;
}

function mergeList(base: readonly string[], extra: readonly unknown[] | undefined) {
  return uniqStrings([...base, ...(extra ?? [])]);
}

export function mergeRateVaultB1Dropdowns(
  extra?: Partial<RateVaultB1DropdownCatalog> | null,
): RateVaultB1DropdownCatalog {
  const seed = dropdownSeed && typeof dropdownSeed === "object" ? dropdownSeed : DEFAULT_CATALOG;
  const extraMap = extra?.extra && typeof extra.extra === "object" ? extra.extra : {};
  const seedExtra = seed.extra && typeof seed.extra === "object" ? seed.extra : {};
  const extraKeys = uniqStrings([...Object.keys(seedExtra), ...Object.keys(extraMap)]);
  const mergedExtra: Record<string, string[]> = {};
  for (const key of extraKeys) {
    mergedExtra[key] = mergeList(seedExtra[key] ?? [], extraMap[key]);
  }
  return {
    note: extra?.note || seed.note || DEFAULT_CATALOG.note,
    source: extra?.source || seed.source || DEFAULT_CATALOG.source,
    rateKind: mergeList(DEFAULT_CATALOG.rateKind, [...(seed.rateKind ?? []), ...(extra?.rateKind ?? [])]),
    base: mergeList(DEFAULT_CATALOG.base, [...(seed.base ?? []), ...(extra?.base ?? [])]),
    calc: mergeList(DEFAULT_CATALOG.calc, [...(seed.calc ?? []), ...(extra?.calc ?? [])]),
    ride: mergeList(DEFAULT_CATALOG.ride, [...(seed.ride ?? []), ...(extra?.ride ?? [])]),
    rateType: mergeList(DEFAULT_CATALOG.rateType ?? [], [...(seed.rateType ?? []), ...(extra?.rateType ?? [])]),
    extra: mergedExtra,
  };
}

export function rateVaultB1DropdownCatalog(extra?: Partial<RateVaultB1DropdownCatalog> | null) {
  return mergeRateVaultB1Dropdowns(extra);
}

/** Book strings stay valid even when they are not in the seeded list yet. */
export function retainRateVaultB1Option(list: readonly string[], value: string | null | undefined) {
  const next = (value || "").trim();
  if (!next) return list.slice();
  return list.includes(next) ? list.slice() : [...list, next];
}

export function rateVaultB1SelectOptions(kind: keyof Pick<RateVaultB1DropdownCatalog, "rateKind" | "base" | "calc" | "ride">, current?: string | null) {
  return retainRateVaultB1Option(rateVaultB1DropdownCatalog()[kind], current);
}

export type RateVaultB1Controls = {
  rateKind: string;
  base: string;
  calcSt: string;
  calcOt: string;
  calcDt: string;
  mult: number | null;
  rideSt: boolean;
  rideOt: boolean;
  rideDt: boolean;
};

export type RateVaultB1ControlInput = Partial<RateVaultB1Controls> & {
  unit?: "pct-taxable" | "amount-hr" | string | null;
  ridesOt?: boolean | null;
  note?: string | null;
  label?: string | null;
  craft?: string | null;
  sheet?: string | null;
  amountOt?: number | null;
  amountDt?: number | null;
  amountHr?: number | null;
  ratePct?: number | null;
  rideFlagSt?: string | boolean | null;
  rideFlagOt?: string | boolean | null;
  rideFlagDt?: string | boolean | null;
};

const MONEY_TOL = 0.04;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function parseRideFlag(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === "y" || raw === "yes" || raw === "true" || raw === "1") return true;
  if (raw === "n" || raw === "no" || raw === "false" || raw === "0") return false;
  return fallback;
}

export function classifyRateVaultB1RateKind(value: string | null | undefined): "$" | "%" | "Varies" | "other" {
  const raw = text(value);
  if (raw === "$" || /^\$|amount-hr|dollar/i.test(raw)) return "$";
  if (raw === "%" || raw === "pct-taxable" || /^%|percent/i.test(raw)) return "%";
  if (/varies/i.test(raw)) return "Varies";
  return raw ? "other" : "$";
}

export function classifyRateVaultB1Base(value: string | null | undefined): "Base Wage" | "Tax BW" | "other" {
  const raw = text(value);
  if (/tax\s*bw|taxable/i.test(raw)) return "Tax BW";
  if (/base\s*wage|bw\b/i.test(raw)) return "Base Wage";
  return raw ? "other" : "Tax BW";
}

export function classifyRateVaultB1Calc(
  value: string | null | undefined,
): "hours-worked" | "hours-paid" | "straight-time" | "varies" | "y" | "n" | "other" {
  const raw = text(value);
  if (!raw) return "hours-worked";
  if (/straight|st\s*only|st-only|only\s*pay\s*on\s*straight/i.test(raw)) return "straight-time";
  if (/hours?\s*paid|hour-paid|paid\s*hours/i.test(raw)) return "hours-paid";
  if (/hours?\s*worked|hour-worked|clock/i.test(raw)) return "hours-worked";
  if (/^varies$/i.test(raw)) return "varies";
  if (/^(y|yes|true|1)$/i.test(raw)) return "y";
  if (/^(n|no|false|0)$/i.test(raw)) return "n";
  return "other";
}

function calcFromClass(kind: ReturnType<typeof classifyRateVaultB1Calc>, original?: string) {
  if (kind === "hours-paid") return "Hours Paid";
  if (kind === "straight-time") return "Straight Time";
  if (kind === "varies") return "Varies";
  if (kind === "y") return "Y";
  if (kind === "n") return "N";
  if (kind === "other" && text(original)) return text(original);
  return "Hours Worked";
}

function noteSuggestsStraight(note: string, label: string) {
  return /straight\s*(time\s*)?only|does not pay on ot|ot\/dt fringe contribution is \$0/i.test(`${note} ${label}`);
}

function ratioClass(st: number, ot: number | null | undefined) {
  if (!(st > 0) || ot == null || !Number.isFinite(ot)) return null;
  if (Math.abs(ot) <= MONEY_TOL) return "straight-time" as const;
  const ratio = ot / st;
  if (Math.abs(ratio - 1) <= MONEY_TOL) return "hours-worked" as const;
  if (Math.abs(ratio - 1.5) <= 0.06) return "hours-paid" as const;
  return "varies" as const;
}

export function inferRateVaultB1Controls(input: RateVaultB1ControlInput = {}): RateVaultB1Controls {
  const unit = input.unit === "pct-taxable" ? "pct-taxable" : input.unit === "amount-hr" ? "amount-hr" : null;
  const rateKind =
    text(input.rateKind) ||
    (unit === "pct-taxable" ? "%" : /varies/i.test(text(input.note)) ? "Varies" : "$");
  const base = text(input.base) || (classifyRateVaultB1RateKind(rateKind) === "%" ? "Tax BW" : "Base Wage");
  const note = text(input.note);
  const label = text(input.label);
  const meritHealth =
    /health/i.test(label) && /merit/i.test(`${input.craft || ""} ${input.sheet || ""}`) && input.ridesOt !== true;
  const fromAmounts = ratioClass(Number(input.amountHr) || 0, input.amountOt ?? null);
  const ridesOt = input.ridesOt === true;

  let calcOt =
    text(input.calcOt) ||
    (meritHealth ? "Straight Time" : "") ||
    (fromAmounts ? calcFromClass(fromAmounts) : "") ||
    (noteSuggestsStraight(note, label) ? "Straight Time" : "") ||
    (ridesOt ? "Hours Paid" : "Hours Worked");
  let calcDt = text(input.calcDt) || calcOt;
  let calcSt = text(input.calcSt) || "Hours Worked";

  if (!text(input.calcOt) && fromAmounts === "varies" && ridesOt) calcOt = "Hours Paid";
  if (!text(input.calcDt)) calcDt = calcOt;

  const rideSt = parseRideFlag(input.rideFlagSt ?? input.rideSt, true);
  const explicitOtRide = input.rideFlagOt != null || input.rideOt != null;
  const rideOt = parseRideFlag(
    input.rideFlagOt ?? input.rideOt,
    classifyRateVaultB1Calc(calcOt) === "straight-time" || classifyRateVaultB1Calc(calcOt) === "n"
      ? false
      : true,
  );
  const rideDt = parseRideFlag(
    input.rideFlagDt ?? input.rideDt,
    explicitOtRide ? rideOt : classifyRateVaultB1Calc(calcDt) === "straight-time" || classifyRateVaultB1Calc(calcDt) === "n" ? false : true,
  );

  let mult = typeof input.mult === "number" && Number.isFinite(input.mult) ? input.mult : null;
  if (mult == null && fromAmounts === "varies" && (Number(input.amountHr) || 0) > 0 && input.amountOt != null) {
    mult = Math.round((input.amountOt / Number(input.amountHr)) * 10000) / 10000;
  }

  return {
    rateKind,
    base,
    calcSt,
    calcOt,
    calcDt,
    mult,
    rideSt,
    rideOt,
    rideDt,
  };
}

export function ridesOtFromB1Controls(controls: Pick<RateVaultB1Controls, "calcOt" | "rideOt" | "mult">) {
  if (!controls.rideOt) return false;
  const kind = classifyRateVaultB1Calc(controls.calcOt);
  return kind === "hours-paid" || kind === "y" || (kind === "varies" && (controls.mult ?? 0) > 1 + MONEY_TOL);
}

export function unitFromB1RateKind(rateKind: string): "pct-taxable" | "amount-hr" {
  return classifyRateVaultB1RateKind(rateKind) === "%" ? "pct-taxable" : "amount-hr";
}

export function normalizeRateVaultB1Controls(input: RateVaultB1ControlInput = {}): RateVaultB1Controls & { ridesOt: boolean } {
  const controls = inferRateVaultB1Controls(input);
  return { ...controls, ridesOt: ridesOtFromB1Controls(controls) };
}

export function b1PaidHours(bucket: RateVaultB1Bucket, mult: number | null) {
  if (bucket === "st") return 1;
  if (mult != null && Number.isFinite(mult)) {
    if (bucket === "dt" && Math.abs(mult - 1.5) <= 0.02) return 2;
    return mult;
  }
  if (bucket === "ot") return 1.5;
  if (bucket === "dt") return 2;
  return 1;
}

export function b1BucketFactor(controls: RateVaultB1Controls, bucket: RateVaultB1Bucket) {
  const ride = bucket === "st" ? controls.rideSt : bucket === "ot" ? controls.rideOt : controls.rideDt;
  if (!ride) return 0;
  const calc = bucket === "st" ? controls.calcSt : bucket === "ot" ? controls.calcOt : controls.calcDt;
  const kind = classifyRateVaultB1Calc(calc);
  if (kind === "straight-time" || kind === "n") return bucket === "st" ? 1 : 0;
  if (kind === "hours-worked") return 1;
  if (kind === "hours-paid" || kind === "y") return b1PaidHours(bucket, controls.mult);
  if (kind === "varies") return bucket === "st" ? 1 : b1PaidHours(bucket, controls.mult ?? 1);
  if (kind === "other") return bucket === "st" ? 1 : controls.mult != null ? b1PaidHours(bucket, controls.mult) : 1;
  return 1;
}

export function recognizeFringeControlsFromHallAmounts(input: {
  st: number;
  ot?: number | null;
  dt?: number | null;
  unit?: "pct-taxable" | "amount-hr";
  ridesOt?: boolean;
  note?: string;
  label?: string;
}) {
  return inferRateVaultB1Controls({
    amountHr: input.st,
    amountOt: input.ot,
    amountDt: input.dt,
    unit: input.unit,
    ridesOt: input.ridesOt,
    note: input.note,
    label: input.label,
  });
}

/** Desk / API patch — keep unknown book strings; never coerce to a three-way enum. */
export function parseRateVaultB1LinePatch(raw: unknown): Partial<RateVaultB1Controls> {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const patch: Partial<RateVaultB1Controls> = {};
  if (typeof row.rateKind === "string") patch.rateKind = row.rateKind.trim();
  if (typeof row.base === "string") patch.base = row.base.trim();
  if (typeof row.calcSt === "string") patch.calcSt = row.calcSt.trim();
  if (typeof row.calcOt === "string") patch.calcOt = row.calcOt.trim();
  if (typeof row.calcDt === "string") patch.calcDt = row.calcDt.trim();
  if (row.mult === null) patch.mult = null;
  else if (typeof row.mult === "number" && Number.isFinite(row.mult)) patch.mult = row.mult;
  else if (typeof row.mult === "string" && row.mult.trim() === "") patch.mult = null;
  else if (typeof row.mult === "string" && Number.isFinite(Number(row.mult))) patch.mult = Number(row.mult);
  if (typeof row.rideSt === "boolean") patch.rideSt = row.rideSt;
  if (typeof row.rideOt === "boolean") patch.rideOt = row.rideOt;
  if (typeof row.rideDt === "boolean") patch.rideDt = row.rideDt;
  return patch;
}
