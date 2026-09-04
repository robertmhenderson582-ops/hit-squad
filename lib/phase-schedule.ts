export const PHASE_IDS = ["pre", "oil-out", "mech", "oil-in", "post"] as const;
export type PhaseId = (typeof PHASE_IDS)[number];

export const PHASE_NAMES: Record<PhaseId, string> = {
  pre: "Pre-Turnaround",
  "oil-out": "Oil Out",
  mech: "Mechanical Window",
  "oil-in": "Oil In",
  post: "Post",
};

export const PHASE_TONES: Record<PhaseId, string> = {
  pre: "phase-moss",
  "oil-out": "phase-rust",
  mech: "phase-steel",
  "oil-in": "phase-amber",
  post: "phase-green",
};

/** Desk `globals.css` light phase fills (`.phase-moss` … `.phase-green`). Excel ARGB. */
export const PHASE_TONE_FILLS: Record<PhaseId, string> = {
  pre: "FFD5E2C4",
  "oil-out": "FFEBCFC0",
  mech: "FFC5D0D5",
  "oil-in": "FFE6CE86",
  post: "FFC0DEC6",
};

/** Desk rule: dark high-contrast type on the phase chip (`color: #163038`). */
export const PHASE_TONE_INK = "FF163038";

export function isPhaseId(value: string): value is PhaseId {
  return (PHASE_IDS as readonly string[]).includes(value);
}

/** ON Job setup windows that own the calendar. Multi-unit uses unit phases when any are on. */
export function liveJobSetupPhases(schedule?: {
  multiUnits?: boolean;
  phases?: PhaseRow[];
  units?: Array<{ phases?: PhaseRow[] }>;
}): PhaseRow[] {
  const on = (rows: PhaseRow[] | undefined) =>
    (rows ?? []).filter((row) => row.on && Boolean(row.start) && Boolean(row.stop));
  if (schedule?.multiUnits && schedule.units?.length) {
    const fromUnits = schedule.units.flatMap((unit) => on(unit.phases));
    if (fromUnits.length) return fromUnits;
  }
  return on(schedule?.phases);
}

/** Inclusive start/stop. Canonical phase order wins if windows overlap. */
export function phaseOwningDate(phases: PhaseRow[], ymd: string): PhaseRow | undefined {
  const hits = phases.filter((row) => row.on && row.start && row.stop && ymd >= row.start && ymd <= row.stop);
  if (!hits.length) return undefined;
  hits.sort((a, b) => {
    const order = PHASE_IDS.indexOf(a.id) - PHASE_IDS.indexOf(b.id);
    if (order !== 0) return order;
    return a.start.localeCompare(b.start);
  });
  return hits[0];
}

export type PhaseBarRun = { phase: PhaseRow; startIndex: number; endIndex: number };

/** Contiguous same-phase days on a calendar (column index into `dates`). */
export function phaseBarRuns(dates: string[], phases: PhaseRow[]): PhaseBarRun[] {
  const runs: PhaseBarRun[] = [];
  dates.forEach((ymd, index) => {
    const phase = phaseOwningDate(phases, ymd);
    if (!phase) return;
    const last = runs[runs.length - 1];
    if (last && last.endIndex === index - 1 && last.phase.id === phase.id) {
      last.endIndex = index;
      return;
    }
    runs.push({ phase, startIndex: index, endIndex: index });
  });
  return runs;
}

export type PhaseOtPick = "4x10-st" | "4x10-ot8" | "5x8-st" | "5x8-ot8";

/** Pre-Turnaround and Post share this list. Do not shorten Pre. */
export const PHASE_OT_PICKS: Array<{ id: PhaseOtPick; label: string }> = [
  { id: "5x8-st", label: "5×8 — all straight time" },
  { id: "5x8-ot8", label: "5×8 — OT after 8 hours" },
  { id: "4x10-st", label: "4×10 — all 10 ST" },
  { id: "4x10-ot8", label: "4×10 — OT after 8" },
];

export function otPicksForPhase(id: PhaseId) {
  if (id === "pre" || id === "post") return PHASE_OT_PICKS;
  return null;
}

export type PhaseRow = {
  id: PhaseId;
  name: string;
  on: boolean;
  start: string;
  stop: string;
  daysPerWeek: number;
  hoursPerDay: number;
  otAfter8: boolean;
  sundaysOff: string[];
};

