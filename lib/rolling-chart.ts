export const CIRCUIT_HINT = 24;
export const TUBE_HINT = 76;
export const SIDE_WALL_HINT = 22;
export const CIRCUIT_MAX = 48;
export const TUBE_MAX = 120;
export const SIDE_WALL_MAX = 80;
export const WALL_BAND_HINTS = { low: "10", ideal: "12", high: "14" } as const;
export const TUBE_OD_CHOICES = ["2.0", "2.5", "3.0"] as const;
export const HOLE_KINDS = ["", "skip", "plug", "dummy"] as const;

/** Typical generating-bank hints. Setup owns the live count — these are not a lock. */
export const CIRCUIT_COUNT = CIRCUIT_HINT;
export const DRUM_TUBE_COUNT = TUBE_HINT;
export const SIDE_WALL_TUBE_COUNT = SIDE_WALL_HINT;
export const SIDE_WALLS = ["LEFT", "RIGHT"] as const;

export const ROLL_STEPS = [
  { id: "stub-removed", label: "Tube Stub Removed", mark: "S" },
  { id: "hole-cleaned", label: "Drum Hole Cleaned", mark: "C" },
  { id: "hole-marked", label: "Drum Hole Marked For Repair", mark: "M" },
  { id: "hole-repaired", label: "Drum Hole Repaired", mark: "R" },
  { id: "tube-installed", label: "Tube Installed", mark: "I" },
  { id: "final-roll", label: "Tube Final Roll", mark: "F" },
] as const;

export type RollStepId = (typeof ROLL_STEPS)[number]["id"];
export type SideWall = (typeof SIDE_WALLS)[number];
export type SideWallMode = "none" | "left" | "right" | "both";
export type HoleKind = (typeof HOLE_KINDS)[number];
export type TubeOdChoice = "" | (typeof TUBE_OD_CHOICES)[number];
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
  holeKind: HoleKind;
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
  tubeOd: TubeOdChoice;
  tubeWall: string;
  wallBandLow: string;
  wallBandIdeal: string;
  wallBandHigh: string;
  tube1At: string;
  furnaceSide: string;
  manway: string;
  tubes: Record<string, RollingTube>;
};

