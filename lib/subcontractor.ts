import { notifyEstimateSheets } from "./sheet-events.ts";

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const SUB_STORE_PREFIX = "hs_sub_v1:";
export const SUB_BOOK_KEY = "hs_sub_book_v1";

export const SUB_UNITS = ["LS", "hour", "day", "each"] as const;
export type SubUnit = (typeof SUB_UNITS)[number];

export const SUB_UNIT_LABEL: Record<SubUnit, string> = {
  LS: "LS",
  hour: "Hour",
  day: "Day",
  each: "Each",
};

export type SubRate = {
  id: string;
  vendor: string;
  scope: string;
  unit: SubUnit;
  rate: number;
};

export type SubLine = {
  id: string;
  vendor: string;
  scope: string;
  qty: number;
  unit: SubUnit;
  rate: number;
  bookId?: string;
};

export type SubSheet = {
  lines: SubLine[];
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function storeOf(store?: Store | null): Store | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function isSubUnit(value: unknown): value is SubUnit {
  return SUB_UNITS.includes(value as SubUnit);
}

export function emptySubSheet(): SubSheet {
  return { lines: [] };
}

export function emptySubBook(): SubRate[] {
  return [];
}

export function blankSubLine(): SubLine {
  return { id: uid("sb"), vendor: "", scope: "", qty: 1, unit: "LS", rate: 0 };
}

export function blankSubRate(): SubRate {
  return { id: uid("sr"), vendor: "", scope: "", unit: "LS", rate: 0 };
}

export function normalizeSubUnit(value: unknown): SubUnit {
  return isSubUnit(value) ? value : "LS";
}

export function lineQty(line: Pick<SubLine, "qty" | "unit">) {
  const qty = Number(line.qty);
  if (line.unit === "LS" && !(qty > 0)) return 1;
  return Math.max(0, Number.isFinite(qty) ? qty : 0);
}

export function lineAmount(line: Pick<SubLine, "qty" | "unit" | "rate">) {
  return lineQty(line) * Math.max(0, Number(line.rate) || 0);
}

export function applyTypedAmount(line: SubLine, amount: number): SubLine {
  const dollars = Math.max(0, Number(amount) || 0);
  const qty = lineQty({ ...line, qty: line.qty > 0 ? line.qty : 1 });
  return { ...line, qty, rate: qty > 0 ? dollars / qty : dollars };
}

export function applyBookRate(line: SubLine, rate: SubRate): SubLine {
  return {
    ...line,
    vendor: rate.vendor,
    scope: rate.scope,
    unit: rate.unit,
    rate: rate.rate,
    bookId: rate.id,
    qty: rate.unit === "LS" && !(line.qty > 0) ? 1 : line.qty,
  };
}

export function bookLabel(rate: SubRate) {
  const name = rate.vendor.trim() || "Sub";
  const scope = rate.scope.trim();
  return scope ? `${name} — ${scope}` : name;
}

export function subcontractorTotal(sheet: SubSheet | null | undefined) {
  if (!sheet || !Array.isArray(sheet.lines)) return 0;
  return sheet.lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

export function normalizeSubLine(raw: Partial<SubLine> | null | undefined): SubLine {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sb"),
    vendor: typeof raw?.vendor === "string" ? raw.vendor : "",
    scope: typeof raw?.scope === "string" ? raw.scope : "",
    qty: Number(raw?.qty) || 0,
    unit: normalizeSubUnit(raw?.unit),
    rate: Math.max(0, Number(raw?.rate) || 0),
    bookId: typeof raw?.bookId === "string" && raw.bookId ? raw.bookId : undefined,
  };
}

export function normalizeSubSheet(raw: Partial<SubSheet> | null | undefined): SubSheet {
  return {
    lines: Array.isArray(raw?.lines) ? raw.lines.map((line) => normalizeSubLine(line)) : [],
  };
}

export function normalizeSubRate(raw: Partial<SubRate> | null | undefined): SubRate {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("sr"),
    vendor: typeof raw?.vendor === "string" ? raw.vendor : "",
    scope: typeof raw?.scope === "string" ? raw.scope : "",
    unit: normalizeSubUnit(raw?.unit),
    rate: Math.max(0, Number(raw?.rate) || 0),
  };
}

export function normalizeSubBook(raw: unknown): SubRate[] {
  if (!Array.isArray(raw)) return emptySubBook();
  return raw.map((row) => normalizeSubRate(row as Partial<SubRate>));
}

export function readSubSheet(key: string, store?: Store | null): SubSheet {
  const target = storeOf(store);
  if (!target || !key) return emptySubSheet();
  try {
    const raw = target.getItem(`${SUB_STORE_PREFIX}${key}`);
    if (!raw) return emptySubSheet();
    return normalizeSubSheet(JSON.parse(raw) as Partial<SubSheet>);
  } catch {
    return emptySubSheet();
  }
}

export function writeSubSheet(key: string, sheet: SubSheet, store?: Store | null) {
  const target = storeOf(store);
  if (!target || !key) return;
  try {
    target.setItem(`${SUB_STORE_PREFIX}${key}`, JSON.stringify(normalizeSubSheet(sheet)));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

export function readSubBook(store?: Store | null): SubRate[] {
  const target = storeOf(store);
  if (!target) return emptySubBook();
  try {
    const raw = target.getItem(SUB_BOOK_KEY);
    if (!raw) return emptySubBook();
    return normalizeSubBook(JSON.parse(raw));
  } catch {
    return emptySubBook();
  }
}

export function writeSubBook(book: SubRate[], store?: Store | null) {
  const target = storeOf(store);
  if (!target) return;
  try {
    target.setItem(SUB_BOOK_KEY, JSON.stringify(normalizeSubBook(book)));
  } catch {
    // keep the previous copy
  }
}
