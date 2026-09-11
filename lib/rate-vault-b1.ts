/**
 * Exhibit B-1 craft-sheet burden + fringe math.
 *
 * Wood River RRFF hall sheets carry Pay Tax *, Ins *, Misc *, O/H, Profit,
 * and Fringes Subtotal. Dollars imply % of taxable base wage (or are typed
 * $/hr). Do not substitute a site-wide Illinois composite. Burden Summary
 * pivots in the official book can be empty — craft-sheet columns win.
 */

import {
  RATE_VAULT_B1_BURDEN_FAMILIES,
  type RateVaultB1LineControls,
  type RateVaultBurdenFamily,
  type RateVaultBurdenLine,
  type RateVaultBurdenUnit,
  type RateVaultCraftSheet,
  type RateVaultFringeLine,
  type RateVaultPreviewPackage,
  type RateVaultPreviewRow,
} from "./rate-vault.ts";
import {
  b1BucketFactor,
  classifyRateVaultB1Base,
  classifyRateVaultB1RateKind,
  inferRateVaultB1Controls,
  inferRateVaultB1CraftType,
  inferRateVaultB1RateClass,
  normalizeRateVaultB1Controls,
  unitFromB1RateKind,
  type RateVaultB1Bucket,
} from "./rate-vault-b1-options.ts";

export const RATE_VAULT_B1_PAY_TAX = [
  { id: "fica-mc", label: "Pay Tax FICA-MC", ratePct: 7.65, note: "Social Security + Medicare — % of taxable BW" },
  { id: "fui", label: "Pay Tax FUI", ratePct: 0.6, note: "Federal unemployment — % of taxable BW" },
  { id: "sui", label: "Pay Tax SUI", ratePct: 8.55, note: "B-1 SUI on every Wood River RRFF hall sheet — not a placeholder Illinois SUTA" },
] as const;

export const RATE_VAULT_B1_INS_LABELS = [
  { id: "wc", label: "Ins W/C" },
  { id: "emp-liab", label: "Ins Emp Liab" },
  { id: "gen-liab", label: "Ins Gen Liab" },
  { id: "umbrella", label: "Ins Umbrella" },
  { id: "other", label: "Ins Other" },
] as const;

export const RATE_VAULT_B1_MISC_LABELS = [
  { id: "small", label: "Misc Small" },
  { id: "cons", label: "Misc Cons" },
  { id: "ppe", label: "Misc PPE" },
  { id: "other", label: "Misc Other" },
] as const;

const MONEY_TOL = 0.03;

export function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function impliedPct(amountHr: number, wage: number) {
  if (!wage) return 0;
  return money((amountHr / wage) * 100);
}

export function amountFromPct(ratePct: number, wage: number) {
  return money((wage * ratePct) / 100);
}

export function isRateVaultBurdenFamily(value: unknown): value is RateVaultBurdenFamily {
  return typeof value === "string" && RATE_VAULT_B1_BURDEN_FAMILIES.some((row) => row.id === value);
}

export function inferBurdenFamily(label: string): RateVaultBurdenFamily {
  const hay = label.trim();
  if (/pay\s*tax|fica|fui|sui|suta/i.test(hay)) return "pay-tax";
  if (/ins\b|w\/c|workers?\s*comp|liab|umbrella/i.test(hay)) return "insurance";
  if (/misc|small\s*tool|consum|ppe/i.test(hay)) return "misc";
  if (/^o\/h$|overhead/i.test(hay)) return "oh";
  if (/profit|fee/i.test(hay)) return "profit";
  return "misc";
}

export function inferBurdenUnit(line: Pick<RateVaultBurdenLine, "unit" | "ratePct" | "amountHr" | "family">): RateVaultBurdenUnit {
  if (line.unit === "pct-taxable" || line.unit === "amount-hr") return line.unit;
  if (line.family === "pay-tax" || line.family === "insurance") return "pct-taxable";
  return "amount-hr";
}

export function burdenLineAmount(line: RateVaultBurdenLine, wage: number) {
  const unit = inferBurdenUnit(line);
  if (unit === "pct-taxable") return amountFromPct(line.ratePct, wage);
  return money(line.amountHr);
}

export function burdenLinePct(line: RateVaultBurdenLine, wage: number) {
  const unit = inferBurdenUnit(line);
  if (unit === "pct-taxable") return money(line.ratePct);
  return impliedPct(line.amountHr, wage);
}

