/**
 * Wood River Exhibit B-1 rate-builder controls.
 *
 * Desk extract (2026-09-11): ST/OT/DT Calc is Drop Down List A1:A5 → hall
 * sheet row 7 (`ST`, `OT`, `DT`, `ST-ONLY`, `OT-ONLY`). % base is E1:E2 →
 * row 8 (`BW (K)`, `Tax BW (P)`). Rate $/ %/Varies is row-6 cell format/text.
 * Rate Class (`Merit`, `Union`) and Craft Type (`Staff`, `Craft`, `Engineer`,
 * `All`) are also in the book. Do not rename or collapse those labels.
 *
 * Further Drop Down List strings merge through `b1-dropdowns.json`.
 * Legacy `ridesOt` maps into the five calc values without deleting options.
 */

import fringeOptions from "./rate-vault/b1-fringe-options.json" with { type: "json" };
import dropdownSeed from "./rate-vault/b1-dropdowns.json" with { type: "json" };

export const RATE_VAULT_B1_FRINGE_OPTIONS_PATH = "lib/rate-vault/b1-fringe-options.json";
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
export const RATE_VAULT_B1_RATE_CLASS_LABEL = "Rate Class";
export const RATE_VAULT_B1_CRAFT_TYPE_LABEL = "Craft Type";
export const RATE_VAULT_B1_REVISION_LABEL = "Revision";
export const RATE_VAULT_B1_EFF_THROUGH_LABEL = "Eff Through";

export const RATE_VAULT_B1_CALC_MODES = ["ST", "OT", "DT", "ST-ONLY", "OT-ONLY"] as const;
export const RATE_VAULT_B1_BASE_MODES = ["BW (K)", "Tax BW (P)"] as const;
export const RATE_VAULT_B1_RATE_KIND_MODES = ["$", "%", "Varies"] as const;
export const RATE_VAULT_B1_RATE_CLASSES = ["Merit", "Union"] as const;
export const RATE_VAULT_B1_CRAFT_TYPES = ["Staff", "Craft", "Engineer", "All"] as const;

export const RATE_VAULT_B1_BUCKETS = ["st", "ot", "dt"] as const;
export type RateVaultB1Bucket = (typeof RATE_VAULT_B1_BUCKETS)[number];
export type RateVaultB1CalcMode = (typeof RATE_VAULT_B1_CALC_MODES)[number];
export type RateVaultB1CalcClass = RateVaultB1CalcMode | "other";

export type RateVaultB1DropdownCatalog = {
  rateKind: string[];
  base: string[];
  calc: string[];
  ride: string[];
  rateClass?: string[];
  craftType?: string[];
  rateType?: string[];
  extra?: Record<string, string[]>;
  note?: string;
  source?: string;
};

const DEFAULT_CATALOG: RateVaultB1DropdownCatalog = {
  rateKind: [...RATE_VAULT_B1_RATE_KIND_MODES],
  base: [...RATE_VAULT_B1_BASE_MODES],
  calc: [...RATE_VAULT_B1_CALC_MODES],
  ride: ["Y", "N"],
  rateClass: [...RATE_VAULT_B1_RATE_CLASSES],
  craftType: [...RATE_VAULT_B1_CRAFT_TYPES],
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

const OPTION_PREFIX_TO_KIND = {
  "st-ot-dt-calc": "calc",
  "pct-base": "base",
  "rate-mode": "rateKind",
  "rate-class": "rateClass",
  "craft-type": "craftType",
  "data-row-rate-type": "rateType",
} as const;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? uniqStrings(value) : [];
}

/** Desk extract catalog is `{ options, columns, notes, meta }`. Flat string arrays still work. */
function catalogFrom(raw: unknown): Partial<RateVaultB1DropdownCatalog> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const grouped: Partial<Record<(typeof OPTION_PREFIX_TO_KIND)[keyof typeof OPTION_PREFIX_TO_KIND], string[]>> = {};
  if (Array.isArray(obj.options)) {
    for (const item of obj.options) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { id?: unknown; label?: unknown };
      const id = typeof rec.id === "string" ? rec.id : "";
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      if (!label) continue;
      const prefix = id.split("/")[0] || "";
      const kind = OPTION_PREFIX_TO_KIND[prefix as keyof typeof OPTION_PREFIX_TO_KIND];
      if (!kind) continue;
      grouped[kind] = mergeList(grouped[kind] ?? [], [label]);
    }
  }
  const extra =
    obj.extra && typeof obj.extra === "object" && !Array.isArray(obj.extra)
      ? (obj.extra as Record<string, string[]>)
      : undefined;
  const meta = obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : {};
  const notes = Array.isArray(obj.notes) ? obj.notes.filter((note): note is string => typeof note === "string") : [];
  return {
    rateKind: stringList(obj.rateKind).length ? stringList(obj.rateKind) : grouped.rateKind,
    base: stringList(obj.base).length ? stringList(obj.base) : grouped.base,
    calc: stringList(obj.calc).length ? stringList(obj.calc) : grouped.calc,
    ride: stringList(obj.ride),
    rateClass: stringList(obj.rateClass).length ? stringList(obj.rateClass) : grouped.rateClass,
    craftType: stringList(obj.craftType).length ? stringList(obj.craftType) : grouped.craftType,
    rateType: stringList(obj.rateType).length ? stringList(obj.rateType) : grouped.rateType,
    extra,
    note: typeof obj.note === "string" ? obj.note : notes[0],
    source:
      typeof obj.source === "string"
        ? obj.source
        : typeof meta.sourceWorkbook === "string"
          ? meta.sourceWorkbook
          : undefined,
  };
}

