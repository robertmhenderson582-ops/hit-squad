/** One-craft rate builder. Fringe methods stay open — do not collapse them. */

export const RATE_OT_MULTIPLIER = 1.5;
export const RATE_DT_MULTIPLIER = 2;
export const RATE_SHIFT_HOURS = 8;

/** Yates-style labor sheet columns. PD is the Shahan fringe already on the book. */
export const LABOR_SHEET_COLUMNS = [
  "CRAFT / POSITION",
  "BASE WAGE (BW)",
  "BILLED ST",
  "BILLED OT",
  "BILLED DT",
  "PD",
] as const;

export const LABOR_SHEET_FRINGE = "PD";
export const EAST_COAST_OT_NOTE = "East Coast clock: OT 1.5. Not DT after 12.";

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
  /** Uploaded billing ST / OT / DT. Never a stand-in for COMP BW. */
  billedSt?: number;
  billedOt?: number;
  billedDt?: number;
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

function optionalMoney(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export function newBuiltCraft(over: Partial<BuiltCraft> = {}): BuiltCraft {
  return {
    id: over.id || `craft-${Math.random().toString(36).slice(2, 8)}`,
    craft: over.craft || "",
    local: over.local,
    baseSt: Number.isFinite(over.baseSt) ? Number(over.baseSt) : 0,
    fringes: Array.isArray(over.fringes) ? over.fringes.map((row) => newFringeRow(row)) : [],
    billedSt: optionalMoney(over.billedSt),
    billedOt: optionalMoney(over.billedOt),
    billedDt: optionalMoney(over.billedDt),
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

/** Crew-costing dollars: uploaded billed ST/OT/DT when present, else the fringe stack. */
export function craftBillingRates(craft: BuiltCraft): CompositeReadout {
  const computed = compositeRates(craft);
  const billed = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? money(value) : fallback;
  return {
    st: billed(craft.billedSt, computed.st),
    ot: billed(craft.billedOt, computed.ot),
    dt: billed(craft.billedDt, computed.dt),
  };
}

export function craftPdAmount(craft: Pick<BuiltCraft, "fringes">): number | null {
  const row = (craft.fringes ?? []).find((item) => item.name.trim().toUpperCase() === LABOR_SHEET_FRINGE);
  if (!row || !Number.isFinite(row.amount) || row.amount <= 0) return null;
  return row.amount;
}

function normHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type SheetColumn = "craft" | "bw" | "st" | "ot" | "dt" | "pd";

function sheetColumn(value: string): SheetColumn | null {
  const key = normHeader(value);
  if (!key) return null;
  if (/(billed|billable).*\bst\b|\bst\b.*(billed|billable)/.test(key) || key === "st billable") return "st";
  if (/(billed|billable).*\bot\b|\bot\b.*(billed|billable)/.test(key)) return "ot";
  if (/(billed|billable).*\bdt\b|\bdt\b.*(billed|billable)|pt bill/.test(key)) return "dt";
  if (key === "bw" || /base (wage|rate)/.test(key) || key === "comp bw") return "bw";
  if (key === "pd" || key === "per diem") return "pd";
  if (/craft|position/.test(key)) return "craft";
  return null;
}

function splitSheetLine(line: string, delimiter: string) {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function parseSheetMoney(value: string): number | undefined {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned) return undefined;
  const next = Number(cleaned);
  return Number.isFinite(next) ? next : undefined;
}

/** CSV / TSV mapped onto Rate builder rows. Does not treat billed ST as COMP BW. */
export function parseRateBuilderSheet(text: string): BuiltCraft[] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.split("\n").filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitSheetLine(lines[0], delimiter).map(sheetColumn);
  if (!headers.some((col) => col === "craft")) return [];
  const crafts: BuiltCraft[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitSheetLine(line, delimiter);
    const picked: Partial<Record<SheetColumn, string>> = {};
    headers.forEach((col, index) => {
      if (!col) return;
      picked[col] = cells[index] ?? "";
    });
    const craft = (picked.craft || "").trim();
    if (!craft) continue;
    const baseSt = parseSheetMoney(picked.bw || "");
    const billedSt = parseSheetMoney(picked.st || "");
    const billedOt = parseSheetMoney(picked.ot || "");
    const billedDt = parseSheetMoney(picked.dt || "");
    const pd = parseSheetMoney(picked.pd || "");
    crafts.push(
      newBuiltCraft({
        craft,
        baseSt: baseSt ?? 0,
        billedSt,
        billedOt,
        billedDt,
        fringes:
          pd != null && pd > 0
            ? [newFringeRow({ name: LABOR_SHEET_FRINGE, method: "hour-worked", amount: pd, ridesOt: false })]
            : [],
      }),
    );
  }
  return crafts;
}
