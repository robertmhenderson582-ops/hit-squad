export const CIRCUIT_COUNT = 24;
export const DRUM_TUBE_COUNT = 76;
export const SIDE_WALL_TUBE_COUNT = 22;
export const SIDE_WALLS = ["LEFT", "RIGHT"] as const;

export const ROLL_STEPS = [
  { id: "stub-removed", label: "Tube Stub Removed" },
  { id: "hole-cleaned", label: "Drum Hole Cleaned" },
  { id: "hole-marked", label: "Drum Hole Marked For Repair" },
  { id: "hole-repaired", label: "Drum Hole Repaired" },
  { id: "tube-installed", label: "Tube Installed" },
  { id: "final-roll", label: "Tube Final Roll" },
] as const;

export type RollStepId = (typeof ROLL_STEPS)[number]["id"];
export type SideWall = (typeof SIDE_WALLS)[number];
export type RollingSheetId = "steam" | "mud" | "sidewalls" | "productivity";

export const ROLLING_SHEETS = [
  {
    id: "steam" as const,
    label: "Steam Drum",
    title: "Steam Drum Rolling Chart",
    tracking: "Steam Drum Rolling Tracking Chart",
  },
  {
    id: "mud" as const,
    label: "Mud Drum",
    title: "Mud Drum Rolling Tracking Chart",
    tracking: "Mud Drum Rolling Tracking Chart",
  },
  {
    id: "sidewalls" as const,
    label: "Side Walls",
    title: "Side Walls",
    tracking: "Side Walls",
  },
  {
    id: "productivity" as const,
    label: "Productivity Chart",
    title: "Generating Bank Retube Progression Chart",
    tracking: "Generating Bank Retube Progression Chart",
  },
] as const;

export type RollingTube = {
  steps: Partial<Record<RollStepId, boolean>>;
  actualTubeId: string;
};

export type RollingChartState = {
  idealPercentageRoll: string;
  averageTubeId: string;
  averageTubeOd: string;
  tubes: Record<string, RollingTube>;
};

export function emptyRollingChart(): RollingChartState {
  return {
    idealPercentageRoll: "",
    averageTubeId: "",
    averageTubeOd: "",
    tubes: {},
  };
}

export function hydrateRollingChart(
  raw: Partial<RollingChartState> | Record<string, unknown> | null | undefined,
): RollingChartState {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = row.tubes && typeof row.tubes === "object" ? (row.tubes as Record<string, unknown>) : {};
  const tubes: Record<string, RollingTube> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!value || typeof value !== "object") continue;
    const item = value as { steps?: Record<string, unknown>; actualTubeId?: unknown };
    const steps: Partial<Record<RollStepId, boolean>> = {};
    for (const step of ROLL_STEPS) {
      if (item.steps?.[step.id] === true) steps[step.id] = true;
    }
    const actualTubeId = typeof item.actualTubeId === "string" ? item.actualTubeId : "";
    if (!Object.keys(steps).length && !actualTubeId.trim()) continue;
    tubes[key] = { steps, actualTubeId };
  }
  return {
    idealPercentageRoll: typeof row.idealPercentageRoll === "string" ? row.idealPercentageRoll : "",
    averageTubeId: typeof row.averageTubeId === "string" ? row.averageTubeId : "",
    averageTubeOd: typeof row.averageTubeOd === "string" ? row.averageTubeOd : "",
    tubes,
  };
}

export function drumTubeKey(sheet: "steam" | "mud", circuit: number, tube: number) {
  return `${sheet}:${circuit}:${tube}`;
}

export function sideWallTubeKey(side: SideWall, tube: number) {
  return `sidewalls:${side}:${tube}`;
}

export function emptyRollingTube(): RollingTube {
  return { steps: {}, actualTubeId: "" };
}

export function readRollingTube(state: RollingChartState, key: string): RollingTube {
  return state.tubes[key] ?? emptyRollingTube();
}

export function stepCount(tube: RollingTube) {
  return ROLL_STEPS.filter((step) => tube.steps[step.id]).length;
}

/** Empty Actual Tube ID stays empty — no workbook formula noise. */
export function wallReductionPct(actualId: string, avgId: string, avgOd: string): number | null {
  if (!actualId.trim()) return null;
  const actual = Number(actualId);
  const id = Number(avgId);
  const od = Number(avgOd);
  if (!Number.isFinite(actual) || !Number.isFinite(id) || !Number.isFinite(od)) return null;
  const span = od - id;
  if (span <= 0) return null;
  return Math.round(((actual - id) / span) * 10000) / 100;
}

export function formatWallReduction(actualId: string, avgId: string, avgOd: string) {
  const pct = wallReductionPct(actualId, avgId, avgOd);
  return pct == null ? "" : `${pct}`;
}

export function drumTubeTotal() {
  return CIRCUIT_COUNT * DRUM_TUBE_COUNT;
}

export function sideWallTubeTotal() {
  return SIDE_WALLS.length * SIDE_WALL_TUBE_COUNT;
}

export type SheetProgress = {
  sheet: Exclude<RollingSheetId, "productivity">;
  total: number;
  steps: Record<RollStepId, number>;
};

function countSheet(
  state: RollingChartState,
  sheet: Exclude<RollingSheetId, "productivity">,
  keys: string[],
): SheetProgress {
  const steps = Object.fromEntries(ROLL_STEPS.map((step) => [step.id, 0])) as Record<RollStepId, number>;
  for (const key of keys) {
    const tube = readRollingTube(state, key);
    for (const step of ROLL_STEPS) {
      if (tube.steps[step.id]) steps[step.id] += 1;
    }
  }
  return { sheet, total: keys.length, steps };
}

export function drumKeys(sheet: "steam" | "mud") {
  const keys: string[] = [];
  for (let circuit = 1; circuit <= CIRCUIT_COUNT; circuit += 1) {
    for (let tube = 1; tube <= DRUM_TUBE_COUNT; tube += 1) {
      keys.push(drumTubeKey(sheet, circuit, tube));
    }
  }
  return keys;
}

export function sideWallKeys() {
  const keys: string[] = [];
  for (const side of SIDE_WALLS) {
    for (let tube = 1; tube <= SIDE_WALL_TUBE_COUNT; tube += 1) {
      keys.push(sideWallTubeKey(side, tube));
    }
  }
  return keys;
}

/** Live progression. No invented hours. */
export function rollingProgression(state: RollingChartState): SheetProgress[] {
  return [
    countSheet(state, "steam", drumKeys("steam")),
    countSheet(state, "mud", drumKeys("mud")),
    countSheet(state, "sidewalls", sideWallKeys()),
  ];
}

export function rollingHasElevationField() {
  return false;
}