export function emptyRollingChart(): RollingChartState {
  return {
    bankName: "",
    circuits: "",
    tubesPerCircuit: "",
    steamDrum: true,
    mudDrum: true,
    sideWalls: "both",
    leftTubeCount: "",
    rightTubeCount: "",
    idealPercentageRoll: "",
    averageTubeId: "",
    averageTubeOd: "",
    tubeOd: "",
    tubeWall: "",
    wallBandLow: "",
    wallBandIdeal: "",
    wallBandHigh: "",
    tube1At: "",
    furnaceSide: "",
    manway: "",
    tubes: {},
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value != null && typeof value !== "object" ? String(value) : "";
}

function asHoleKind(value: unknown): HoleKind {
  return value === "skip" || value === "plug" || value === "dummy" ? value : "";
}

function asTubeOd(value: unknown): TubeOdChoice {
  return value === "2.0" || value === "2.5" || value === "3.0" ? value : "";
}

function asSideWalls(value: unknown): SideWallMode {
  if (value === "none" || value === "left" || value === "right" || value === "both") return value;
  if (value === "left-right") return "both";
  return "both";
}

export function hydrateRollingChart(
  raw: Partial<RollingChartState> | Record<string, unknown> | null | undefined,
): RollingChartState {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = row.tubes && typeof row.tubes === "object" ? (row.tubes as Record<string, unknown>) : {};
  const tubes: Record<string, RollingTube> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!value || typeof value !== "object") continue;
    const item = value as {
      steps?: Record<string, unknown>;
      actualTubeId?: unknown;
      drumHoleId?: unknown;
      holeKind?: unknown;
    };
    const steps: Partial<Record<RollStepId, boolean>> = {};
    for (const step of ROLL_STEPS) {
      if (item.steps?.[step.id] === true) steps[step.id] = true;
    }
    if (steps["hole-repaired"] && !steps["hole-marked"]) delete steps["hole-repaired"];
    const actualTubeId = typeof item.actualTubeId === "string" ? item.actualTubeId : "";
    const drumHoleId = typeof item.drumHoleId === "string" ? item.drumHoleId : "";
    const holeKind = asHoleKind(item.holeKind);
    if (!Object.keys(steps).length && !actualTubeId.trim() && !drumHoleId.trim() && !holeKind) continue;
    tubes[key] = { steps, actualTubeId, drumHoleId, holeKind };
  }
  return {
    bankName: asString(row.bankName),
    circuits: asString(row.circuits),
    tubesPerCircuit: asString(row.tubesPerCircuit),
    steamDrum: row.steamDrum !== false,
    mudDrum: row.mudDrum !== false,
    sideWalls: asSideWalls(row.sideWalls),
    leftTubeCount: asString(row.leftTubeCount),
    rightTubeCount: asString(row.rightTubeCount),
    idealPercentageRoll: asString(row.idealPercentageRoll),
    averageTubeId: asString(row.averageTubeId),
    averageTubeOd: asString(row.averageTubeOd),
    tubeOd: asTubeOd(row.tubeOd),
    tubeWall: asString(row.tubeWall),
    wallBandLow: asString(row.wallBandLow),
    wallBandIdeal: asString(row.wallBandIdeal),
    wallBandHigh: asString(row.wallBandHigh),
    tube1At: asString(row.tube1At),
    furnaceSide: asString(row.furnaceSide),
    manway: asString(row.manway),
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

/** Empty until set. Typical 1–48. Hint 24, not a lock. */
export function liveCircuitCount(state: RollingChartState) {
  return parseSetupCount(state.circuits, CIRCUIT_MAX) ?? 0;
}

/** Empty until set. Typical 1–120. Hint 76. */
export function liveTubesPerCircuit(state: RollingChartState) {
  return parseSetupCount(state.tubesPerCircuit, TUBE_MAX) ?? 0;
}

export function liveSideCount(state: RollingChartState, side: SideWall) {
  if (state.sideWalls === "none") return 0;
  if (state.sideWalls === "left" && side === "RIGHT") return 0;
  if (state.sideWalls === "right" && side === "LEFT") return 0;
  const raw = side === "LEFT" ? state.leftTubeCount : state.rightTubeCount;
  return parseSetupCount(raw, SIDE_WALL_MAX) ?? 0;
}

export function chartSetupReady(state: RollingChartState) {
  const circuits = liveCircuitCount(state);
  const tubes = liveTubesPerCircuit(state);
  const sides = liveSideCount(state, "LEFT") + liveSideCount(state, "RIGHT");
  return (state.steamDrum || state.mudDrum) && circuits > 0 && tubes > 0
    ? true
    : state.sideWalls !== "none" && sides > 0;
}

export function drumTubeKey(sheet: "steam" | "mud", circuit: number, tube: number) {
  return `${sheet}:${circuit}:${tube}`;
}

export function sideWallTubeKey(side: SideWall, tube: number) {
  return `sidewalls:${side}:${tube}`;
}

export function emptyRollingTube(): RollingTube {
  return { steps: {}, actualTubeId: "", drumHoleId: "", holeKind: "" };
}

export function readRollingTube(state: RollingChartState, key: string): RollingTube {
  const tube = state.tubes[key];
  return tube ? { ...emptyRollingTube(), ...tube, holeKind: asHoleKind(tube.holeKind) } : emptyRollingTube();
}

export function stepCount(tube: RollingTube) {
  return ROLL_STEPS.filter((step) => tube.steps[step.id]).length;
}

/** Repair exists only after Marked For Repair. Productivity Yes/No is the step mark. */
export function applyRollSteps(
  steps: Partial<Record<RollStepId, boolean>>,
  id: RollStepId,
  on: boolean,
): Partial<Record<RollStepId, boolean>> {
  const next: Partial<Record<RollStepId, boolean>> = { ...steps, [id]: on };
  if (id === "hole-marked" && !on) delete next["hole-repaired"];
  if (next["hole-repaired"] && !next["hole-marked"]) delete next["hole-repaired"];
  if (!on) delete next[id];
  return next;
}

export function canMarkRepair(tube: RollingTube) {
  return Boolean(tube.steps["hole-marked"]);
}

export function lastMarkedStep(tube: RollingTube): RollStepId | null {
  let last: RollStepId | null = null;
  for (const step of ROLL_STEPS) {
    if (step.id === "hole-repaired" && !tube.steps["hole-marked"]) continue;
    if (tube.steps[step.id]) last = step.id;
  }
  return last;
}

export function stepMark(step: RollStepId | null) {
  return ROLL_STEPS.find((item) => item.id === step)?.mark ?? "";
}

/** BWG decimal inches. Typed BWG or a decimal/fraction wall. */
export const BWG_INCHES: Record<string, number> = {
  "7": 0.18,
  "8": 0.165,
  "9": 0.148,
  "10": 0.134,
  "11": 0.12,
  "12": 0.109,
  "13": 0.095,
  "14": 0.083,
};

export function parseWallInches(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/bwg/g, "").replace(/\s+/g, "");
  if (!text) return null;
  if (BWG_INCHES[text]) return BWG_INCHES[text];
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const value = Number(fraction[1]) / Number(fraction[2]);
    return Number.isFinite(value) && value > 0 && value < 2 ? value : null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value < 2 ? value : null;
}

