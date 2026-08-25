import type { PhaseId } from "./phase-schedule";

const LOCKED_PHASES: PhaseId[] = ["pre", "oil-out", "mech", "oil-in", "post"];

export const ACTIVITY_STORE_PREFIX = "hs_activity_v1:";

export const ACTIVITY_RESOURCES = [
  "Boilermaker",
  "Pipefitter",
  "Operating Engineer",
  "Laborer",
  "Ironworker",
  "Teamster",
  "Merit/staff",
] as const;

export type WorkActivity = {
  id: string;
  activityNo: string;
  wbs: string;
  unit: string;
  name: string;
  resource: (typeof ACTIVITY_RESOURCES)[number] | "";
  phaseId: PhaseId | "";
  hours: number;
};

function uid() {
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankWorkActivity(index = 1): WorkActivity {
  return {
    id: uid(),
    activityNo: String(index).padStart(2, "0"),
    wbs: "",
    unit: "",
    name: "",
    resource: "",
    phaseId: "",
    hours: 0,
  };
}

export function isPhaseId(value: string): value is PhaseId {
  return (LOCKED_PHASES as readonly string[]).includes(value);
}

export function activityHours(rows: WorkActivity[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.hours) || 0), 0);
}

export function readActivities(key: string): WorkActivity[] | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.localStorage.getItem(`${ACTIVITY_STORE_PREFIX}${key}`);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as WorkActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeActivities(key: string, rows: WorkActivity[]) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${ACTIVITY_STORE_PREFIX}${key}`, JSON.stringify(rows));
  } catch {
    // keep the previous copy
  }
}
