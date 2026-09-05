export const BUILDERS_RISK_YATES = 0.00834;
export const ESTIMATE_MARKUP_RATE = 0.065;
export const YATES_MARKUP_RATE = 0.1;
export const ESTIMATE_MARKUP_LABEL = "6.5% markup";

/** RRFF / COMP commercial fee. P66 PCA plants 6.5%. Yates materials/rentals/subs 10%. Not B-2 Cost+6%. */
export function commercialMarkupRate(client = "", site = ""): number {
  if (isYatesGeorgiaJob(client, site)) return YATES_MARKUP_RATE;
  return ESTIMATE_MARKUP_RATE;
}

export function commercialMarkupLabel(client = "", site = ""): string {
  const pct = commercialMarkupRate(client, site) * 100;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return `${shown}% markup`;
}

export type EstimateTotalLine = {
  id: string;
  label: string;
  amount: number;
};

export type EstimateTotalBreakdown = {
  lines: EstimateTotalLine[];
  hours: number;
  total: number;
};

export function parseDeskDollars(value: string | number | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  if (!value) return 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function isP66Job(client = "", site = ""): boolean {
  const hay = `${client} ${site}`.toLowerCase();
  return /phillips\s*66|\bp66\b|ironwood/.test(hay);
}

export function isYatesGeorgiaJob(client = "", site = ""): boolean {
  if (isP66Job(client, site)) return false;
  const hay = `${client} ${site}`.toLowerCase();
  return /yates|georgia power|piedmont power|ridge station/.test(hay);
}

export function buildersRiskPct(client = "", site = ""): number {
  if (isP66Job(client, site)) return 0;
  if (isYatesGeorgiaJob(client, site)) return BUILDERS_RISK_YATES;
  return 0;
}

export function moneyLines(candidates: EstimateTotalLine[]): EstimateTotalLine[] {
  return candidates.filter((line) => line.amount > 0);
}

/** Contingency / CBA / M.O.R.E. — M.O.R.E. can be a credit. */
export function signedMoneyLines(candidates: EstimateTotalLine[]): EstimateTotalLine[] {
  return candidates.filter((line) => line.amount !== 0);
}

/** Base for the locked rail markup. Crew, Staff, owned tools, per diem, and travel stay out. */
export function markupBase(input: { subcontractor?: number; thirdParty?: number; misc?: number }) {
  return (
    parseDeskDollars(input.subcontractor) + parseDeskDollars(input.thirdParty) + parseDeskDollars(input.misc)
  );
}

export function estimateMarkupDollars(input: {
  subcontractor?: number;
  thirdParty?: number;
  misc?: number;
  client?: string;
  site?: string;
}) {
  const rate = commercialMarkupRate(input.client, input.site);
  return Math.round(markupBase(input) * rate * 100) / 100;
}

export function estimateTotalBreakdown(input: {
  labor?: number;
  equipment?: number;
  subcontractor?: number;
  markup?: number;
  otherCost?: number;
  changeOrders?: number;
  hours?: number;
  client?: string;
  site?: string;
  extras?: EstimateTotalLine[];
}): EstimateTotalBreakdown {
  const base = moneyLines([
    { id: "labor", label: "Labor", amount: parseDeskDollars(input.labor) },
    { id: "equipment", label: "Equipment", amount: parseDeskDollars(input.equipment) },
    { id: "subcontractor", label: "Subcontractor", amount: parseDeskDollars(input.subcontractor) },
    { id: "other", label: "Other Cost", amount: parseDeskDollars(input.otherCost) },
    { id: "change-orders", label: "Change orders", amount: parseDeskDollars(input.changeOrders) },
    { id: "markup", label: commercialMarkupLabel(input.client, input.site), amount: parseDeskDollars(input.markup) },
  ]);
  const extras = signedMoneyLines(input.extras ?? []);
  const subtotal = [...base, ...extras].reduce((sum, line) => sum + line.amount, 0);
  const risk = Math.round(Math.max(0, subtotal) * buildersRiskPct(input.client, input.site) * 100) / 100;
  const lines = risk > 0 ? [...base, ...extras, { id: "risk", label: "Builder's risk", amount: risk }] : [...base, ...extras];
  return {
    lines,
    hours: Math.max(0, input.hours ?? 0),
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}