export function jobTubeOd(state: RollingChartState) {
  return state.averageTubeOd.trim() || state.tubeOd;
}

/** Tube ID from the typed average, or OD minus two walls. Empty stays empty. */
export function derivedTubeId(state: RollingChartState): number | null {
  if (state.averageTubeId.trim()) {
    const value = Number(state.averageTubeId);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const od = Number(jobTubeOd(state));
  const wall = parseWallInches(state.tubeWall);
  if (!Number.isFinite(od) || od <= 0 || wall == null) return null;
  const id = od - 2 * wall;
  return id > 0 ? Math.round(id * 10000) / 10000 : null;
}

export function jobTubeId(state: RollingChartState) {
  const value = derivedTubeId(state);
  return value == null ? "" : String(value);
}

export function defaultHoleId(od: string) {
  const value = Number(od);
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round((value + 1 / 32) * 10000) / 10000);
}

/** Per-hole Drum ID after clean/repair overrides the job default (OD + 1/32). */
export function effectiveDrumHoleId(tube: RollingTube, state: RollingChartState) {
  if (tube.drumHoleId.trim()) return tube.drumHoleId.trim();
  return defaultHoleId(jobTubeOd(state));
}

/** Empty Actual Tube ID stays empty — no workbook formula noise, never 0 / -0.26 / #VALUE. */
export function wallReductionPct(actualId: string, avgId: string, avgOd: string): number | null {
  if (!actualId.trim()) return null;
  const actual = Number(actualId);
  const id = Number(avgId);
  const od = Number(avgOd);
  if (!Number.isFinite(actual) || !Number.isFinite(id) || !Number.isFinite(od)) return null;
  const span = od - id;
  if (span <= 0) return null;
  const pct = ((actual - id) / span) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}

export function wallReductionForTube(tube: RollingTube, state: RollingChartState): number | null {
  return wallReductionPct(tube.actualTubeId, jobTubeId(state), jobTubeOd(state));
}

export function formatWallReduction(actualId: string, avgId: string, avgOd: string) {
  const pct = wallReductionPct(actualId, avgId, avgOd);
  return pct == null ? "" : `${pct}`;
}

export function targetWallReduction(state: RollingChartState) {
  const typed = Number((state.idealPercentageRoll || state.wallBandIdeal).trim() || WALL_BAND_HINTS.ideal);
  return Number.isFinite(typed) ? typed : Number(WALL_BAND_HINTS.ideal);
}

/** Ideal ID only when a drum hole and tube dims exist. Never invent from an empty Actual ID. */
export function idealTubeId(tube: RollingTube, state: RollingChartState): number | null {
  if (!effectiveDrumHoleId(tube, state)) return null;
  const id = derivedTubeId(state);
  const od = Number(jobTubeOd(state));
  if (id == null || !Number.isFinite(od)) return null;
  const span = od - id;
  if (span <= 0) return null;
  return Math.round((id + (targetWallReduction(state) / 100) * span) * 10000) / 10000;
}

export function formatIdealTubeId(tube: RollingTube, state: RollingChartState) {
  const value = idealTubeId(tube, state);
  return value == null ? "" : String(value);
}

export function wallReductionVsIdeal(actualId: string, avgId: string, avgOd: string, target: string): number | null {
  const pct = wallReductionPct(actualId, avgId, avgOd);
  if (pct == null) return null;
  const goal = Number(target.trim() || WALL_BAND_HINTS.ideal);
  if (!Number.isFinite(goal)) return null;
  return Math.round((pct - goal) * 100) / 100;
}

