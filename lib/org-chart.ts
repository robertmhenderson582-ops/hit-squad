import { companyDeskLogoSrc, companyName, isStandaloneId, type Company } from "./companies.ts";
import type { CalendarRange, CraftRow, CraftShift } from "./craft-labor.ts";

export const ORG_CHART_STORE_PREFIX = "hs_org_chart_v1:";
export const ORG_CHART_TAB_LABEL = "Org chart";
export const ORG_COMPANY_PARENT = "company";
export const ORG_CHART_LANES = ["staff", "generalForeman", "foreman"] as const;

export type OrgChartLane = (typeof ORG_CHART_LANES)[number];

export type OrgChartNames = {
  days?: string;
  nights?: string;
};

export type OrgChartState = {
  names: Record<string, OrgChartNames>;
  parents: Record<string, string>;
};

export type OrgChartCrew = {
  staff?: CraftRow[];
  generalForeman?: CraftRow[];
  foreman?: CraftRow[];
  direct?: CraftRow[];
  support?: unknown[];
};

export type OrgChartSource = {
  id: string;
  lane: OrgChartLane;
  position: string;
  shift: CraftShift;
  dayCount: number;
  nightCount: number;
};

export type OrgChartBox = {
  id: string;
  rowId: string;
  lane: OrgChartLane;
  position: string;
  shift: "Days" | "Nights" | "Days & nights";
  name: string;
  count: number;
  kind: "title" | "named" | "count";
  parentId: string;
};

export type OrgChartTreeNode = OrgChartBox & { children: OrgChartTreeNode[] };

export type OrgChartHeader = {
  name: string;
  logo: string | null;
};

export function emptyOrgChart(): OrgChartState {
  return { names: {}, parents: {} };
}

export function boxId(rowId: string, half: "days" | "nights" = "days") {
  return `${rowId}:${half}`;
}

function trimName(value?: string | null) {
  return (value ?? "").trim();
}

function asShift(value?: string | null): CraftShift {
  if (value === "Nights" || value === "Days & nights") return value;
  return "Days";
}

export function peakShiftCount(
  row: { ranges?: Array<Pick<CalendarRange, "headcount" | "nightHeadcount" | "off">>; shift?: CraftShift },
  night: boolean,
): number {
  const shift = asShift(row.shift);
  const ranges = (row.ranges ?? []).filter((range) => !range.off);
  if (!ranges.length) return 0;
  let max = 0;
  for (const range of ranges) {
    const dayHead = Math.max(0, Number(range.headcount) || 0);
    const nightHead = Math.max(0, Number(range.nightHeadcount) || 0);
    let n = 0;
    if (shift === "Nights") n = dayHead || nightHead;
    else if (shift === "Days & nights") n = night ? nightHead : dayHead;
    else n = night ? 0 : dayHead;
    if (n > max) max = n;
  }
  return max;
}

/** Staff / GF / Foreman only. Direct Craft and Support stay off the chart. */
export function crewSourceForOrgChart(crew: OrgChartCrew = {}): OrgChartSource[] {
  const lanes: Array<[OrgChartLane, CraftRow[] | undefined]> = [
    ["staff", crew.staff],
    ["generalForeman", crew.generalForeman],
    ["foreman", crew.foreman],
  ];
  const next: OrgChartSource[] = [];
  for (const [lane, rows] of lanes) {
    for (const row of rows ?? []) {
      const position = (row.position ?? "").trim();
      if (!row.id || !position) continue;
      const shift = asShift(row.shift);
      next.push({
        id: row.id,
        lane,
        position,
        shift,
        dayCount: peakShiftCount(row, false),
        nightCount: peakShiftCount(row, true),
      });
    }
  }
  return next;
}

export function nameSlot(state: OrgChartState, rowId: string): OrgChartNames {
  const slot = state.names[rowId];
  return {
    days: trimName(slot?.days),
    nights: trimName(slot?.nights),
  };
}