export function withB1Controls<T extends RateVaultB1LineControls>(line: T, over: Partial<RateVaultB1LineControls> = {}): T {
  const named = line as T & { unit?: string; label?: string; craft?: string | null; sheet?: string | null; note?: string };
  const next = normalizeRateVaultB1Controls({
    ...named,
    ...over,
    unit: named.unit || (over.rateKind === "%" ? "pct-taxable" : "amount-hr"),
    label: named.label,
    craft: named.craft,
    sheet: named.sheet,
    note: named.note,
  });
  return { ...line, ...next };
}

export function fringeLineAmount(line: RateVaultFringeLine, wage: number) {
  const kind = classifyRateVaultB1RateKind(line.rateKind || (line.unit === "pct-taxable" ? "%" : "$"));
  if (kind === "%" || line.unit === "pct-taxable") return amountFromPct(line.ratePct, wage);
  return money(line.amountHr);
}

export function craftSheetFringesSubtotal(sheet: Pick<RateVaultCraftSheet, "fringes">, wage: number) {
  return money(sheet.fringes.reduce((sum, line) => sum + fringeLineAmount(line, wage), 0));
}

export function craftSheetFamilyAmount(
  sheet: Pick<RateVaultCraftSheet, "burden">,
  family: RateVaultBurdenFamily,
  wage: number,
) {
  return money(
    sheet.burden.filter((line) => line.family === family).reduce((sum, line) => sum + burdenLineAmount(line, wage), 0),
  );
}

export function craftSheetBurdenSubtotal(sheet: Pick<RateVaultCraftSheet, "burden">, wage: number) {
  return money(sheet.burden.reduce((sum, line) => sum + burdenLineAmount(line, wage), 0));
}

export function craftSheetBurdenPct(sheet: RateVaultCraftSheet, wage = sheet.representativeWage) {
  return impliedPct(craftSheetBurdenSubtotal(sheet, wage), wage);
}

function wageForBucket(baseSt: number, bucket: RateVaultB1Bucket) {
  if (bucket === "ot") return money(baseSt * 1.5);
  if (bucket === "dt") return money(baseSt * 2);
  return money(baseSt);
}

function controlsFor(line: RateVaultB1LineControls & { unit?: RateVaultBurdenUnit; ridesOt?: boolean; note?: string; label?: string }) {
  return inferRateVaultB1Controls(line);
}

export function fringeOnBucket(line: RateVaultFringeLine, baseSt: number, bucket: RateVaultB1Bucket) {
  const controls = controlsFor(line);
  const factor = b1BucketFactor(controls, bucket);
  if (factor === 0) return 0;
  const kind = classifyRateVaultB1RateKind(controls.rateKind || (line.unit === "pct-taxable" ? "%" : "$"));
  if (kind === "%" || line.unit === "pct-taxable") {
    const taxBw = classifyRateVaultB1Base(controls.base) === "Tax BW (P)";
    const wage = taxBw && factor !== 1 ? wageForBucket(baseSt, bucket) : money(baseSt);
    const amount = amountFromPct(line.ratePct, wage);
    if (taxBw && factor !== 1) return amount;
    return money(amount * factor);
  }
  return money((line.amountHr || 0) * factor);
}

export function burdenOnBucket(line: RateVaultBurdenLine, baseSt: number, bucket: RateVaultB1Bucket) {
  const controls = controlsFor(line);
  const factor = b1BucketFactor(controls, bucket);
  if (factor === 0) return 0;
  const kind = classifyRateVaultB1RateKind(controls.rateKind || (inferBurdenUnit(line) === "pct-taxable" ? "%" : "$"));
  if (kind === "%" || inferBurdenUnit(line) === "pct-taxable") {
    const taxBw = classifyRateVaultB1Base(controls.base) === "Tax BW (P)";
    const wage = taxBw && factor !== 1 ? wageForBucket(baseSt, bucket) : money(baseSt);
    const amount = burdenLineAmount({ ...line, unit: "pct-taxable" }, wage);
    if (taxBw && factor !== 1) return amount;
    return money(amount * factor);
  }
  return money(burdenLineAmount(line, baseSt) * factor);
}