export function rateVaultB1DistinctFringeLabels() {
  const meta =
    fringeOptions && typeof fringeOptions === "object"
      ? (fringeOptions as { meta?: { distinctFringeBurdenCalcOptionLabels?: unknown } }).meta
      : undefined;
  const labels = stringList(meta?.distinctFringeBurdenCalcOptionLabels);
  return labels.length
    ? labels
    : [
        ...RATE_VAULT_B1_CALC_MODES,
        ...RATE_VAULT_B1_BASE_MODES,
        ...RATE_VAULT_B1_RATE_KIND_MODES,
        ...RATE_VAULT_B1_RATE_CLASSES,
        ...RATE_VAULT_B1_CRAFT_TYPES,
      ];
}

export function mergeRateVaultB1Dropdowns(
  extra?: Partial<RateVaultB1DropdownCatalog> | null,
): RateVaultB1DropdownCatalog {
  const seed = catalogFrom(fringeOptions);
  const ext = catalogFrom(dropdownSeed);
  const extraMap = extra?.extra && typeof extra.extra === "object" ? extra.extra : {};
  const seedExtra = seed.extra && typeof seed.extra === "object" ? seed.extra : {};
  const extExtra = ext.extra && typeof ext.extra === "object" ? ext.extra : {};
  const extraKeys = uniqStrings([...Object.keys(seedExtra), ...Object.keys(extExtra), ...Object.keys(extraMap)]);
  const mergedExtra: Record<string, string[]> = {};
  for (const key of extraKeys) {
    mergedExtra[key] = mergeList(seedExtra[key] ?? [], [...(extExtra[key] ?? []), ...(extraMap[key] ?? [])]);
  }
  return {
    note: extra?.note || ext.note || seed.note || DEFAULT_CATALOG.note,
    source: extra?.source || ext.source || seed.source || DEFAULT_CATALOG.source,
    rateKind: mergeList(DEFAULT_CATALOG.rateKind, [...(seed.rateKind ?? []), ...(ext.rateKind ?? []), ...(extra?.rateKind ?? [])]),
    base: mergeList(DEFAULT_CATALOG.base, [...(seed.base ?? []), ...(ext.base ?? []), ...(extra?.base ?? [])]),
    calc: mergeList(DEFAULT_CATALOG.calc, [...(seed.calc ?? []), ...(ext.calc ?? []), ...(extra?.calc ?? [])]),
    ride: mergeList(DEFAULT_CATALOG.ride ?? [], [...(seed.ride ?? []), ...(ext.ride ?? []), ...(extra?.ride ?? [])]),
    rateClass: mergeList(DEFAULT_CATALOG.rateClass ?? [], [...(seed.rateClass ?? []), ...(ext.rateClass ?? []), ...(extra?.rateClass ?? [])]),
    craftType: mergeList(DEFAULT_CATALOG.craftType ?? [], [...(seed.craftType ?? []), ...(ext.craftType ?? []), ...(extra?.craftType ?? [])]),
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

export function rateVaultB1SelectOptions(
  kind: keyof Pick<RateVaultB1DropdownCatalog, "rateKind" | "base" | "calc" | "ride" | "rateClass" | "craftType">,
  current?: string | null,
) {
  return retainRateVaultB1Option(rateVaultB1DropdownCatalog()[kind] ?? [], current);
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

export function classifyRateVaultB1Base(value: string | null | undefined): "BW (K)" | "Tax BW (P)" | "other" {
  const raw = text(value);
  if (/tax\s*bw|taxable|\(P\)/i.test(raw)) return "Tax BW (P)";
  if (/bw\s*\(K\)|base\s*wage|^bw$/i.test(raw)) return "BW (K)";
  return raw ? "other" : "Tax BW (P)";
}

export function normalizeRateVaultB1Base(value: string | null | undefined, fallback: "BW (K)" | "Tax BW (P)" = "Tax BW (P)") {
  const raw = text(value);
  if (!raw) return fallback;
  const kind = classifyRateVaultB1Base(raw);
  if (kind === "other") return raw;
  return kind;
}

export function classifyRateVaultB1Calc(
  value: string | null | undefined,
  bucket: RateVaultB1Bucket = "ot",
): RateVaultB1CalcClass {
  const raw = text(value);
  if (!raw) return "ST";
  if (/^st-only$/i.test(raw) || /straight(\s*time)?(\s*only)?/i.test(raw)) return "ST-ONLY";
  if (/^ot-only$/i.test(raw)) return "OT-ONLY";
  if (/^dt$/i.test(raw)) return "DT";
  if (/^ot$/i.test(raw)) return "OT";
  if (/^st$/i.test(raw)) return "ST";
  if (/^y$/i.test(raw)) return bucket === "dt" ? "DT" : "OT";
  if (/^n$/i.test(raw)) return "ST-ONLY";
  if (/hour/i.test(raw) && /paid/i.test(raw)) return bucket === "dt" ? "DT" : "OT";
  if (/hour/i.test(raw) && /work/i.test(raw)) return "ST";
  return "other";
}

export function normalizeRateVaultB1Calc(value: string | null | undefined, bucket: RateVaultB1Bucket = "ot") {
  const raw = text(value);
  if (!raw) return "";
  if ((RATE_VAULT_B1_CALC_MODES as readonly string[]).includes(raw)) return raw;
  const kind = classifyRateVaultB1Calc(raw, bucket);
  return kind === "other" ? raw : kind;
}

function noteSuggestsStraight(note: string, label: string) {
  return /st-only|does not pay on ot|ot\/dt fringe contribution is \$0/i.test(`${note} ${label}`);
}

function ratioClass(st: number, ot: number | null | undefined): RateVaultB1CalcMode | "custom" | null {
  if (!(st > 0) || ot == null || !Number.isFinite(ot)) return null;
  if (Math.abs(ot) <= MONEY_TOL) return "ST-ONLY";
  const ratio = ot / st;
  if (Math.abs(ratio - 1) <= MONEY_TOL) return "ST";
  if (Math.abs(ratio - 1.5) <= 0.06) return "OT";
  if (Math.abs(ratio - 2) <= 0.06) return "DT";
  return "custom";
}

export function inferRateVaultB1RateClass(input: { lane?: string | null; craft?: string | null; sheet?: string | null; group?: string | null; rateClass?: string | null }) {
  const explicit = text(input.rateClass);
  if (explicit) return explicit;
  if (/merit/i.test([input.lane, input.craft, input.sheet, input.group].filter(Boolean).join(" "))) return "Merit";
  return "Union";
}

export function inferRateVaultB1CraftType(input: { craft?: string | null; sheet?: string | null; group?: string | null; craftType?: string | null }) {
  const explicit = text(input.craftType);
  if (explicit) return explicit;
  const hay = [input.craft, input.sheet, input.group].filter(Boolean).join(" ");
  if (/engineer/i.test(hay)) return "Engineer";
  if (/staff/i.test(hay)) return "Staff";
  if (/\ball\b/i.test(hay)) return "All";
  return "Craft";
}

export function inferRateVaultB1Controls(input: RateVaultB1ControlInput = {}): RateVaultB1Controls {
  const unit = input.unit === "pct-taxable" ? "pct-taxable" : input.unit === "amount-hr" ? "amount-hr" : null;
  const rateKind =
    text(input.rateKind) ||
    (unit === "pct-taxable" ? "%" : /varies/i.test(text(input.note)) ? "Varies" : "$");
  const base = normalizeRateVaultB1Base(
    input.base,
    classifyRateVaultB1RateKind(rateKind) === "%" ? "Tax BW (P)" : "BW (K)",
  );
  const note = text(input.note);
  const label = text(input.label);
  const meritHealth =
    /health/i.test(label) && /merit/i.test(`${input.craft || ""} ${input.sheet || ""}`) && input.ridesOt !== true;
  const fromAmounts = ratioClass(Number(input.amountHr) || 0, input.amountOt ?? null);
  const ridesOt = input.ridesOt === true;

  let calcOt =
    normalizeRateVaultB1Calc(input.calcOt, "ot") ||
    (meritHealth ? "ST-ONLY" : "") ||
    (fromAmounts && fromAmounts !== "custom" ? fromAmounts : "") ||
    (noteSuggestsStraight(note, label) ? "ST-ONLY" : "") ||
    (ridesOt ? "OT" : "ST");
  const calcSt = normalizeRateVaultB1Calc(input.calcSt, "st") || "ST";
  let calcDt = normalizeRateVaultB1Calc(input.calcDt, "dt");
  if (!calcDt) {
    if (meritHealth || calcOt === "ST-ONLY") calcDt = "ST-ONLY";
    else if (calcOt === "OT-ONLY") calcDt = "OT-ONLY";
    else if (ridesOt || calcOt === "OT" || calcOt === "DT") calcDt = "DT";
    else calcDt = calcOt;
  }

  if (!text(input.calcOt) && fromAmounts === "custom" && ridesOt) calcOt = "OT";

  const rideSt = parseRideFlag(input.rideFlagSt ?? input.rideSt, true);
  const explicitOtRide = input.rideFlagOt != null || input.rideOt != null;
  const rideOt = parseRideFlag(
    input.rideFlagOt ?? input.rideOt,
    classifyRateVaultB1Calc(calcOt, "ot") === "ST-ONLY" ? false : true,
  );
  const rideDt = parseRideFlag(
    input.rideFlagDt ?? input.rideDt,
    explicitOtRide ? rideOt : classifyRateVaultB1Calc(calcDt, "dt") === "ST-ONLY" ? false : true,
  );

  let mult = typeof input.mult === "number" && Number.isFinite(input.mult) ? input.mult : null;
  if (mult == null && fromAmounts === "custom" && (Number(input.amountHr) || 0) > 0 && input.amountOt != null) {
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
  const kind = classifyRateVaultB1Calc(controls.calcOt, "ot");
  return kind === "OT" || kind === "DT" || kind === "OT-ONLY";
}

export function unitFromB1RateKind(rateKind: string): "pct-taxable" | "amount-hr" {
  return classifyRateVaultB1RateKind(rateKind) === "%" ? "pct-taxable" : "amount-hr";
}

export function normalizeRateVaultB1Controls(input: RateVaultB1ControlInput = {}): RateVaultB1Controls & { ridesOt: boolean } {
  const controls = inferRateVaultB1Controls(input);
  return { ...controls, ridesOt: ridesOtFromB1Controls(controls) };
}

export function b1OtMult(mult: number | null) {
  if (mult != null && Number.isFinite(mult)) return mult;
  return 1.5;
}

export function b1DtMult(mult: number | null) {
  if (mult != null && Number.isFinite(mult)) {
    if (Math.abs(mult - 1.5) <= 0.02) return 2;
    return mult;
  }
  return 2;
}

export function b1PaidHours(bucket: RateVaultB1Bucket, mult: number | null) {
  if (bucket === "st") return 1;
  if (bucket === "ot") return b1OtMult(mult);
  if (bucket === "dt") return b1DtMult(mult);
  return 1;
}

export function b1BucketFactor(controls: RateVaultB1Controls, bucket: RateVaultB1Bucket) {
  const ride = bucket === "st" ? controls.rideSt : bucket === "ot" ? controls.rideOt : controls.rideDt;
  if (!ride) return 0;
  const calc = bucket === "st" ? controls.calcSt : bucket === "ot" ? controls.calcOt : controls.calcDt;
  const kind = classifyRateVaultB1Calc(calc, bucket);
  if (kind === "ST-ONLY") return bucket === "st" ? 1 : 0;
  if (kind === "OT-ONLY") return bucket === "ot" ? b1OtMult(controls.mult) : 0;
  if (kind === "ST") return 1;
  if (kind === "OT") return b1OtMult(controls.mult);
  if (kind === "DT") return b1DtMult(controls.mult);
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

/** Desk / API patch — keep unknown book strings; never coerce off the extract list. */
export function parseRateVaultB1LinePatch(raw: unknown): Partial<RateVaultB1Controls> {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const patch: Partial<RateVaultB1Controls> = {};
  if (typeof row.rateKind === "string") patch.rateKind = row.rateKind.trim();
  if (typeof row.base === "string") patch.base = row.base.trim();
  if (typeof row.calcSt === "string") patch.calcSt = normalizeRateVaultB1Calc(row.calcSt, "st") || row.calcSt.trim();
  if (typeof row.calcOt === "string") patch.calcOt = normalizeRateVaultB1Calc(row.calcOt, "ot") || row.calcOt.trim();
  if (typeof row.calcDt === "string") patch.calcDt = normalizeRateVaultB1Calc(row.calcDt, "dt") || row.calcDt.trim();
  if (row.mult === null) patch.mult = null;
  else if (typeof row.mult === "number" && Number.isFinite(row.mult)) patch.mult = row.mult;
  else if (typeof row.mult === "string" && row.mult.trim() === "") patch.mult = null;
  else if (typeof row.mult === "string" && Number.isFinite(Number(row.mult))) patch.mult = Number(row.mult);
  if (typeof row.rideSt === "boolean") patch.rideSt = row.rideSt;
  if (typeof row.rideOt === "boolean") patch.rideOt = row.rideOt;
  if (typeof row.rideDt === "boolean") patch.rideDt = row.rideDt;
  return patch;
}
