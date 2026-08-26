import { b2ItemById, b2LineTotal, markup6, type B2Period } from "./b2-east-coast.ts";
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

export function blankLargeTool(): LargeToolLine {
  return { id: uid("lt"), itemId: "", period: "daily", qty: 1, start: "", end: "", enteredCost: 0 };
}

export function blankThirdParty(): ThirdPartyLine {
  return { id: uid("tp"), item: "", period: "daily", rate: 0, freight: 0, qty: 1, start: "", end: "" };
}

export function largeToolAmount(line: LargeToolLine) {
  const item = b2ItemById(line.itemId);
  if (!item) return 0;
  return b2LineTotal(item, line.period, line.qty, line.enteredCost);
}

export function thirdPartyCost(line: ThirdPartyLine) {
  return Math.max(0, line.rate) * Math.max(0, line.qty) + Math.max(0, line.freight);
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
    return {
      largeTools: Array.isArray(parsed.largeTools) ? parsed.largeTools : [],
      thirdParty: Array.isArray(parsed.thirdParty) ? parsed.thirdParty : [],
    };
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
