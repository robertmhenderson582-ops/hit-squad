import { emptyHseDay1, hydrateHseDay1, type HseDay1 } from "./hse-day1.ts";
import {
  clientFolderId,
  emptyRegisterRow,
  hydrateRegisterRows,
  type ClientFolderId,
  type ModuleRegisterRow,
} from "./quality-hse-modules.ts";

export const HSE_MODULE_PREFIX = "hs_hse_module_v1:";

export const HSE_EXECUTE_LANES = [
  {
    id: "incidents",
    title: "Incidents / near misses",
    fields: [
      { id: "when", label: "WHEN", kind: "date" },
      { id: "site", label: "SITE", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "observations",
    title: "Observations",
    fields: [
      { id: "when", label: "WHEN", kind: "date" },
      { id: "site", label: "SITE", kind: "text" },
      { id: "note", label: "NOTE", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "hot-work",
    title: "Permits — Hot work",
    fields: [
      { id: "permit", label: "PERMIT", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "window", label: "WINDOW", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "confined",
    title: "Permits — Confined space",
    fields: [
      { id: "permit", label: "PERMIT", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "window", label: "WINDOW", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "loto",
    title: "Permits — LOTO",
    fields: [
      { id: "permit", label: "PERMIT", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "window", label: "WINDOW", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "excavation",
    title: "Permits — Excavation",
    fields: [
      { id: "permit", label: "PERMIT", kind: "text" },
      { id: "area", label: "AREA", kind: "text" },
      { id: "window", label: "WINDOW", kind: "text" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "jsa",
    title: "JSA",
    fields: [
      { id: "task", label: "TASK", kind: "text" },
      { id: "crew", label: "CREW", kind: "text" },
      { id: "date", label: "DATE", kind: "date" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
  {
    id: "toolbox",
    title: "Toolbox talks",
    fields: [
      { id: "topic", label: "TOPIC", kind: "text" },
      { id: "crew", label: "CREW", kind: "text" },
      { id: "date", label: "DATE", kind: "date" },
      { id: "status", label: "STATUS", kind: "text" },
    ],
  },
] as const;

export type HseLaneId = (typeof HSE_EXECUTE_LANES)[number]["id"];

export type HseModuleState = {
  day1: HseDay1;
  plant: string;
  lanes: Record<HseLaneId, ModuleRegisterRow[]>;
};

function emptyLanes(): Record<HseLaneId, ModuleRegisterRow[]> {
  return {
    incidents: [],
    observations: [],
    "hot-work": [],
    confined: [],
    loto: [],
    excavation: [],
    jsa: [],
    toolbox: [],
  };
}

export function emptyHseModule(): HseModuleState {
  return { day1: emptyHseDay1(), plant: "", lanes: emptyLanes() };
}

export function hseModuleKey(folder: ClientFolderId | string) {
  return `${HSE_MODULE_PREFIX}${clientFolderId(folder)}`;
}

export function hydrateHseModule(raw: unknown): HseModuleState {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const incoming = row.lanes && typeof row.lanes === "object" ? (row.lanes as Record<string, unknown>) : {};
  const lanes = emptyLanes();
  for (const lane of HSE_EXECUTE_LANES) {
    lanes[lane.id] = hydrateRegisterRows(incoming[lane.id]);
  }
  return {
    day1: hydrateHseDay1(row.day1),
    plant: typeof row.plant === "string" ? row.plant : "",
    lanes,
  };
}

export function readHseModule(
  folder: ClientFolderId | string,
  store: { getItem(key: string): string | null } | null = typeof window === "undefined" ? null : window.localStorage,
): HseModuleState {
  if (!store) return emptyHseModule();
  try {
    const raw = store.getItem(hseModuleKey(folder));
    if (!raw) return emptyHseModule();
    return hydrateHseModule(JSON.parse(raw));
  } catch {
    return emptyHseModule();
  }
}

export function writeHseModule(
  folder: ClientFolderId | string,
  state: HseModuleState,
  store: { setItem(key: string, value: string): void } | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!store) return;
  try {
    store.setItem(hseModuleKey(folder), JSON.stringify(hydrateHseModule(state)));
  } catch {
    // keep the previous copy
  }
}

export function addHseLaneRow(state: HseModuleState, lane: HseLaneId): HseModuleState {
  return {
    ...state,
    lanes: {
      ...state.lanes,
      [lane]: [...state.lanes[lane], emptyRegisterRow(`h-${lane}-${Date.now()}`)],
    },
  };
}

export function patchHseLaneRow(
  state: HseModuleState,
  lane: HseLaneId,
  id: string,
  field: string,
  value: string,
): HseModuleState {
  return {
    ...state,
    lanes: {
      ...state.lanes,
      [lane]: state.lanes[lane].map((row) => (row.id === id ? { ...row, cells: { ...row.cells, [field]: value } } : row)),
    },
  };
}

export function removeHseLaneRow(state: HseModuleState, lane: HseLaneId, id: string): HseModuleState {
  return {
    ...state,
    lanes: {
      ...state.lanes,
      [lane]: state.lanes[lane].filter((row) => row.id !== id),
    },
  };
}