export function b1RatesForCraftSheet(
  sheet: RateVaultCraftSheet,
  baseSt: number,
): { wage: number; fringe: number; burden: number; bill: number; billOt: number; billDt: number } {
  const wage = money(baseSt);
  const fringe = craftSheetFringesSubtotal(sheet, wage);
  const burden = craftSheetBurdenSubtotal(sheet, wage);
  const fringeOt = money(sheet.fringes.reduce((sum, line) => sum + fringeOnBucket(line, wage, "ot"), 0));
  const fringeDt = money(sheet.fringes.reduce((sum, line) => sum + fringeOnBucket(line, wage, "dt"), 0));
  const burdenOt = money(sheet.burden.reduce((sum, line) => sum + burdenOnBucket(line, wage, "ot"), 0));
  const burdenDt = money(sheet.burden.reduce((sum, line) => sum + burdenOnBucket(line, wage, "dt"), 0));
  const wageOt = wageForBucket(wage, "ot");
  const wageDt = wageForBucket(wage, "dt");
  return {
    wage,
    fringe,
    burden,
    bill: money(wage + fringe + burden),
    billOt: money(wageOt + fringeOt + burdenOt),
    billDt: money(wageDt + fringeDt + burdenDt),
  };
}

export function applyB1ToPreviewRow(row: RateVaultPreviewRow, sheet: RateVaultCraftSheet | null | undefined): RateVaultPreviewRow {
  if (!sheet) return row;
  const next = b1RatesForCraftSheet(sheet, row.wage);
  return {
    ...row,
    fringe: next.fringe,
    burden: next.burden,
    billRate: next.bill,
    billOt: next.billOt,
    billDt: next.billDt,
  };
}

export function findCraftSheetForRow(
  sheets: readonly RateVaultCraftSheet[],
  row: Pick<RateVaultPreviewRow, "sheet" | "craft" | "local" | "lane" | "group">,
) {
  return (
    sheets.find((item) => item.sheet === row.sheet) ||
    sheets.find((item) => item.group === row.group) ||
    sheets.find((item) => item.craft === row.craft && item.local === row.local && item.lane === row.lane) ||
    sheets.find((item) => item.craft === row.craft && item.lane === row.lane) ||
    null
  );
}

export function applyB1ToPreviewRows(rows: readonly RateVaultPreviewRow[], sheets: readonly RateVaultCraftSheet[]) {
  return rows.map((row) => applyB1ToPreviewRow(row, findCraftSheetForRow(sheets, row)));
}

export function flattenB1Burden(sheets: readonly RateVaultCraftSheet[]): RateVaultBurdenLine[] {
  const out: RateVaultBurdenLine[] = [];
  const seenPayTax = new Set<string>();
  for (const sheet of sheets) {
    for (const line of sheet.burden) {
      if (line.family === "pay-tax") {
        if (seenPayTax.has(line.label)) continue;
        seenPayTax.add(line.label);
        out.push({ ...line, craft: null, local: null, sheet: null, note: line.note || "Same Pay Tax % on every Wood River RRFF hall sheet" });
        continue;
      }
      out.push({ ...line });
    }
  }
  return out;
}

export function flattenB1Fringes(sheets: readonly RateVaultCraftSheet[]): RateVaultFringeLine[] {
  return sheets.flatMap((sheet) =>
    sheet.fringes
      .filter((line) => fringeLineAmount(line, sheet.representativeWage) > 0 || line.unit === "pct-taxable")
      .map((line) => ({ ...line, craft: sheet.craft, local: sheet.local, sheet: sheet.sheet })),
  );
}

