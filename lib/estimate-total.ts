export const BUILDERS_RISK_YATES = 0.00834;

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

export function estimateTotalBreakdown(input: {
  labor?: number;
  equipment?: number;
  markup?: number;
  otherCost?: number;
  changeOrders?: number;
  hours?: number;
  client?: string;
  site?: string;
}): EstimateTotalBreakdown {
  const base = moneyLines([
    { id: "labor", label: "Labor", amount: parseDeskDollars(input.labor) },
    { id: "equipment", label: "Equipment", amount: parseDeskDollars(input.equipment) },
    { id: "other", label: "Other Cost", amount: parseDeskDollars(input.otherCost) },
    { id: "change-orders", label: "Change orders", amount: parseDeskDollars(input.changeOrders) },
    { id: "markup", label: "Markup", amount: parseDeskDollars(input.markup) },
  ]);
  const subtotal = base.reduce((sum, line) => sum + line.amount, 0);
  const risk = Math.round(subtotal * buildersRiskPct(input.client, input.site) * 100) / 100;
  const lines = risk > 0 ? [...base, { id: "risk", label: "Builder's risk", amount: risk }] : base;
  return {
    lines,
    hours: Math.max(0, input.hours ?? 0),
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}