function slotForShift(slot: OrgChartNames, shift: CraftShift, half: "days" | "nights") {
  if (shift === "Nights" || half === "nights") return slot.nights || (shift === "Nights" ? slot.days : "");
  return slot.days;
}

export function shouldSplitShifts(source: OrgChartSource, slot: OrgChartNames) {
  if (source.shift !== "Days & nights") return false;
  return Boolean(slot.days || slot.nights);
}

function makeBox(
  source: OrgChartSource,
  half: "days" | "nights" | "both",
  name: string,
  count: number,
): Omit<OrgChartBox, "parentId"> {
  const named = Boolean(name);
  const nights = half === "nights";
  const shift: OrgChartBox["shift"] =
    half === "both" ? source.shift : nights ? "Nights" : source.shift === "Nights" ? "Nights" : "Days";
  const kind: OrgChartBox["kind"] =
    source.lane === "foreman" && !named ? "count" : named ? "named" : "title";
  return {
    id: boxId(source.id, nights ? "nights" : "days"),
    rowId: source.id,
    lane: source.lane,
    position: source.position,
    shift,
    name,
    count,
    kind,
  };
}

export function defaultParentId(box: Omit<OrgChartBox, "parentId">, boxes: Array<Omit<OrgChartBox, "parentId">>) {
  if (box.lane === "staff") return ORG_COMPANY_PARENT;
  const staff = boxes.find((item) => item.lane === "staff");
  if (box.lane === "generalForeman") return staff?.id ?? ORG_COMPANY_PARENT;
  const gf = boxes.find((item) => item.lane === "generalForeman");
  return gf?.id ?? staff?.id ?? ORG_COMPANY_PARENT;
}

export function wouldCycle(parents: Record<string, string>, boxIdValue: string, parentId: string) {
  if (parentId === ORG_COMPANY_PARENT || parentId === boxIdValue) return parentId === boxIdValue;
  let cursor = parentId;
  const seen = new Set<string>([boxIdValue]);
  while (cursor && cursor !== ORG_COMPANY_PARENT) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parents[cursor] ?? "";
    if (!cursor) break;
  }
  return false;
}

export function pruneOrgChart(state: OrgChartState, liveIds: Iterable<string>): OrgChartState {
  const live = new Set(liveIds);
  const names: Record<string, OrgChartNames> = {};
  const parents: Record<string, string> = {};
  for (const [rowId, slot] of Object.entries(state.names)) {
    if (!live.has(rowId)) continue;
    const days = trimName(slot.days);
    const nights = trimName(slot.nights);
    if (days || nights) names[rowId] = { ...(days ? { days } : {}), ...(nights ? { nights } : {}) };
  }
  for (const [id, parent] of Object.entries(state.parents)) {
    const rowId = id.split(":")[0] ?? "";
    if (!live.has(rowId)) continue;
    parents[id] = parent;
  }
  return { names, parents };
}

export function setOrgChartName(
  state: OrgChartState,
  rowId: string,
  half: "days" | "nights",
  value: string,
): OrgChartState {
  const current = nameSlot(state, rowId);
  const next = { ...current, [half]: trimName(value) };
  const names = { ...state.names };
  if (!next.days && !next.nights) delete names[rowId];
  else names[rowId] = { ...(next.days ? { days: next.days } : {}), ...(next.nights ? { nights: next.nights } : {}) };
  return { ...state, names };
}

export function setOrgChartParent(state: OrgChartState, id: string, parentId: string): OrgChartState {
  const nextParent = parentId || ORG_COMPANY_PARENT;
  if (wouldCycle({ ...state.parents, [id]: nextParent }, id, nextParent)) return state;
  return { ...state, parents: { ...state.parents, [id]: nextParent } };
}

