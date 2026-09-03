import { emptyQualityDay1, hydrateQualityDay1, type QualityDay1 } from "./quality-day1.ts";
import { emptyRollingChart, hydrateRollingChart, type RollingChartState } from "./rolling-chart.ts";
import {
  clientFolderId,
  emptyRegisterRow,
  hydrateRegisterRows,
  type ClientFolderId,
  type ModuleRegisterRow,
} from "./quality-hse-modules.ts";

export const QUALITY_MODULE_PREFIX = "hs_quality_module_v1:";

export const QUALITY_SECTIONS = [
  {
    id: "ncrs",
    title: "NCRs",
    board: "Open NCRs",
    fields: [
      { id: "ncr", label: "NCR", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
      { id: "date", label: "DATE", kind: "date" },
    ],
  },
  {
    id: "welds-nde",
    title: "Welds/NDE",
    board: "Weld reject",
    fields: [
      { id: "weld", label: "WELD", kind: "text" },
      { id: "joint", label: "JOINT", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "connections",
    title: "Connections",
    board: "Connection reject",
    fields: [
      { id: "conn", label: "CONN", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "travelers",
    title: "Travelers",
    board: "Travelers",
    fields: [
      { id: "traveler", label: "TRAVELER", kind: "text" },
      { id: "scope", label: "SCOPE", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "welders",
    title: "Welders",
    board: "Expired welders",
    fields: [
      { id: "welder", label: "WELDER", kind: "text" },
      { id: "stamp", label: "STAMP", kind: "text" },
      { id: "lastUsed", label: "LAST USED", kind: "date" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "calibration",
    title: "Calibration",
    board: "Overdue gauges",
    fields: [
      { id: "gauge", label: "GAUGE", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "due", label: "DUE", kind: "date" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
] as const;

export type QualitySectionId = (typeof QUALITY_SECTIONS)[number]["id"];

export type QualityModuleState = {
  day1: QualityDay1;
  workNames: string;
  rollingChart: RollingChartState;
  sections: Record<QualitySectionId, ModuleRegisterRow[]>;
};

function emptySections(): Record<QualitySectionId, ModuleRegisterRow[]> {
  return {
    ncrs: [],
    "welds-nde": [],
    connections: [],
    travelers: [],
    welders: [],
    calibration: [],
  };
}

export function emptyQualityModule(): QualityModuleState {
  return {
    day1: emptyQualityDay1(),
    workNames: "",
    rollingChart: emptyRollingChart(),
    sections: emptySections(),
  };
}

export function qualityModuleKey(folder: ClientFolderId | string) {
  return `${QUALITY_MODULE_PREFIX}${clientFolderId(folder)}`;
}

export function hydrateQualityModule(raw: unknown): QualityModuleState {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const incoming = row.sections && typeof row.sections === "object" ? (row.sections as Record<string, unknown>) : {};
  const sections = emptySections();
  for (const lane of QUALITY_SECTIONS) {
    sections[lane.id] = hydrateRegisterRows(incoming[lane.id]);
  }
  return {
    day1: hydrateQualityDay1(row.day1),
    workNames: typeof row.workNames === "string" ? row.workNames : "",
    rollingChart: hydrateRollingChart(row.rollingChart),
    sections,
  };
}

export function readQualityModule(
  folder: ClientFolderId | string,
  store: { getItem(key: string): string | null } | null = typeof window === "undefined" ? null : window.localStorage,
): QualityModuleState {
  if (!store) return emptyQualityModule();
  try {
    const raw = store.getItem(qualityModuleKey(folder));
    if (!raw) return emptyQualityModule();
    return hydrateQualityModule(JSON.parse(raw));
  } catch {
    return emptyQualityModule();
  }
}

export function writeQualityModule(
  folder: ClientFolderId | string,
  state: QualityModuleState,
  store: { setItem(key: string, value: string): void } | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!store) return;
  try {
    store.setItem(qualityModuleKey(folder), JSON.stringify(hydrateQualityModule(state)));
  } catch {
    // keep the previous copy
  }
}

export function addQualityRow(state: QualityModuleState, section: QualitySectionId): QualityModuleState {
  return {
    ...state,
    sections: {
      ...state.sections,
      [section]: [...state.sections[section], emptyRegisterRow(`q-${section}-${Date.now()}`)],
    },
  };
}

export function patchQualityRow(
  state: QualityModuleState,
  section: QualitySectionId,
  id: string,
  field: string,
  value: string,
): QualityModuleState {
  return {
    ...state,
    sections: {
      ...state.sections,
      [section]: state.sections[section].map((row) =>
        row.id === id ? { ...row, cells: { ...row.cells, [field]: value } } : row,
      ),
    },
  };
}

export function removeQualityRow(state: QualityModuleState, section: QualitySectionId, id: string): QualityModuleState {
  return {
    ...state,
    sections: {
      ...state.sections,
      [section]: state.sections[section].filter((row) => row.id !== id),
    },
  };
}

function parseDay(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Six months unused = expired. Empty last-used stays not expired. */
export function welderExpired(lastUsed: string, now = new Date()) {
  const used = parseDay(lastUsed);
  if (!used) return false;
  const expires = new Date(used.getFullYear(), used.getMonth() + 6, used.getDate());
  return expires <= startOfDay(now);
}

/** Out of cal when the typed due date is before today. Empty due stays current. */
export function gaugeOverdue(due: string, now = new Date()) {
  const date = parseDay(due);
  if (!date) return false;
  return date < startOfDay(now);
}

export function ncrIsOpen(status: string) {
  return !/closed|cleared|done|void/i.test(status.trim());
}

export function qualityBoardCounts(state: QualityModuleState, now = new Date()) {
  return {
    ncrs: state.sections.ncrs.filter((row) => ncrIsOpen(row.cells.status || "")).length,
    "welds-nde": state.sections["welds-nde"].length,
    connections: state.sections.connections.length,
    travelers: state.sections.travelers.length,
    welders: state.sections.welders.filter((row) => welderExpired(row.cells.lastUsed || "", now)).length,
    calibration: state.sections.calibration.filter((row) => gaugeOverdue(row.cells.due || "", now)).length,
  } as Record<QualitySectionId, number>;
}
