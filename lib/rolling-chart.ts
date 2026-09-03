export const CIRCUIT_HINT = 24;
export const TUBE_HINT = 76;
export const SIDE_WALL_HINT = 22;
export const WALL_BAND_HINTS = { low: "10", ideal: "12", high: "14" } as const;

/** Typical generating-bank hints. Setup owns the live count — these are not a lock. */
export const CIRCUIT_COUNT = CIRCUIT_HINT;
export const DRUM_TUBE_COUNT = TUBE_HINT;
export const SIDE_WALL_TUBE_COUNT = SIDE_WALL_HINT;
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
export type SideWallMode = "none" | "left-right";
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
  drumHoleId: string;
};

export type RollingChartState = {
  bankName: string;
  circuits: string;
  tubesPerCircuit: string;
  steamDrum: boolean;
  mudDrum: boolean;
  sideWalls: SideWallMode;
  leftTubeCount: string;
  rightTubeCount: string;
  idealPercentageRoll: string;
  averageTubeId: string;
  averageTubeOd: string;
  wallBandLow: string;
  wallBandIdeal: string;
  wallBandHigh: string;
  tubes: Record<string, RollingTube>;
};

export function emptyRollingChart(): RollingChartState {
  return {
    bankName: "",
    circuits: "",
    tubesPerCircuit: "",
    steamDrum: true,
    mudDrum: true,
    sideWalls: "left-right",
    leftTubeCount: "",
    rightTubeCount: "",
    idealPercentageRoll: "",
    averageTubeId: "",
    averageTubeOd: "",
    wallBandLow: "",
    wallBandIdeal: "",
    wallBandHigh: "",
    tubes: {},
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value != null && typeof value !== "object" ? String(value) : "";
}

export function hydrateRollingChart(
  raw: Partial<RollingChartState> | Record<string, unknown> | null | undefined,
): RollingChartState {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = row.tubes && typeof row.tubes === "object" ? (row.tubes as Record<string, unknown>) : {};
  const tubes: Record<string, RollingTube> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!value || typeof value !== "object") continue;
    const item = value as { steps?: Record<string, unknown>; actualTubeId?: unknown; drumHoleId?: unknown };
    const steps: Partial<Record<RollStepId, boolean>> = {};
    for (const step of ROLL_STEPS) {
      if (item.steps?.[step.id] === true) steps[step.id] = true;
    }
    const actualTubeId = typeof item.actualTubeId === "string" ? item.actualTubeId : "";
    const drumHoleId = typeof item.drumHoleId === "string" ? item.drumHoleId : "";
    if (!Object.keys(steps).length && !actualTubeId.trim() && !drumHoleId.trim()) continue;
    tubes[key] = { steps, actualTubeId, drumHoleId };
  }
  const sideWalls = row.sideWalls === "none" || row.sideWalls === "left-right" ? row.sideWalls : "left-right";
  return {
    bankName: asString(row.bankName),
    circuits: asString(row.circuits),
    tubesPerCircuit: asString(row.tubesPerCircuit),
    steamDrum: row.steamDrum !== false,
    mudDrum: row.mudDrum !== false,
    sideWalls,
    leftTubeCount: asString(row.leftTubeCount),
    rightTubeCount: asString(row.rightTubeCount),
    idealPercentageRoll: asString(row.idealPercentageRoll),
    averageTubeId: asString(row.averageTubeId),
    averageTubeOd: asString(row.averageTubeOd),
    wallBandLow: asString(row.wallBandLow),
    wallBandIdeal: asString(row.wallBandIdeal),
    wallBandHigh: asString(row.wallBandHigh),
    tubes,
  };
}

export function parseSetupCount(raw: string, max = 200): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}

/** Empty until set. Typical 1–40. Hint 24, not a lock. */
export function liveCircuitCount(state: RollingChartState) {
  return parseSetupCount(state.circuits, 40) ?? 0;
}

/** Empty until set. Typical 1–120. Hint 76. */
export function liveTubesPerCircuit(state: RollingChartState) {
  return parseSetupCount(state.tubesPerCircuit, 120) ?? 0;
}

