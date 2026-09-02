import { markup6, type B2Period } from "./b2-east-coast.ts";
import { inclusiveDays, parseYmd } from "./phase-schedule.ts";
import {
  isShahanCostPlus,
  lookupShahanEquipment,
  rematchEquipmentSheetToShahan,
  rematchShahanEquipmentId,
  shahanEquipmentHasRate,
  shahanPeriodRate,
} from "./shahan-wood-river.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export const EQUIPMENT_STORE_PREFIX = "hs_equip_v1:";
export const THIRD_PARTY_MARKUP = 0.06;
export const THIRD_PARTY_PERIODS = ["daily", "weekly", "monthly"] as const;
export type ThirdPartyPeriod = (typeof THIRD_PARTY_PERIODS)[number];

export type LargeToolLine = {
  id: string;
  itemId: string;
  period: B2Period;
  qty: number;
  start: string;
  end: string;
  enteredCost: number;
  freight: number;
};

export type ThirdPartyLine = {
  id: string;
  item: string;
  period: ThirdPartyPeriod;
  rate: number;
  freight: number;
  qty: number;
  start: string;
  end: string;
};

export type EquipmentSheet = {
  largeTools: LargeToolLine[];
  thirdParty: ThirdPartyLine[];
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyEquipmentSheet(): EquipmentSheet {
  return { largeTools: [], thirdParty: [] };
}

export function jobSetupWindow(phases: Array<{ id?: string; start?: string; stop?: string }> = []) {
  const pre = phases.find((row) => row.id === "pre");
  const post = phases.find((row) => row.id === "post");
  return { start: pre?.start || "", end: post?.stop || "" };
}

export function isEmptyEquipmentDate(value?: string) {
  return !value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function seedLineDates<T extends { start: string; end: string }>(
  line: T,
  window: { start?: string; end?: string } = {},
): T {
  return {
    ...line,
    start: isEmptyEquipmentDate(line.start) ? window.start || "" : line.start,
    end: isEmptyEquipmentDate(line.end) ? window.end || "" : line.end,
  };
}

export function seedEmptyEquipmentWindow(
  sheet: EquipmentSheet,
  window: { start?: string; end?: string },
): EquipmentSheet {
  return {
    largeTools: sheet.largeTools.map((line) => seedLineDates(line, window)),
    thirdParty: sheet.thirdParty.map((line) => seedLineDates(line, window)),
  };
}

export function blankLargeTool(window: { start?: string; end?: string } = {}): LargeToolLine {
  return seedLineDates(
    { id: uid("lt"), itemId: "", period: "daily", qty: 1, start: "", end: "", enteredCost: 0, freight: 0 },
    window,
  );
}

export function blankThirdParty(window: { start?: string; end?: string } = {}): ThirdPartyLine {
  return seedLineDates(
    { id: uid("tp"), item: "", period: "monthly", rate: 0, freight: 0, qty: 1, start: "", end: "" },
    window,
  );
}

function addCalendarMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), last));
  return next;
}

/** Inclusive units covering [start, end]. Empty or inverted dates bill 1 period so on-screen totals do not drop. */
export function billedPeriodCount(start: string, end: string, period: B2Period | ThirdPartyPeriod) {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to || to < from) return 1;
  if (period === "hourly") return inclusiveDays(start, end) * 8;
  if (period === "daily") return inclusiveDays(start, end);
  if (period === "weekly") return Math.max(1, Math.ceil(inclusiveDays(start, end) / 7));
  let count = 1;
  let covered = addCalendarMonths(from, 1);
  while (to > covered) {
    count += 1;
    covered = addCalendarMonths(covered, 1);
  }
  return count;
}

export function largeToolAmount(line: LargeToolLine) {
  const item = lookupShahanEquipment(line.itemId);
  if (!item) return 0;
  const freight = Math.max(0, Number(line.freight) || 0);
  const qty = Math.max(0, Number(line.qty) || 0);
  const periods = billedPeriodCount(line.start, line.end, line.period);
  const rate = shahanPeriodRate(item, line.period);
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
    return rate * qty * periods + freight;
  }
  if (isShahanCostPlus(item) || !shahanEquipmentHasRate(item)) {
    if (isShahanCostPlus(item)) return markup6(line.enteredCost ?? 0) + freight;
    return freight;
  }
  return freight;
}

export function thirdPartyCost(line: ThirdPartyLine) {
  const periods = billedPeriodCount(line.start, line.end, line.period);
  return Math.max(0, line.rate) * Math.max(0, line.qty) * periods + Math.max(0, line.freight);
}

export function thirdPartyMarkedUp(line: ThirdPartyLine) {
  return markup6(thirdPartyCost(line));
}

export function equipmentTotals(sheet: EquipmentSheet) {
  const largeTools = sheet.largeTools.reduce((sum, line) => sum + largeToolAmount(line), 0);
  const thirdParty = sheet.thirdParty.reduce((sum, line) => sum + thirdPartyMarkedUp(line), 0);
  return { largeTools, thirdParty, total: largeTools + thirdParty };
}

export function readEquipmentSheet(key: string): EquipmentSheet {
  if (typeof window === "undefined" || !key) return emptyEquipmentSheet();
  try {
    const raw = window.localStorage.getItem(`${EQUIPMENT_STORE_PREFIX}${key}`);
    if (!raw) return emptyEquipmentSheet();
    const parsed = JSON.parse(raw) as Partial<EquipmentSheet>;
    const sheet = {
      largeTools: Array.isArray(parsed.largeTools)
        ? parsed.largeTools.map((line) => ({
            ...line,
            itemId: rematchShahanEquipmentId(line.itemId || ""),
            freight: Number(line.freight) || 0,
          }))
        : [],
      thirdParty: Array.isArray(parsed.thirdParty) ? parsed.thirdParty : [],
    };
    return rematchEquipmentSheetToShahan(sheet);
  } catch {
    return emptyEquipmentSheet();
  }
}

export function writeEquipmentSheet(key: string, sheet: EquipmentSheet) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${EQUIPMENT_STORE_PREFIX}${key}`, JSON.stringify(sheet));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}
