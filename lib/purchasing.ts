/**
 * Purchasing Control Center — Day-1 on the live estimate pack.
 * Execute ledger for small tools / consumables / related buys the estimate sold.
 * Not AP, not barcode inventory, not a second vault. Filename metadata only.
 * Vault is source of truth after hydrate — same notify path as Cost report / ECR.
 */
import { parseDeskNumber, parseLooseDate, todayYmd } from "./cost-report.ts";
import { lookupShahanEquipment } from "./shahan-wood-river.ts";
import { readEquipmentSheet, type EquipmentSheet } from "./equipment-sheet.ts";
import { miscAmount, readOtherCost, type OtherCostSheet } from "./other-cost.ts";
import { PURCHASING_STORE_PREFIX } from "./purchasing-prefix.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export { PURCHASING_STORE_PREFIX };
export const PURCHASING_TAB_ID = "purchasing";
export const PURCHASING_TAB_LABEL = "Purchasing";
export const PURCHASING_NOUN = "Purchasing Control Center";
export const PURCHASING_LIVE_NOTE =
  "Buys on this job — small tools, consumables, materials, rental, other. Totals come from lines you type. No invented dollars.";

export const PURCHASING_PARKED = [
  "AP / three-way match",
  "Invoice PDF vault upload",
  "Barcode inventory",
  "Auto-email vendor",
  "PPR chart purchases slice",
] as const;

export const PURCHASE_CATEGORIES = [
  { id: "small-tools", label: "Small tools" },
  { id: "consumables", label: "Consumables" },
  { id: "materials", label: "Materials" },
  { id: "rental", label: "Rental" },
  { id: "other", label: "Other" },
] as const;

export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number]["id"];

export const PURCHASE_STATUSES = [
  { id: "open", label: "Open" },
  { id: "received", label: "Received" },
  { id: "invoiced", label: "Invoiced" },
  { id: "charged", label: "Charged" },
] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]["id"];

export const PURCHASE_TIE_KINDS = [
  { id: "misc", label: "Misc" },
  { id: "equipment-large", label: "Equipment" },
  { id: "equipment-3p", label: "3rd party rental" },
  { id: "other-cost", label: "Other Cost" },
] as const;

export type PurchaseTieKind = (typeof PURCHASE_TIE_KINDS)[number]["id"];

export type PurchaseLine = {
  id: string;
  date: string;
  vendor: string;
  poNumber: string;
  description: string;
  category: PurchaseCategory;
  amount: number;
  status: PurchaseStatus;
  /** Free label when a pack line is not linked. */
  estimateTieLabel: string;
  estimateTieKind: PurchaseTieKind | "";
  estimateTieId: string;
  /** Filename only — Day-1 does not upload a new vault. */
  attachmentName: string;
};

export type PurchasingTotals = {
  grand: number;
  byCategory: Record<PurchaseCategory, number>;
  toolsConsumables: number;
  materials: number;
  rental: number;
  other: number;
  byStatus: Record<PurchaseStatus, number>;
  lineCount: number;
};

export type PurchasingVsBudget = {
  toolsConsumables: number;
  miscBudget: number;
  variance: number;
  hasMiscBudget: boolean;
};

export type PurchasingSnapshot = {
  id: string;
  statusDate: string;
  savedAt: number;
  notes: string;
  totals: PurchasingTotals;
  vsBudget: PurchasingVsBudget;
  lineCount: number;
};

export type PurchasingBook = {
  statusDate: string;
  notes: string;
  lines: PurchaseLine[];
  snapshots: PurchasingSnapshot[];
};

export type PurchaseTieOption = {
  kind: PurchaseTieKind;
  id: string;
  label: string;
};

export type PurchasingCostSlice = {
  grandTotal: number;
  toolsConsumables: number;
  byCategory: Record<PurchaseCategory, number>;
  vsBudget: PurchasingVsBudget;
  lineCount: number;
};

export type PurchasingStoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function filledText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function purchaseCategoryLabel(id: string) {
  return PURCHASE_CATEGORIES.find((row) => row.id === id)?.label ?? id;
}

export function purchaseStatusLabel(id: string) {
  return PURCHASE_STATUSES.find((row) => row.id === id)?.label ?? id;
}

function asCategory(value: unknown): PurchaseCategory {
  return PURCHASE_CATEGORIES.some((row) => row.id === value) ? (value as PurchaseCategory) : "other";
}