export function liveSideCount(state: RollingChartState, side: SideWall) {
  if (state.sideWalls === "none") return 0;
  const raw = side === "LEFT" ? state.leftTubeCount : state.rightTubeCount;
  return parseSetupCount(raw, 120) ?? 0;
}

export function chartSetupReady(state: RollingChartState) {
  const circuits = liveCircuitCount(state);
  const tubes = liveTubesPerCircuit(state);
  const sides = liveSideCount(state, "LEFT") + liveSideCount(state, "RIGHT");
  return (state.steamDrum || state.mudDrum) && circuits > 0 && tubes > 0
    ? true
    : state.sideWalls === "left-right" && sides > 0;
}

export function drumTubeKey(sheet: "steam" | "mud", circuit: number, tube: number) {
  return `${sheet}:${circuit}:${tube}`;
}

export function sideWallTubeKey(side: SideWall, tube: number) {
  return `sidewalls:${side}:${tube}`;
}

export function emptyRollingTube(): RollingTube {
  return { steps: {}, actualTubeId: "", drumHoleId: "" };
}

export function readRollingTube(state: RollingChartState, key: string): RollingTube {
  return state.tubes[key] ?? emptyRollingTube();
}

export function stepCount(tube: RollingTube) {
  return ROLL_STEPS.filter((step) => tube.steps[step.id]).length;
}

export function lastMarkedStep(tube: RollingTube): RollStepId | null {
  let last: RollStepId | null = null;
  for (const step of ROLL_STEPS) {
    if (tube.steps[step.id]) last = step.id;
  }
  return last;
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

export type WallBand = "under" | "pass" | "over";

export function wallReductionBand(
  actualId: string,
  avgId: string,
  avgOd: string,
  low: string,
  high: string,
): WallBand | null {
  const pct = wallReductionPct(actualId, avgId, avgOd);
  if (pct == null) return null;
  const lo = Number(low.trim() || WALL_BAND_HINTS.low);
  const hi = Number(high.trim() || WALL_BAND_HINTS.high);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (pct < lo) return "under";
  if (pct > hi) return "over";
  return "pass";
}

export function drumKeys(state: RollingChartState, sheet: "steam" | "mud") {
  const keys: string[] = [];
  const circuits = liveCircuitCount(state);
  const tubes = liveTubesPerCircuit(state);
  for (let circuit = 1; circuit <= circuits; circuit += 1) {
    for (let tube = 1; tube <= tubes; tube += 1) {
      keys.push(drumTubeKey(sheet, circuit, tube));
    }
  }
  return keys;
}

export function sideWallKeys(state: RollingChartState) {
  const keys: string[] = [];
  for (const side of SIDE_WALLS) {
    const count = liveSideCount(state, side);
    for (let tube = 1; tube <= count; tube += 1) {
      keys.push(sideWallTubeKey(side, tube));
    }
  }
  return keys;
}

export function keyInLiveMap(state: RollingChartState, key: string) {
  const drum = /^(steam|mud):(\d+):(\d+)$/.exec(key);
  if (drum) {
    const sheet = drum[1] as "steam" | "mud";
    if (sheet === "steam" && !state.steamDrum) return false;
    if (sheet === "mud" && !state.mudDrum) return false;
    const circuit = Number(drum[2]);
    const tube = Number(drum[3]);
    return circuit >= 1 && circuit <= liveCircuitCount(state) && tube >= 1 && tube <= liveTubesPerCircuit(state);
  }
  const side = /^sidewalls:(LEFT|RIGHT):(\d+)$/.exec(key);
  if (side) {
    const wall = side[1] as SideWall;
    const tube = Number(side[2]);
    return tube >= 1 && tube <= liveSideCount(state, wall);
  }
  return false;
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

/** Live progression from Yes marks. No invented hours. Geometry from setup, not hardcoded 24×76. */
export function rollingProgression(state: RollingChartState): SheetProgress[] {
  const rows: SheetProgress[] = [];
  if (state.steamDrum) rows.push(countSheet(state, "steam", drumKeys(state, "steam")));
  if (state.mudDrum) rows.push(countSheet(state, "mud", drumKeys(state, "mud")));
  if (state.sideWalls !== "none") rows.push(countSheet(state, "sidewalls", sideWallKeys(state)));
  return rows;
}

export function rollingHasElevationField() {
  return false;
}