/** Rebuild hall cards from a flat Burden / Fringes export when craftSheets were not stored. */
export function craftSheetsFromFlat(
  burden: readonly RateVaultBurdenLine[],
  fringes: readonly RateVaultFringeLine[],
  rows: readonly RateVaultPreviewRow[],
): RateVaultCraftSheet[] {
  const hallScoped =
    fringes.some((line) => Boolean(line.sheet)) ||
    burden.some((line) => Boolean(line.sheet) && line.family !== "pay-tax");
  if (!hallScoped) return [];
  const names = new Set<string>();
  for (const line of fringes) if (line.sheet) names.add(line.sheet);
  for (const line of burden) if (line.sheet && line.family !== "pay-tax") names.add(line.sheet);
  const payTax = burden.filter((line) => line.family === "pay-tax");
  return [...names].map((sheet, index) => {
    const row = rows.find((item) => item.sheet === sheet);
    const hallFringes = fringes.filter((line) => line.sheet === sheet);
    const hallBurden = [
      ...payTax.map((line) => ({
        ...line,
        id: `${sheet}-${line.id}`,
        craft: row?.craft ?? line.craft,
        local: row?.local ?? line.local,
        sheet,
      })),
      ...burden.filter((line) => line.sheet === sheet && line.family !== "pay-tax"),
    ];
    const craft = row?.craft || hallFringes[0]?.craft || "Craft";
    return {
      id: `hall-${index + 1}`,
      sheet,
      craft,
      local: row?.local ?? hallFringes[0]?.local ?? null,
      lane: row?.lane ?? (/merit/i.test(sheet) ? "merit" : "union"),
      group: row?.group || sheet,
      revision: null,
      effective: null,
      rateClass: inferRateVaultB1RateClass({ lane: row?.lane, craft, sheet, group: row?.group || sheet }),
      craftType: inferRateVaultB1CraftType({ craft, sheet, group: row?.group || sheet }),
      representativeWage: row?.wage ?? 0,
      representativePosition: row?.position || craft,
      fringes: hallFringes,
      burden: hallBurden,
    };
  });
}

export function hallFringeSubtotal(
  fringes: readonly RateVaultFringeLine[],
  sheet: string,
  wage: number,
) {
  return money(
    fringes
      .filter((line) => line.sheet === sheet)
      .reduce((sum, line) => sum + fringeLineAmount(line, wage), 0),
  );
}

/** Pay tax is site-wide on the Burden sheet (blank Hall). Hall Ins / Misc / O/H / Profit add on. */
export function hallBurdenSubtotal(
  burden: readonly RateVaultBurdenLine[],
  sheet: string,
  wage: number,
) {
  return money(
    burden
      .filter((line) => line.family === "pay-tax" || line.sheet === sheet)
      .reduce((sum, line) => sum + burdenLineAmount(line, wage), 0),
  );
}

export function ripplePreviewRowsFromB1Sheets(
  rows: readonly RateVaultPreviewRow[],
  burden: readonly RateVaultBurdenLine[],
  fringes: readonly RateVaultFringeLine[],
  craftSheets: readonly RateVaultCraftSheet[],
  options: { rippleFringe: boolean; rippleBurden: boolean } = { rippleFringe: true, rippleBurden: true },
) {
  return rows.map((row) => {
    const fringe = options.rippleFringe ? hallFringeSubtotal(fringes, row.sheet, row.wage) : row.fringe;
    const nextBurden = options.rippleBurden ? hallBurdenSubtotal(burden, row.sheet, row.wage) : row.burden;
    const sheet = findCraftSheetForRow(craftSheets, row);
    const rates = sheet ? b1RatesForCraftSheet({ ...sheet, fringes: sheet.fringes, burden: sheet.burden }, row.wage) : null;
    return {
      ...row,
      fringe,
      burden: nextBurden,
      billRate: money(row.wage + fringe + nextBurden),
      billOt: options.rippleFringe || options.rippleBurden ? rates?.billOt ?? row.billOt : row.billOt,
      billDt: options.rippleFringe || options.rippleBurden ? rates?.billDt ?? row.billDt : row.billDt,
    };
  });
}

export function b1PayTaxPct(preview: Pick<RateVaultPreviewPackage, "burden"> | null) {
  if (!preview) return 0;
  return money(preview.burden.filter((line) => line.family === "pay-tax").reduce((sum, line) => sum + line.ratePct, 0));
}

export function b1FamilyAmount(lines: readonly RateVaultBurdenLine[], family: RateVaultBurdenFamily, wage: number) {
  return money(lines.filter((line) => line.family === family).reduce((sum, line) => sum + burdenLineAmount(line, wage), 0));
}

export function previewRowAddsUpB1(row: Pick<RateVaultPreviewRow, "wage" | "fringe" | "burden" | "billRate">) {
  return Math.abs(row.wage + row.fringe + row.burden - row.billRate) <= MONEY_TOL;
}