function asStatus(value: unknown): PurchaseStatus {
  return PURCHASE_STATUSES.some((row) => row.id === value) ? (value as PurchaseStatus) : "open";
}

function asTieKind(value: unknown): PurchaseTieKind | "" {
  return PURCHASE_TIE_KINDS.some((row) => row.id === value) ? (value as PurchaseTieKind) : "";
}

export function emptyPurchasingTotals(): PurchasingTotals {
  return {
    grand: 0,
    byCategory: {
      "small-tools": 0,
      consumables: 0,
      materials: 0,
      rental: 0,
      other: 0,
    },
    toolsConsumables: 0,
    materials: 0,
    rental: 0,
    other: 0,
    byStatus: { open: 0, received: 0, invoiced: 0, charged: 0 },
    lineCount: 0,
  };
}

export function emptyPurchasingVsBudget(): PurchasingVsBudget {
  return { toolsConsumables: 0, miscBudget: 0, variance: 0, hasMiscBudget: false };
}

export function emptyPurchasingBook(): PurchasingBook {
  return {
    statusDate: todayYmd(),
    notes: "",
    lines: [],
    snapshots: [],
  };
}

export function blankPurchaseLine(): PurchaseLine {
  return {
    id: uid("po"),
    date: todayYmd(),
    vendor: "",
    poNumber: "",
    description: "",
    category: "consumables",
    amount: 0,
    status: "open",
    estimateTieLabel: "",
    estimateTieKind: "",
    estimateTieId: "",
    attachmentName: "",
  };
}

export function hydratePurchaseLine(raw: unknown): PurchaseLine | null {
  const row = asRecord(raw);
  if (!row) return null;
  const amount = money(Math.max(0, parseDeskNumber(row.amount)));
  const date = parseLooseDate(typeof row.date === "string" ? row.date : "") || "";
  const vendor = typeof row.vendor === "string" ? row.vendor.trim() : "";
  const poNumber = typeof row.poNumber === "string" ? row.poNumber.trim() : "";
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const estimateTieLabel = typeof row.estimateTieLabel === "string" ? row.estimateTieLabel.trim() : "";
  const estimateTieId = typeof row.estimateTieId === "string" ? row.estimateTieId.trim() : "";
  const attachmentName = typeof row.attachmentName === "string" ? row.attachmentName.trim() : "";
  const category = asCategory(row.category);
  const status = asStatus(row.status);
  const estimateTieKind = asTieKind(row.estimateTieKind);
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : uid("po"),
    date,
    vendor,
    poNumber,
    description,
    category,
    amount,
    status,
    estimateTieLabel,
    estimateTieKind,
    estimateTieId,
    attachmentName,
  };
}

export function addPurchaseLine(book: PurchasingBook, line: Partial<PurchaseLine> = {}): PurchasingBook {
  return { ...book, lines: [...book.lines, { ...blankPurchaseLine(), ...line }] };
}

export function patchPurchaseLine(
  book: PurchasingBook,
  lineId: string,
  patch: Partial<PurchaseLine>,
): PurchasingBook {
  return {
    ...book,
    lines: book.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
  };
}

export function removePurchaseLine(book: PurchasingBook, lineId: string): PurchasingBook {
  return { ...book, lines: book.lines.filter((line) => line.id !== lineId) };
}

export function purchasingTotals(lines: PurchaseLine[]): PurchasingTotals {
  const totals = emptyPurchasingTotals();
  for (const line of lines) {
    const amount = money(Math.max(0, line.amount));
    totals.byCategory[line.category] = money(totals.byCategory[line.category] + amount);
    totals.byStatus[line.status] = money(totals.byStatus[line.status] + amount);
    totals.grand = money(totals.grand + amount);
    totals.lineCount += 1;
  }
  totals.toolsConsumables = money(totals.byCategory["small-tools"] + totals.byCategory.consumables);
  totals.materials = totals.byCategory.materials;
  totals.rental = totals.byCategory.rental;
  totals.other = totals.byCategory.other;
  return totals;
}

/** Misc qty × each from the live Other Cost sheet. Zero when the catalog is still empty dollars. */
export function miscBudgetFromSheet(sheet: OtherCostSheet | null | undefined): { amount: number; hasBudget: boolean } {
  const misc = Array.isArray(sheet?.misc) ? sheet.misc : [];
  const amount = money(misc.reduce((sum, line) => sum + miscAmount(line), 0));
  const hasBudget = misc.some((line) => miscAmount(line) > 0);
  return { amount, hasBudget };
}

