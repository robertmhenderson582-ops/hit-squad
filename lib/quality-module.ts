import {
  emptyQualityDay1,
  hydrateQualityDay1,
  setQualityFormRows,
  travelerCountFromRows,
  type QualityDay1,
} from "./quality-day1.ts";
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
      { id: "ncr", label: "Number", kind: "text" },
      { id: "area", label: "Area", kind: "text" },
      { id: "description", label: "Description", kind: "text" },
      { id: "disposition", label: "Disposition", kind: "text" },
      { id: "status", label: "Status", kind: "text" },
      { id: "date", label: "Date", kind: "date" },
    ],
  },
  {
    id: "welds-nde",
    title: "Welds/NDE",
    board: "Welds/NDE",
    fields: [
      { id: "weld", label: "Weld / joint", kind: "text" },
      { id: "process", label: "Process", kind: "text" },
      { id: "nde", label: "NDE method", kind: "text" },
      { id: "result", label: "Result", kind: "text" },
      { id: "date", label: "Date", kind: "date" },
    ],
  },
  {
    id: "connections",
    title: "Connections / flanges",
    board: "Connections",
    fields: [
      { id: "flangeId", label: "ID", kind: "text" },
      { id: "location", label: "Location", kind: "text" },
      { id: "status", label: "Status", kind: "text" },
      { id: "date", label: "Date", kind: "date" },
    ],
  },
  {
    id: "travelers",
    title: "Travelers",
    board: "Travelers",
    fields: [
      { id: "traveler", label: "Number", kind: "text" },
      { id: "scope", label: "Scope / phase name", kind: "text" },
      { id: "status", label: "Status", kind: "text" },
      { id: "date", label: "Date", kind: "date" },
    ],
  },
  {
    id: "welders",
    title: "Welders",
    board: "Welders",
    fields: [
      { id: "welder", label: "Name", kind: "text" },
      { id: "stamp", label: "Stamp", kind: "text" },
      { id: "process", label: "Process", kind: "text" },
      { id: "expiry", label: "Expiry date", kind: "date" },
      { id: "lastUsed", label: "Last used", kind: "date" },
      { id: "status", label: "Status", kind: "text" },
    ],
  },
  {
    id: "calibration",
    title: "Calibration / gauges",
    board: "Overdue gauges",
    fields: [
      { id: "gauge", label: "ID", kind: "text" },
      { id: "type", label: "Type", kind: "text" },
      { id: "range", label: "Range", kind: "text" },
      { id: "due", label: "Due date", kind: "date" },
      { id: "status", label: "Status", kind: "text" },
      { id: "area", label: "Area", kind: "text" },
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

function migrateNcrCells(row: ModuleRegisterRow): ModuleRegisterRow {
  const cells = { ...row.cells };
  if (!cells.description?.trim() && cells.note?.trim()) cells.description = cells.note;
  return { ...row, cells };
}

function migrateWeldCells(row: ModuleRegisterRow): ModuleRegisterRow {
  const cells = { ...row.cells };
  if (!cells.weld?.trim() && cells.joint?.trim()) cells.weld = cells.joint;
  return { ...row, cells };
}

function migrateConnectionCells(row: ModuleRegisterRow): ModuleRegisterRow {
  const cells = { ...row.cells };
  if (!cells.flangeId?.trim() && cells.conn?.trim()) cells.flangeId = cells.conn;
  if (!cells.location?.trim() && cells.area?.trim()) cells.location = cells.area;
  return { ...row, cells };
}

/** 2.7.19 flange log is the source of truth. Older Connections board rows migrate in if the log is empty. */
function mergeFlangeRows(day1: QualityDay1, board: ModuleRegisterRow[]): { day1: QualityDay1; connections: ModuleRegisterRow[] } {
  const formRows = day1.forms["2.7.19"]?.rows ?? [];
  if (formRows.length) return { day1, connections: formRows };
  if (!board.length) return { day1, connections: [] };
  return { day1: setQualityFormRows(day1, "2.7.19", board), connections: board };
}

export function hydrateQualityModule(raw: unknown): QualityModuleState {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const incoming = row.sections && typeof row.sections === "object" ? (row.sections as Record<string, unknown>) : {};
  const sections = emptySections();
  for (const lane of QUALITY_SECTIONS) {
    sections[lane.id] = hydrateRegisterRows(incoming[lane.id]);
  }
  sections.ncrs = sections.ncrs.map(migrateNcrCells);
  sections["welds-nde"] = sections["welds-nde"].map(migrateWeldCells);
  sections.connections = sections.connections.map(migrateConnectionCells);
  const day1 = hydrateQualityDay1(row.day1 as Record<string, unknown> | null | undefined);
  const flange = mergeFlangeRows(day1, sections.connections);
  return {
    day1: flange.day1,
    workNames: typeof row.workNames === "string" ? row.workNames : "",
    rollingChart: hydrateRollingChart(row.rollingChart as Record<string, unknown> | null | undefined),
    sections: { ...sections, connections: flange.connections },
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

function withTravelerCount(state: QualityModuleState): QualityModuleState {
  return {
    ...state,
    day1: { ...state.day1, travelerCount: travelerCountFromRows(state.sections.travelers) },
  };
}

function withFlangeLog(state: QualityModuleState): QualityModuleState {
  return {
    ...state,
    day1: setQualityFormRows(state.day1, "2.7.19", state.sections.connections),
  };
}

export function addQualityRow(state: QualityModuleState, section: QualitySectionId): QualityModuleState {
  let next: QualityModuleState = {
    ...state,
    sections: {
      ...state.sections,
      [section]: [...state.sections[section], emptyRegisterRow(`q-${section}-${Date.now()}`)],
    },
  };
  if (section === "travelers") next = withTravelerCount(next);
  if (section === "connections") next = withFlangeLog(next);
  return next;
}

export function patchQualityRow(
  state: QualityModuleState,
  section: QualitySectionId,
  id: string,
  field: string,
  value: string,
): QualityModuleState {
  let next: QualityModuleState = {
    ...state,
    sections: {
      ...state.sections,
      [section]: state.sections[section].map((row) =>
        row.id === id ? { ...row, cells: { ...row.cells, [field]: value } } : row,
      ),
    },
  };
  if (section === "connections") next = withFlangeLog(next);
  return next;
}

export function removeQualityRow(state: QualityModuleState, section: QualitySectionId, id: string): QualityModuleState {
  let next: QualityModuleState = {
    ...state,
    sections: {
      ...state.sections,
      [section]: state.sections[section].filter((row) => row.id !== id),
    },
  };
  if (section === "travelers") next = withTravelerCount(next);
  if (section === "connections") next = withFlangeLog(next);
  return next;
}

export function applyFlangeFormRows(state: QualityModuleState, rows: ModuleRegisterRow[]): QualityModuleState {
  return {
    ...state,
    day1: setQualityFormRows(state.day1, "2.7.19", rows),
    sections: { ...state.sections, connections: rows },
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
    welders: state.sections.welders.filter((row) => welderExpired(row.cells.lastUsed || "", now) || gaugeOverdue(row.cells.expiry || "", now)).length,
    calibration: state.sections.calibration.filter((row) => gaugeOverdue(row.cells.due || "", now)).length,
  } as Record<QualitySectionId, number>;
}