export type WallBand = "under" | "low-ok" | "target" | "over";

export const WALL_BAND_MARK: Record<WallBand, string> = {
  under: "U",
  "low-ok": "L",
  target: "T",
  over: "O",
};

export const WALL_BAND_LABEL: Record<WallBand, string> = {
  under: "UNDER — re-roll",
  "low-ok": "Low-ok",
  target: "Target",
  over: "OVER — inspect, do not auto-scrap",
};

export function wallReductionBand(
  actualId: string,
  avgId: string,
  avgOd: string,
  low: string,
  high: string,
  ideal = "",
): WallBand | null {
  const pct = wallReductionPct(actualId, avgId, avgOd);
  if (pct == null) return null;
  const lo = Number(low.trim() || WALL_BAND_HINTS.low);
  const mid = Number(ideal.trim() || WALL_BAND_HINTS.ideal);
  const hi = Number(high.trim() || WALL_BAND_HINTS.high);
  if (!Number.isFinite(lo) || !Number.isFinite(mid) || !Number.isFinite(hi)) return null;
  if (pct < lo) return "under";
  if (pct < mid) return "low-ok";
  if (pct <= hi) return "target";
  return "over";
}

export function wallReductionVsIdealForTube(tube: RollingTube, state: RollingChartState): number | null {
  return wallReductionVsIdeal(tube.actualTubeId, jobTubeId(state), jobTubeOd(state), state.idealPercentageRoll || state.wallBandIdeal);
}

export function wallReductionBandForTube(tube: RollingTube, state: RollingChartState): WallBand | null {
  return wallReductionBand(
    tube.actualTubeId,
    jobTubeId(state),
    jobTubeOd(state),
    state.wallBandLow,
    state.wallBandHigh,
    state.wallBandIdeal || state.idealPercentageRoll,
  );
}

export function tubeCellMark(state: RollingChartState, tube: RollingTube) {
  if (tube.holeKind === "skip") return "X";
  if (tube.holeKind === "plug") return "P";
  if (tube.holeKind === "dummy") return "D";
  const band = wallReductionBandForTube(tube, state);
  if (band) return WALL_BAND_MARK[band];
  return stepMark(lastMarkedStep(tube));
}

export function parseTubeKey(key: string) {
  const drum = /^(steam|mud):(\d+):(\d+)$/.exec(key);
  if (drum) {
    return { sheet: drum[1] as "steam" | "mud", circuit: Number(drum[2]), tube: Number(drum[3]), side: null as SideWall | null };
  }
  const side = /^sidewalls:(LEFT|RIGHT):(\d+)$/.exec(key);
  if (side) {
    return { sheet: "sidewalls" as const, circuit: null as number | null, tube: Number(side[2]), side: side[1] as SideWall };
  }
  return null;
}

export function axisLabel(n: number, selected: boolean) {
  return selected || n === 1 || n % 5 === 0 ? String(n) : "";
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

function countableTube(state: RollingChartState, key: string) {
  const tube = readRollingTube(state, key);
  return !tube.holeKind;
}

function countSheet(
  state: RollingChartState,
  sheet: Exclude<RollingSheetId, "productivity">,
  keys: string[],
): SheetProgress {
  const steps = Object.fromEntries(ROLL_STEPS.map((step) => [step.id, 0])) as Record<RollStepId, number>;
  const live = keys.filter((key) => countableTube(state, key));
  for (const key of live) {
    const tube = readRollingTube(state, key);
    for (const step of ROLL_STEPS) {
      if (tube.steps[step.id]) steps[step.id] += 1;
    }
  }
  return { sheet, total: live.length, steps };
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

export type DrumMode = "both" | "steam" | "mud";

export function drumMode(state: RollingChartState): DrumMode {
  if (state.steamDrum && !state.mudDrum) return "steam";
  if (!state.steamDrum && state.mudDrum) return "mud";
  return "both";
}

export function drumsFromMode(mode: string): { steamDrum: boolean; mudDrum: boolean } {
  if (mode === "steam") return { steamDrum: true, mudDrum: false };
  if (mode === "mud") return { steamDrum: false, mudDrum: true };
  return { steamDrum: true, mudDrum: true };
}