export function purchasingVsBudget(
  totals: PurchasingTotals,
  misc: { amount: number; hasBudget: boolean } = { amount: 0, hasBudget: false },
): PurchasingVsBudget {
  const toolsConsumables = money(totals.toolsConsumables);
  const miscBudget = money(misc.amount);
  return {
    toolsConsumables,
    miscBudget,
    variance: money(miscBudget - toolsConsumables),
    hasMiscBudget: Boolean(misc.hasBudget),
  };
}

export function purchasingCostSlice(
  book: PurchasingBook,
  misc: { amount: number; hasBudget: boolean } = { amount: 0, hasBudget: false },
): PurchasingCostSlice {
  const totals = purchasingTotals(book.lines);
  return {
    grandTotal: totals.grand,
    toolsConsumables: totals.toolsConsumables,
    byCategory: { ...totals.byCategory },
    vsBudget: purchasingVsBudget(totals, misc),
    lineCount: totals.lineCount,
  };
}

export function purchasingHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  if (Array.isArray(row.snapshots) && row.snapshots.length > 0) return true;
  if (filledText(row.notes)) return true;
  if (Array.isArray(row.lines) && row.lines.length > 0) {
    return row.lines.some((item) => {
      const line = asRecord(item);
      if (!line) return false;
      return (
        filledText(line.vendor) ||
        filledText(line.poNumber) ||
        filledText(line.description) ||
        filledText(line.estimateTieLabel) ||
        filledText(line.attachmentName) ||
        parseDeskNumber(line.amount) > 0
      );
    });
  }
  return false;
}

function hydrateTotals(raw: unknown): PurchasingTotals {
  const row = asRecord(raw);
  if (!row) return emptyPurchasingTotals();
  const byCategory = asRecord(row.byCategory);
  const byStatus = asRecord(row.byStatus);
  return {
    grand: money(parseDeskNumber(row.grand)),
    byCategory: {
      "small-tools": money(parseDeskNumber(byCategory?.["small-tools"])),
      consumables: money(parseDeskNumber(byCategory?.consumables)),
      materials: money(parseDeskNumber(byCategory?.materials)),
      rental: money(parseDeskNumber(byCategory?.rental)),
      other: money(parseDeskNumber(byCategory?.other)),
    },
    toolsConsumables: money(parseDeskNumber(row.toolsConsumables)),
    materials: money(parseDeskNumber(row.materials)),
    rental: money(parseDeskNumber(row.rental)),
    other: money(parseDeskNumber(row.other)),
    byStatus: {
      open: money(parseDeskNumber(byStatus?.open)),
      received: money(parseDeskNumber(byStatus?.received)),
      invoiced: money(parseDeskNumber(byStatus?.invoiced)),
      charged: money(parseDeskNumber(byStatus?.charged)),
    },
    lineCount: Math.max(0, parseDeskNumber(row.lineCount)),
  };
}

function hydrateVsBudget(raw: unknown): PurchasingVsBudget {
  const row = asRecord(raw);
  if (!row) return emptyPurchasingVsBudget();
  return {
    toolsConsumables: money(parseDeskNumber(row.toolsConsumables)),
    miscBudget: money(parseDeskNumber(row.miscBudget)),
    variance: money(parseDeskNumber(row.variance)),
    hasMiscBudget: Boolean(row.hasMiscBudget),
  };
}

function hydrateSnapshot(raw: unknown): PurchasingSnapshot | null {
  const row = asRecord(raw);
  if (!row) return null;
  const statusDate = parseLooseDate(typeof row.statusDate === "string" ? row.statusDate : "");
  if (!statusDate) return null;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : uid("buy"),
    statusDate,
    savedAt: Number(row.savedAt) || 0,
    notes: typeof row.notes === "string" ? row.notes : "",
    totals: hydrateTotals(row.totals),
    vsBudget: hydrateVsBudget(row.vsBudget),
    lineCount: Math.max(0, parseDeskNumber(row.lineCount)),
  };
}