function burdenControls(ridesOt: boolean, unit: RateVaultBurdenUnit): RateVaultB1LineControls & { ridesOt: boolean } {
  return normalizeRateVaultB1Controls({
    unit,
    ridesOt,
    rateKind: unit === "pct-taxable" ? "%" : "$",
    base: unit === "pct-taxable" ? "Tax BW (P)" : "BW (K)",
    calcSt: "ST",
    calcOt: ridesOt ? "OT" : "ST",
    calcDt: ridesOt ? "DT" : "ST",
    rideSt: true,
    rideOt: true,
    rideDt: true,
  });
}

export function payTaxLines(sheetId: string, ridesOt = true): RateVaultBurdenLine[] {
  return RATE_VAULT_B1_PAY_TAX.map((row) => ({
    id: `${sheetId}-${row.id}`,
    label: row.label,
    family: "pay-tax" as const,
    unit: "pct-taxable" as const,
    ratePct: row.ratePct,
    amountHr: 0,
    note: row.note,
    craft: null,
    local: null,
    sheet: null,
    ...burdenControls(ridesOt, "pct-taxable"),
  }));
}

export function insLines(
  sheetId: string,
  rates: Partial<Record<(typeof RATE_VAULT_B1_INS_LABELS)[number]["id"], number>>,
  craft: string,
  local: string | null,
  sheet: string,
): RateVaultBurdenLine[] {
  return RATE_VAULT_B1_INS_LABELS.map((row) => ({
    id: `${sheetId}-${row.id}`,
    label: row.label,
    family: "insurance" as const,
    unit: "pct-taxable" as const,
    ratePct: money(rates[row.id] ?? 0),
    amountHr: 0,
    note: "B-1 Ins column — % of taxable BW. Hall sheets vary; empty pivot is not the source.",
    craft,
    local,
    sheet,
    ...burdenControls(false, "pct-taxable"),
  }));
}

export function miscLines(
  sheetId: string,
  amounts: Partial<Record<(typeof RATE_VAULT_B1_MISC_LABELS)[number]["id"], number>>,
  craft: string,
  local: string | null,
  sheet: string,
): RateVaultBurdenLine[] {
  return RATE_VAULT_B1_MISC_LABELS.map((row) => ({
    id: `${sheetId}-misc-${row.id}`,
    label: row.label,
    family: "misc" as const,
    unit: "amount-hr" as const,
    ratePct: 0,
    amountHr: money(amounts[row.id] ?? 0),
    note: "B-1 Misc column — $/hr on the craft sheet.",
    craft,
    local,
    sheet,
    ...burdenControls(false, "amount-hr"),
  }));
}

export function supplierLines(
  sheetId: string,
  oh: number,
  profit: number,
  craft: string,
  local: string | null,
  sheet: string,
): RateVaultBurdenLine[] {
  return [
    {
      id: `${sheetId}-oh`,
      label: "O/H",
      family: "oh" as const,
      unit: "amount-hr" as const,
      ratePct: 0,
      amountHr: money(oh),
      note: "B-1 O/H — separate from Profit.",
      craft,
      local,
      sheet,
      ...burdenControls(false, "amount-hr"),
    },
    {
      id: `${sheetId}-profit`,
      label: "Profit",
      family: "profit" as const,
      unit: "amount-hr" as const,
      ratePct: 0,
      amountHr: money(profit),
      note: "B-1 Profit — separate from O/H.",
      craft,
      local,
      sheet,
      ...burdenControls(false, "amount-hr"),
    },
  ];
}