/** Visual / reporting boxes only. Does not rewrite Crew rows, dollars, or headcount. */
export function orgChartBoxes(crew: OrgChartCrew, state: OrgChartState = emptyOrgChart()): OrgChartBox[] {
  const sources = crewSourceForOrgChart(crew);
  const live = pruneOrgChart(state, sources.map((row) => row.id));
  const drafted: Array<Omit<OrgChartBox, "parentId">> = [];
  for (const source of sources) {
    const slot = nameSlot(live, source.id);
    if (shouldSplitShifts(source, slot)) {
      drafted.push(makeBox(source, "days", slot.days || "", source.dayCount));
      drafted.push(makeBox(source, "nights", slot.nights || "", source.nightCount));
      continue;
    }
    const half = source.shift === "Nights" ? "nights" : "days";
    const name = slotForShift(slot, source.shift, half) || "";
    const count = source.shift === "Nights" ? source.nightCount : source.shift === "Days & nights"
      ? source.dayCount + source.nightCount
      : source.dayCount;
    drafted.push(makeBox(source, half === "nights" ? "nights" : "both", name, count));
  }
  return drafted.map((box) => {
    const stored = live.parents[box.id];
    const parentId =
      stored && !wouldCycle(live.parents, box.id, stored)
        ? stored
        : defaultParentId(box, drafted);
    return { ...box, parentId };
  });
}

export function orgChartForest(boxes: OrgChartBox[]): OrgChartTreeNode[] {
  const nodes = new Map<string, OrgChartTreeNode>();
  for (const box of boxes) nodes.set(box.id, { ...box, children: [] });
  const roots: OrgChartTreeNode[] = [];
  for (const box of boxes) {
    const node = nodes.get(box.id);
    if (!node) continue;
    const parent = box.parentId !== ORG_COMPANY_PARENT ? nodes.get(box.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function orgChartBoxLabel(box: OrgChartBox) {
  if (box.kind === "named") return box.name;
  if (box.kind === "count") return String(box.count || 0);
  return box.position;
}

export function parentChoices(box: OrgChartBox, boxes: OrgChartBox[], parents: Record<string, string> = {}) {
  return boxes.filter(
    (item) => item.id !== box.id && !wouldCycle({ ...parents, [box.id]: item.id }, box.id, item.id),
  );
}

/**
 * Same logo field as the Company Desk door (PR 107 / V1.41).
 * Assigned companies only — never the owner's full catalog.
 */
export function orgChartHeaderFromAssigned(assigned: Company[] = []): OrgChartHeader {
  const mine = assigned.filter((row) => row?.id && !isStandaloneId(row.id));
  const first = mine[0];
  return {
    name: first ? companyName(first.id, mine) : "",
    logo: companyDeskLogoSrc(mine),
  };
}

export function hydrateOrgChart(raw: unknown): OrgChartState {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<OrgChartState>) : {};
  const names: Record<string, OrgChartNames> = {};
  const parents: Record<string, string> = {};
  for (const [id, slot] of Object.entries(row.names ?? {})) {
    if (!id || !slot || typeof slot !== "object") continue;
    const days = trimName((slot as OrgChartNames).days);
    const nights = trimName((slot as OrgChartNames).nights);
    if (days || nights) names[id] = { ...(days ? { days } : {}), ...(nights ? { nights } : {}) };
  }
  for (const [id, parent] of Object.entries(row.parents ?? {})) {
    if (!id || typeof parent !== "string") continue;
    parents[id] = parent;
  }
  return { names, parents };
}

export function orgChartHasWork(value: unknown) {
  const state = hydrateOrgChart(value);
  return Boolean(Object.keys(state.names).length || Object.keys(state.parents).length);
}

export function readOrgChart(key: string, store?: { getItem(key: string): string | null } | null): OrgChartState {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !key) return emptyOrgChart();
  try {
    const raw = target.getItem(`${ORG_CHART_STORE_PREFIX}${key}`);
    if (!raw) return emptyOrgChart();
    return hydrateOrgChart(JSON.parse(raw));
  } catch {
    return emptyOrgChart();
  }
}

export function writeOrgChart(
  key: string,
  state: OrgChartState,
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !key) return;
  try {
    target.setItem(`${ORG_CHART_STORE_PREFIX}${key}`, JSON.stringify(state));
  } catch {
    // keep the previous copy
  }
}