export function hydratePurchasing(raw: unknown): PurchasingBook {
  const parsed = asRecord(raw);
  if (!parsed) return emptyPurchasingBook();
  const lines = Array.isArray(parsed.lines)
    ? parsed.lines.map((item) => hydratePurchaseLine(item)).filter((line): line is PurchaseLine => Boolean(line))
    : [];
  const snapshots = Array.isArray(parsed.snapshots)
    ? parsed.snapshots
        .map((item) => hydrateSnapshot(item))
        .filter((item): item is PurchasingSnapshot => Boolean(item))
    : [];
  return {
    statusDate: parseLooseDate(typeof parsed.statusDate === "string" ? parsed.statusDate : "") || todayYmd(),
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    lines,
    snapshots,
  };
}

function browserStore(store?: PurchasingStoreLike | null): PurchasingStoreLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readPurchasing(key: string, store?: PurchasingStoreLike | null): PurchasingBook {
  const target = browserStore(store);
  if (!target || !key) return emptyPurchasingBook();
  try {
    const raw = target.getItem(`${PURCHASING_STORE_PREFIX}${key}`);
    if (!raw) return emptyPurchasingBook();
    return hydratePurchasing(JSON.parse(raw));
  } catch {
    return emptyPurchasingBook();
  }
}

/** Cache locally, then notify the live pack so vault upsert follows the estimate. */
export function writePurchasing(key: string, book: PurchasingBook, store?: PurchasingStoreLike | null) {
  const target = browserStore(store);
  if (!target || !key) return;
  try {
    target.setItem(`${PURCHASING_STORE_PREFIX}${key}`, JSON.stringify(hydratePurchasing(book)));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

export function purchasingSnapshotList(book: PurchasingBook): PurchasingSnapshot[] {
  return [...book.snapshots].sort((a, b) => {
    if (a.statusDate !== b.statusDate) return b.statusDate.localeCompare(a.statusDate);
    return b.savedAt - a.savedAt;
  });
}

export function savePurchasingSnapshot(
  book: PurchasingBook,
  misc: { amount: number; hasBudget: boolean } = { amount: 0, hasBudget: false },
  savedAt = Date.now(),
): PurchasingBook {
  const statusDate = parseLooseDate(book.statusDate) || todayYmd();
  const totals = purchasingTotals(book.lines);
  const snapshot: PurchasingSnapshot = {
    id: uid("buy"),
    statusDate,
    savedAt,
    notes: book.notes,
    totals,
    vsBudget: purchasingVsBudget(totals, misc),
    lineCount: totals.lineCount,
  };
  const snapshots = [snapshot, ...book.snapshots.filter((row) => row.statusDate !== statusDate)];
  return { ...book, statusDate, snapshots };
}

export function openPurchasingSnapshot(book: PurchasingBook, snapshotId: string): PurchasingBook {
  const shot = book.snapshots.find((row) => row.id === snapshotId);
  if (!shot) return book;
  return { ...book, statusDate: shot.statusDate, notes: shot.notes };
}

export function purchaseTieOptions(
  otherCost?: OtherCostSheet | null,
  equipment?: EquipmentSheet | null,
): PurchaseTieOption[] {
  const options: PurchaseTieOption[] = [];
  for (const line of otherCost?.misc ?? []) {
    const item = (line.item || "").trim();
    const description = (line.description || "").trim();
    if (!item && !description && !miscAmount(line)) continue;
    options.push({
      kind: "misc",
      id: line.id,
      label: ["Misc", item, description].filter(Boolean).join(" · "),
    });
  }
  for (const line of equipment?.largeTools ?? []) {
    const named = lookupShahanEquipment(line.itemId)?.description || line.itemId;
    if (!named) continue;
    options.push({
      kind: "equipment-large",
      id: line.id,
      label: `Equipment · ${named}`,
    });
  }
  for (const line of equipment?.thirdParty ?? []) {
    const named = (line.item || "").trim();
    if (!named) continue;
    options.push({
      kind: "equipment-3p",
      id: line.id,
      label: `3rd party · ${named}`,
    });
  }
  return options;
}

export function livePurchaseTieOptions(key: string): PurchaseTieOption[] {
  if (!key) return [];
  return purchaseTieOptions(readOtherCost(key), readEquipmentSheet(key));
}

export function applyPurchaseTie(line: PurchaseLine, option: PurchaseTieOption | null): PurchaseLine {
  if (!option) {
    return { ...line, estimateTieKind: "", estimateTieId: "" };
  }
  return {
    ...line,
    estimateTieKind: option.kind,
    estimateTieId: option.id,
    estimateTieLabel: line.estimateTieLabel || option.label,
  };
}