export function fringeLine(input: {
  id: string;
  label: string;
  amountHr?: number;
  ratePct?: number;
  unit?: RateVaultBurdenUnit;
  craft: string;
  local: string | null;
  sheet: string;
  ridesOt?: boolean;
  note?: string;
  rateKind?: string;
  base?: string;
  calcSt?: string;
  calcOt?: string;
  calcDt?: string;
  mult?: number | null;
  rideSt?: boolean;
  rideOt?: boolean;
  rideDt?: boolean;
  amountOt?: number | null;
  rideFlagSt?: string | boolean | null;
  rideFlagOt?: string | boolean | null;
  rideFlagDt?: string | boolean | null;
}): RateVaultFringeLine {
  const unit = input.unit ?? (input.ratePct ? "pct-taxable" : "amount-hr");
  const meritHealth =
    /health/i.test(input.label) && /merit/i.test(`${input.craft} ${input.sheet}`) && input.ridesOt !== true;
  const controls = normalizeRateVaultB1Controls({
    ...input,
    unit,
    rateKind: input.rateKind || (unit === "pct-taxable" ? "%" : "$"),
    base: input.base || (unit === "pct-taxable" ? "Tax BW (P)" : "BW (K)"),
    calcOt: input.calcOt || (meritHealth ? "ST-ONLY" : undefined),
    calcDt: input.calcDt || (meritHealth ? "ST-ONLY" : undefined),
    rideOt: input.rideOt ?? (meritHealth ? false : undefined),
    rideDt: input.rideDt ?? (meritHealth ? false : undefined),
    note:
      input.note ||
      (meritHealth
        ? "Merit Health — ST-ONLY / Ride OT N on the hall sheet (does not pay on OT/DT)."
        : "B-1 fringe — $/hr on the hall sheet (Fringes Subtotal)."),
  });
  return {
    id: input.id,
    label: input.label,
    amountHr: money(input.amountHr ?? 0),
    ratePct: money(input.ratePct ?? 0),
    unit,
    craft: input.craft,
    local: input.local,
    sheet: input.sheet,
    note:
      input.note ||
      (meritHealth
        ? "Merit Health — ST-ONLY / Ride OT N on the hall sheet (does not pay on OT/DT)."
        : "B-1 fringe — $/hr on the hall sheet (Fringes Subtotal)."),
    ...controls,
  };
}

export function applyB1LineControlsToPreview(
  preview: RateVaultPreviewPackage,
  lineId: string,
  patch: Partial<RateVaultB1LineControls>,
): RateVaultPreviewPackage {
  const applyLine = <T extends RateVaultFringeLine | RateVaultBurdenLine>(line: T): T => {
    if (line.id !== lineId) return withB1Controls(line);
    const next = { ...line, ...patch };
    if (patch.rateKind) next.unit = unitFromB1RateKind(patch.rateKind);
    return withB1Controls(next);
  };
  const craftSheets = preview.craftSheets.map((sheet) => ({
    ...sheet,
    fringes: sheet.fringes.map(applyLine),
    burden: sheet.burden.map(applyLine),
  }));
  return {
    ...preview,
    craftSheets,
    fringes: preview.fringes.map(applyLine),
    burden: preview.burden.map(applyLine),
    rows: applyB1ToPreviewRows(preview.rows, craftSheets),
  };
}

export function craftSheet(input: Omit<RateVaultCraftSheet, "burden" | "fringes" | "rateClass" | "craftType"> & {
  rateClass?: string;
  craftType?: string;
  fringes: RateVaultFringeLine[];
  ins?: Partial<Record<(typeof RATE_VAULT_B1_INS_LABELS)[number]["id"], number>>;
  misc?: Partial<Record<(typeof RATE_VAULT_B1_MISC_LABELS)[number]["id"], number>>;
  oh?: number;
  profit?: number;
  burdenExtra?: RateVaultBurdenLine[];
}): RateVaultCraftSheet {
  const burden = [
    ...payTaxLines(input.id),
    ...insLines(input.id, input.ins ?? {}, input.craft, input.local, input.sheet),
    ...miscLines(input.id, input.misc ?? {}, input.craft, input.local, input.sheet),
    ...supplierLines(input.id, input.oh ?? 0, input.profit ?? 0, input.craft, input.local, input.sheet),
    ...(input.burdenExtra ?? []),
  ];
  return {
    ...input,
    rateClass: inferRateVaultB1RateClass(input),
    craftType: inferRateVaultB1CraftType(input),
    fringes: input.fringes.map((line) => ({ ...line, craft: input.craft, local: input.local, sheet: input.sheet })),
    burden: burden.map((line) => ({
      ...line,
      craft: line.family === "pay-tax" ? input.craft : line.craft,
      local: line.family === "pay-tax" ? input.local : line.local,
      sheet: line.family === "pay-tax" ? input.sheet : line.sheet,
    })),
  };
}

export function looksLikePlaceholderIllinoisComposite(lines: readonly Pick<RateVaultBurdenLine, "label" | "ratePct">[]) {
  const hay = lines.map((line) => `${line.label}:${line.ratePct}`).join(" | ");
  return /suta\s*[—-]\s*illinois/i.test(hay) || (/14\.2/.test(hay) && /8\.5/.test(hay) && /1\.85/.test(hay));
}
