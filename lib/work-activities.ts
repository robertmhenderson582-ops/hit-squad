import type { PhaseId } from "./phase-schedule";

const LOCKED_PHASES: PhaseId[] = ["pre", "oil-out", "mech", "oil-in", "post"];

export const ACTIVITY_STORE_PREFIX = "hs_activity_v1:";
export const ACTIVITY_NO_WIDTH = 3;

export const ACTIVITY_RESOURCES = [
  "Boilermaker",
  "Pipefitter",
  "Operating Engineer",
  "Laborer",
  "Ironworker",
  "Teamster",
  "Merit/staff",
] as const;

export type ActivityResource = (typeof ACTIVITY_RESOURCES)[number];

export type WorkActivity = {
  id: string;
  activityNo: string;
  wbs: string;
  unit: string;
  name: string;
  description: string;
  /** Legacy single craft. First of `resources` when present. */
  resource: ActivityResource | "";
  resources: ActivityResource[];
  /** Named people on this job (org chart / typed). Not desk presence. */
  people: string[];
  phaseId: PhaseId | "";
  hours: number;
};

function uid() {
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isActivityResource(value: unknown): value is ActivityResource {
  return typeof value === "string" && (ACTIVITY_RESOURCES as readonly string[]).includes(value);
}

export function parseActivityNo(value: unknown): number {
  const match = String(value ?? "").match(/(\d+)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function formatActivityNo(n: number): string {
  return String(Math.max(1, Math.floor(Number(n) || 1))).padStart(ACTIVITY_NO_WIDTH, "0");
}

/** Keep custom labels; pad plain numeric codes to 001. */
export function normalizeActivityNo(value: unknown, fallback = 0): string {
  const trimmed = trimText(value);
  if (/^\d+$/.test(trimmed)) return formatActivityNo(Number(trimmed));
  if (trimmed) return trimmed;
  return fallback > 0 ? formatActivityNo(fallback) : "";
}

export function nextActivityNo(rows: Array<{ activityNo?: string }> = []): string {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, parseActivityNo(row.activityNo));
  }
  return formatActivityNo(max + 1);
}

export function activityResourcesOf(row: Pick<WorkActivity, "resource" | "resources"> | Record<string, unknown>): ActivityResource[] {
  const seen = new Set<ActivityResource>();
  const push = (value: unknown) => {
    if (isActivityResource(value) && !seen.has(value)) seen.add(value);
  };
  const resources = (row as { resources?: unknown }).resources;
  if (Array.isArray(resources)) resources.forEach(push);
  push((row as { resource?: unknown }).resource);
  return ACTIVITY_RESOURCES.filter((item) => seen.has(item));
}

export function activityPeopleOf(row: Pick<WorkActivity, "people"> | Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const people = (row as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];
  for (const value of people) {
    const name = trimText(value);
    if (name) seen.add(name);
  }
  return [...seen];
}

export function activityDescriptionOf(row: Pick<WorkActivity, "name" | "description"> | Record<string, unknown>): string {
  return trimText((row as { description?: unknown }).description) || trimText((row as { name?: unknown }).name);
}

export function activityResourceLabel(row: Pick<WorkActivity, "resource" | "resources" | "people">): string {
  return [...activityResourcesOf(row), ...activityPeopleOf(row)].join(", ");
}

/** Job-scoped names only — never desk presence / seats. */
export function namedPeopleFromOrgChart(names: Record<string, { days?: string; nights?: string }> | null | undefined): string[] {
  const seen = new Set<string>();
  for (const slot of Object.values(names ?? {})) {
    const days = trimText(slot?.days);
    const nights = trimText(slot?.nights);
    if (days) seen.add(days);
    if (nights) seen.add(nights);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function activityAssigneeChoices(row: WorkActivity, jobPeople: string[] = []): string[] {
  const seen = new Set<string>();
  for (const name of [...jobPeople, ...row.people]) {
    const trimmed = name.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function blankWorkActivity(rowsOrIndex: WorkActivity[] | number = 1): WorkActivity {
  const activityNo = Array.isArray(rowsOrIndex) ? nextActivityNo(rowsOrIndex) : formatActivityNo(rowsOrIndex);
  return {
    id: uid(),
    activityNo,
    wbs: "",
    unit: "",
    name: "",
    description: "",
    resource: "",
    resources: [],
    people: [],
    phaseId: "",
    hours: 0,
  };
}

export function normalizeWorkActivity(raw: unknown, siblings: WorkActivity[] = []): WorkActivity {
  const item = asRecord(raw) ?? {};
  const description = activityDescriptionOf(item);
  const resources = activityResourcesOf(item);
  const people = activityPeopleOf(item);
  const hours = Math.max(0, Number(item.hours) || 0);
  const activityNo = normalizeActivityNo(item.activityNo, parseActivityNo(nextActivityNo(siblings)));
  return {
    id: trimText(item.id) || uid(),
    activityNo: activityNo || nextActivityNo(siblings),
    wbs: trimText(item.wbs),
    unit: trimText(item.unit),
    name: description,
    description,
    resource: resources[0] ?? "",
    resources,
    people,
    phaseId: isPhaseId(String(item.phaseId || "")) ? (item.phaseId as PhaseId) : "",
    hours,
  };
}

export function normalizeWorkActivities(raw: unknown): WorkActivity[] {
  if (!Array.isArray(raw)) return [];
  const rows: WorkActivity[] = [];
  for (const item of raw) {
    rows.push(normalizeWorkActivity(item, rows));
  }
  return rows;
}

export function isPhaseId(value: string): value is PhaseId {
  return (LOCKED_PHASES as readonly string[]).includes(value);
}

export function activityHours(rows: WorkActivity[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.hours) || 0), 0);
}

export function activityHasWork(row: unknown): boolean {
  const item = asRecord(row);
  if (!item) return false;
  const description = activityDescriptionOf(item);
  const resources = activityResourcesOf(item);
  const people = activityPeopleOf(item);
  return Boolean(
    description ||
      trimText(item.wbs) ||
      trimText(item.unit) ||
      resources.length ||
      people.length ||
      Number(item.hours) > 0,
  );
}

export function activitiesHaveWork(rows: unknown): boolean {
  return Array.isArray(rows) && rows.some(activityHasWork);
}

export function readActivities(key: string): WorkActivity[] | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.localStorage.getItem(`${ACTIVITY_STORE_PREFIX}${key}`);
    if (raw == null) return null;
    return normalizeWorkActivities(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeActivities(key: string, rows: WorkActivity[]) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${ACTIVITY_STORE_PREFIX}${key}`, JSON.stringify(normalizeWorkActivities(rows)));
  } catch {
    // keep the previous copy
  }
}