export type JobUnit = {
  id: string;
  name: string;
  phases: PhaseRow[];
};

export type PhaseScheduleState = {
  projectStart: string;
  phases: PhaseRow[];
  multiUnits: boolean;
  units: JobUnit[];
};

export const PHASE_STORE_PREFIX = "hs_phase_v1:";
export const CREW_STORE_PREFIX = "hs_crew_v1:";

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseYmd(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

export function inclusiveDays(start: string, stop: string): number {
  const from = parseYmd(start);
  const to = parseYmd(stop);
  if (!from || !to || to < from) return 1;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function eachYmd(start: string, stop: string): string[] {
  const from = parseYmd(start);
  const to = parseYmd(stop);
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    out.push(formatYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function maskForPhaseDays(daysPerWeek: number): boolean[] {
  const count = Math.min(7, Math.max(0, Math.round(daysPerWeek)));
  if (count === 7) return [true, true, true, true, true, true, true];
  if (count === 6) return [false, true, true, true, true, true, true];
  if (count === 5) return [false, true, true, true, true, true, false];
  if (count === 4) return [false, true, true, true, true, false, false];
  const next = [false, false, false, false, false, false, false];
  const order = [1, 2, 3, 4, 5, 6, 0];
  for (let i = 0; i < count; i += 1) next[order[i]] = true;
  return next;
}

/** 4-day = Mon–Thu. 5-day skips weekends. 6-day skips Sunday. 7-day every day. */
export function isWorkedDay(iso: string, daysPerWeek: number, sundaysOff: string[] = []): boolean {
  const date = parseYmd(iso);
  if (!date) return false;
  const dow = date.getDay();
  const days = Math.min(7, Math.max(0, Math.round(daysPerWeek)));
  if (days === 7) {
    if (dow === 0 && sundaysOff.includes(iso)) return false;
    return true;
  }
  return Boolean(maskForPhaseDays(days)[dow]);
}

export function workedDays(row: Pick<PhaseRow, "start" | "stop" | "daysPerWeek" | "sundaysOff">): number {
  return eachYmd(row.start, row.stop).filter((iso) => isWorkedDay(iso, row.daysPerWeek, row.sundaysOff)).length;
}

export function sundaysInRange(start: string, stop: string): string[] {
  return eachYmd(start, stop).filter((iso) => parseYmd(iso)?.getDay() === 0);
}

export function defaultPhases(): PhaseRow[] {
  return [
    {
      id: "pre",
      name: PHASE_NAMES.pre,
      on: true,
      start: "2026-08-21",
      stop: "2026-09-03",
      daysPerWeek: 4,
      hoursPerDay: 10,
      otAfter8: false,
      sundaysOff: [],
    },
    {
      id: "oil-out",
      name: PHASE_NAMES["oil-out"],
      on: true,
      start: "2026-09-04",
      stop: "2026-09-06",
      daysPerWeek: 7,
      hoursPerDay: 12,
      otAfter8: false,
      sundaysOff: [],
    },
    {
      id: "mech",
      name: PHASE_NAMES.mech,
      on: true,
      start: "2026-09-07",
      stop: "2026-09-20",
      daysPerWeek: 6,
      hoursPerDay: 10,
      otAfter8: false,
      sundaysOff: [],
    },
    {
      id: "oil-in",
      name: PHASE_NAMES["oil-in"],
      on: true,
      start: "2026-09-21",
      stop: "2026-09-27",
      daysPerWeek: 7,
      hoursPerDay: 12,
      otAfter8: false,
      sundaysOff: [],
    },
    {
      id: "post",
      name: PHASE_NAMES.post,
      on: true,
      start: "2026-09-28",
      stop: "2026-10-05",
      daysPerWeek: 5,
      hoursPerDay: 8,
      otAfter8: false,
      sundaysOff: [],
    },
  ];
}

export function defaultPhaseSchedule(): PhaseScheduleState {
  const phases = defaultPhases();
  return { projectStart: phases[0].start, phases, multiUnits: false, units: [] };
}

function unitUid() {
  return `unit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function clonePhases(phases: PhaseRow[]): PhaseRow[] {
  return phases.map((row) => ({ ...row, sundaysOff: [...row.sundaysOff] }));
}

export function blankUnit(name: string, template: PhaseRow[] = defaultPhases()): JobUnit {
  return {
    id: unitUid(),
    name: name.trim() || "Unit",
    phases: clonePhases(template),
  };
}

function mergeUnit(saved: Partial<JobUnit> | undefined, index: number): JobUnit {
  const phases = mergeSchedule({
    projectStart: "",
    phases: Array.isArray(saved?.phases) ? saved.phases : [],
    multiUnits: false,
    units: [],
  }).phases;
  return {
    id: typeof saved?.id === "string" && saved.id ? saved.id : `unit-${index + 1}`,
    name: (saved?.name || `Unit ${index + 1}`).trim() || `Unit ${index + 1}`,
    phases,
  };
}

export function setMultiUnits(state: PhaseScheduleState, on: boolean): PhaseScheduleState {
  if (on) {
    const units = state.units.length > 0 ? state.units : [blankUnit("Unit 1", state.phases)];
    return { ...state, multiUnits: true, units };
  }
  const first = state.units[0];
  return {
    ...state,
    multiUnits: false,
    phases: first ? cascadePhases(mergeSchedule({ ...state, phases: first.phases }).phases) : state.phases,
  };
}

export function addUnit(state: PhaseScheduleState): PhaseScheduleState {
  const template = state.units[state.units.length - 1]?.phases ?? state.phases;
  return {
    ...state,
    multiUnits: true,
    units: [...state.units, blankUnit(`Unit ${state.units.length + 1}`, template)],
  };
}

export function removeUnit(state: PhaseScheduleState, id: string): PhaseScheduleState {
  if (state.units.length <= 1) return state;
  return { ...state, units: state.units.filter((unit) => unit.id !== id) };
}

export function renameUnit(state: PhaseScheduleState, id: string, name: string): PhaseScheduleState {
  return {
    ...state,
    units: state.units.map((unit) => (unit.id === id ? { ...unit, name: name.trim() || unit.name } : unit)),
  };
}

export function patchUnitPhase(
  state: PhaseScheduleState,
  unitId: string,
  id: PhaseId,
  patch: Partial<PhaseRow>,
): PhaseScheduleState {
  return {
    ...state,
    units: state.units.map((unit) => {
      if (unit.id !== unitId) return unit;
      return { ...unit, phases: patchPhase({ ...state, phases: unit.phases }, id, patch).phases };
    }),
  };
}

export function applyUnitOtPick(
  state: PhaseScheduleState,
  unitId: string,
  id: PhaseId,
  pick: PhaseOtPick,
): PhaseScheduleState {
  return {
    ...state,
    units: state.units.map((unit) => {
      if (unit.id !== unitId) return unit;
      return { ...unit, phases: applyOtPick({ ...state, phases: unit.phases }, id, pick).phases };
    }),
  };
}

export function phaseForRange(
  range: { phaseId?: string; unitId?: string },
  phases: PhaseRow[],
  units: JobUnit[] = [],
  multiUnits = false,
): PhaseRow | undefined {
  if (multiUnits && range.unitId) {
    const unitPhase = units.find((unit) => unit.id === range.unitId)?.phases.find((row) => row.id === range.phaseId);
    if (unitPhase) return unitPhase;
  }
  return phases.find((row) => row.id === range.phaseId);
}

export function mergeSchedule(saved: Partial<PhaseScheduleState> | null | undefined): PhaseScheduleState {
  const base = defaultPhaseSchedule();
  if (!saved) return base;
  const incoming = Array.isArray(saved.phases) ? saved.phases : [];
  return {
    projectStart: saved.projectStart || base.projectStart,
    multiUnits: Boolean(saved.multiUnits),
    units: Array.isArray(saved.units) ? saved.units.map((unit, index) => mergeUnit(unit, index)) : [],
    phases: base.phases.map((row) => {
      const hit = incoming.find((item) => item.id === row.id);
      if (!hit) return row;
      return {
        ...row,
        ...hit,
        id: row.id,
        name: row.name,
        daysPerWeek: Math.min(7, Math.max(0, Number(hit.daysPerWeek ?? row.daysPerWeek) || 0)),
        hoursPerDay: Math.max(0, Number(hit.hoursPerDay ?? row.hoursPerDay) || 0),
        sundaysOff: Array.isArray(hit.sundaysOff) ? hit.sundaysOff : row.sundaysOff,
        on: Boolean(hit.on),
      };
    }),
  };
}

function lengthOf(row: PhaseRow): number {
  return Math.max(1, inclusiveDays(row.start, row.stop));
}

/** Pack ON phases back-to-back. OFF rows keep locked dates and are ignored as neighbors. */
export function cascadePhases(phases: PhaseRow[]): PhaseRow[] {
  let prevOnStop: string | null = null;
  return phases.map((row) => {
    if (!row.on) return row;
    const length = lengthOf(row);
    let start = row.start;
    let stop = row.stop;
    if (prevOnStop) {
      start = addDays(prevOnStop, 1);
      stop = addDays(start, length - 1);
    }
    if (stop < start) stop = start;
    prevOnStop = stop;
    return { ...row, start, stop };
  });
}

export function setProjectStart(state: PhaseScheduleState, projectStart: string): PhaseScheduleState {
  const start = parseYmd(projectStart) ? projectStart : state.projectStart;
  const phases = state.phases.map((row) => {
    if (row.id !== "pre") return row;
    const length = lengthOf(row);
    return { ...row, start, stop: addDays(start, length - 1) };
  });
  return { ...state, projectStart: start, phases: cascadePhases(phases) };
}

export function patchPhase(state: PhaseScheduleState, id: PhaseId, patch: Partial<PhaseRow>): PhaseScheduleState {
  const phases = state.phases.map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch, id: row.id, name: row.name };
    if (next.stop < next.start) next.stop = next.start;
    next.daysPerWeek = Math.min(7, Math.max(0, next.daysPerWeek));
    next.hoursPerDay = Math.max(0, next.hoursPerDay);
    return next;
  });
  const packed = cascadePhases(phases);
  const pre = packed.find((row) => row.id === "pre");
  return {
    ...state,
    projectStart: id === "pre" && patch.start && pre ? pre.start : state.projectStart,
    phases: packed,
  };
}

export function applyOtPick(state: PhaseScheduleState, id: PhaseId, pick: PhaseOtPick): PhaseScheduleState {
  if (pick === "4x10-st") {
    return patchPhase(state, id, { daysPerWeek: 4, hoursPerDay: 10, otAfter8: false });
  }
  if (pick === "4x10-ot8") {
    return patchPhase(state, id, { daysPerWeek: 4, hoursPerDay: 10, otAfter8: true });
  }
  if (pick === "5x8-ot8") {
    return patchPhase(state, id, { daysPerWeek: 5, hoursPerDay: 8, otAfter8: true });
  }
  return patchPhase(state, id, { daysPerWeek: 5, hoursPerDay: 8, otAfter8: false });
}

export function phaseOtPick(row: PhaseRow): PhaseOtPick | null {
  if (row.daysPerWeek === 4 && row.hoursPerDay === 10) return row.otAfter8 ? "4x10-ot8" : "4x10-st";
  if (row.daysPerWeek === 5 && row.hoursPerDay === 8) return row.otAfter8 ? "5x8-ot8" : "5x8-st";
  return null;
}

export type PhaseRangeSeed = {
  id: string;
  phaseId: PhaseId;
  start: string;
  end: string;
  hoursPerShift: number;
  days: boolean[];
  otAfter8: boolean;
  skipDates: string[];
};

export function rangeSeedFromPhase(row: PhaseRow): PhaseRangeSeed {
  return {
    id: `rg-${row.id}`,
    phaseId: row.id,
    start: row.start,
    end: row.stop,
    hoursPerShift: row.hoursPerDay,
    days: maskForPhaseDays(row.daysPerWeek),
    otAfter8: row.otAfter8,
    skipDates: row.daysPerWeek === 7 ? [...row.sundaysOff] : [],
  };
}

export function rangeSeedsFromPhases(phases: PhaseRow[]): PhaseRangeSeed[] {
  return phases.filter((row) => row.on).map(rangeSeedFromPhase);
}

export function readSchedule(key: string): PhaseScheduleState {
  if (typeof window === "undefined" || !key) return defaultPhaseSchedule();
  try {
    const raw = window.localStorage.getItem(`${PHASE_STORE_PREFIX}${key}`);
    return mergeSchedule(raw ? (JSON.parse(raw) as PhaseScheduleState) : null);
  } catch {
    return defaultPhaseSchedule();
  }
}

export function writeSchedule(key: string, state: PhaseScheduleState) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${PHASE_STORE_PREFIX}${key}`, JSON.stringify(state));
  } catch {
    // keep the previous copy
  }
}

