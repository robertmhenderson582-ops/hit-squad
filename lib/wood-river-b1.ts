/**
 * Wood River classic B-1 → Hit Squad live pack.
 *
 * Staff / Foremen / Direct / Support (leading space on official RH tabs)
 * become desk cards Staff / GF / Foreman / Direct Craft / Support.
 * Hours come from typed HC × Hours/shift grids. Labor $ cells that were
 * #REF are not invented — Rate Tables / Shahan titles resolve billable $.
 * Numeric Summary / Misc lines (PD face, materials, heat, staff travel)
 * may seed Other Cost. Excel binaries stay on Drive.
 *
 * Client-safe: static JSON fixture only. Workbook parse lives in wood-river-b1-xlsx.ts.
 *
 * Owner lock 2026-09-07: same Wood River five-card calendar desk as
 * Aromatics / CAT 2. Rodeo / Ferndale stay additive tabs — not a different
 * crew layout. Ranges are Hit Squad phase stacks so export/import UP→DOWN
 * round-trips through estimate-xlsx (hidden ids, Hours/shift).
 */

import boiler17B1CrewJson from "./wake-golden/boiler17-b1-crew.json" with { type: "json" };
import {
  BOILER17_CLIENT,
  BOILER17_COST_NOTE,
  BOILER17_JOB_NUMBER,
  BOILER17_PACK_ID,
  BOILER17_SITE,
  BOILER17_SITE_ID,
  BOILER17_STATUS,
  BOILER17_TITLE,
  boiler17NeedsB1Fill,
  isBoiler17PackId,
} from "./boiler-17.ts";
import { blankCraftRow, hydrateSupportLines, type CalendarRange, type CraftRow } from "./craft-labor.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
const HIS_BOILER17_FILE_ID = "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y";
const NATHAN_DESK_EMAIL = "nathanboyte@gmail.com";
import { blankMisc, emptyOtherCost, type MiscLine, type OtherCostSheet } from "./other-cost.ts";
import {
  PHASE_IDS,
  defaultPhases,
  formatYmd,
  parseYmd,
  type PhaseRow,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import { SHAHAN_CRAFT_PD, SHAHAN_STAFF_PD } from "./shahan-wood-river.ts";

const GOLDEN_HOURS_TOL = 1;

function moneyEqual(a: number, b: number, tol = GOLDEN_HOURS_TOL) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
}

const OFFICIAL_SUMMARY_HOURS = {
  directHours: 16860,
  foremenHours: 2134,
  supportHours: 2428,
  targetCraftHours: 21422,
  staffHours: 6826,
} as const;

export const WOOD_RIVER_B1_WINDOW_START = "2026-08-10";
export const WOOD_RIVER_B1_WINDOW_END = "2026-12-06";
export const WOOD_RIVER_B1_DATE_COL = 12;

export type B1Lane = "staff" | "generalForeman" | "foreman" | "direct" | "support";

export type B1RangeKind = "work" | "pd";

export type B1CompressedRange = {
  start: string;
  end: string;
  hc: number;
  hps: number;
  pd: number;
  days: boolean[];
  skipDates?: string[];
  kind?: B1RangeKind;
};

export type B1FixturePosition = {
  sheet: "staff" | "foremen" | "direct" | "support";
  lane: B1Lane;
  position: string;
  night: boolean;
  name?: string;
  ranges: B1CompressedRange[];
  hours: number;
  pdDays: number;
};

export type Boiler17B1Hours = {
  directHours: number;
  foremenHours: number;
  supportHours: number;
  targetCraftHours: number;
  staffHours: number;
  craftPerDiem?: number;
  materials?: number;
  heatInduction?: number;
  staffPerDiem?: number;
  staffTravel?: number;
};

export type Boiler17TypedHours = {
  staffHours: number;
  generalForemanHours: number;
  foremenHours: number;
  directHours: number;
  supportHours: number;
  staffPlusGfHours: number;
  targetCraftHours: number;
  staffPdDays: number;
  craftPdDays: number;
};

export type WoodRiverB1Fixture = {
  extractedFrom: "drive-text";
  officialRevisionId: string;
  officialRevisionName: string;
  window: { start: string; end: string };
  summaryHours: Boiler17B1Hours;
  typedHours: Boiler17TypedHours;
  misc: Array<{ item: string; qty: number; each: number }>;
  positions: B1FixturePosition[];
};

export type WoodRiverB1Ingest = {
  fixture: WoodRiverB1Fixture;
  schedule: PhaseScheduleState;
  crew: EstimateXlsxCrew;
  otherCost: OtherCostSheet;
  jobMeta: {
    jobNumber: string;
    area: string;
    staffPerDiemRate: number;
    craftPerDiemRate: number;
  };
};

export function loadBoiler17B1Fixture(): WoodRiverB1Fixture {
  return boiler17B1CrewJson as WoodRiverB1Fixture;
}

function sheetKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGeneralForemanTitle(title: string) {
  return /general\s*foreman|\bgf\b/i.test(title);
}

export function b1LaneFor(sheet: "staff" | "foremen" | "direct" | "support", title: string): B1Lane {
  if (isGeneralForemanTitle(title)) return "generalForeman";
  if (sheet === "staff") return "staff";
  if (sheet === "foremen") return "foreman";
  if (sheet === "direct") return "direct";
  return "support";
}

export function classicB1LaborSheet(name: string): "staff" | "foremen" | "direct" | "support" | null {
  const key = sheetKey(name);
  if (key === "staff" || key === "staff page") return "staff";
  if (key === "foremen" || key === "foreman") return "foremen";
  if (key === "direct") return "direct";
  if (key === "support") return "support";
  return null;
}

function compressPlugs(
  plugs: Array<{ ymd: string; hc: number; hps: number; pd: number }>,
): B1CompressedRange[] {
  const work = plugs.filter((row) => row.hc > 0);
  const pdOnly = plugs.filter((row) => row.hc <= 0 && row.pd > 0);
  return [...runsFrom(work, "work"), ...runsFrom(pdOnly, "pd")];
}

function jsDow(ymd: string) {
  const date = parseYmd(ymd);
  return date ? date.getDay() : 0;
}

function eachYmd(start: string, end: string) {
  const out: string[] = [];
  const cursor = parseYmd(start);
  const last = parseYmd(end);
  if (!cursor || !last || cursor > last) return out;
  while (cursor <= last) {
    out.push(formatYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function runsFrom(
  plugs: Array<{ ymd: string; hc: number; hps: number; pd: number }>,
  kind: B1RangeKind,
): B1CompressedRange[] {
  if (!plugs.length) return [];
  const ranges: B1CompressedRange[] = [];
  let start = 0;
  const keyOf = (row: (typeof plugs)[number]) =>
    kind === "work" ? `${row.hc}|${row.hps}|${row.pd}` : `${row.pd}`;
  for (let index = 1; index <= plugs.length; index += 1) {
    if (index < plugs.length && keyOf(plugs[index]) === keyOf(plugs[start])) continue;
    const chunk = plugs.slice(start, index);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const have = new Set(chunk.map((row) => row.ymd));
    const days = [false, false, false, false, false, false, false];
    for (const row of chunk) days[jsDow(row.ymd)] = true;
    const skipDates = eachYmd(first.ymd, last.ymd).filter((ymd) => days[jsDow(ymd)] && !have.has(ymd));
    ranges.push({
      start: first.ymd,
      end: last.ymd,
      hc: kind === "work" ? first.hc : 0,
      hps: kind === "work" ? first.hps : 0,
      pd: first.pd,
      days,
      skipDates: skipDates.length ? skipDates : undefined,
      kind,
    });
    start = index;
  }
  return ranges;
}

export function compressB1Plugs(
  plugs: Array<{ ymd: string; hc: number; hps: number; pd: number }>,
): B1CompressedRange[] {
  return compressPlugs(plugs);
}

export function boiler17B1Schedule(): PhaseScheduleState {
  const dates: Record<string, { start: string; stop: string; daysPerWeek: number; hoursPerDay: number }> = {
    pre: { start: "2026-08-10", stop: "2026-09-06", daysPerWeek: 7, hoursPerDay: 9 },
    "oil-out": { start: "2026-09-07", stop: "2026-09-13", daysPerWeek: 7, hoursPerDay: 10 },
    mech: { start: "2026-09-14", stop: "2026-10-25", daysPerWeek: 7, hoursPerDay: 10 },
    "oil-in": { start: "2026-10-26", stop: "2026-11-15", daysPerWeek: 7, hoursPerDay: 11 },
    post: { start: "2026-11-16", stop: "2026-12-06", daysPerWeek: 7, hoursPerDay: 10 },
  };
  return {
    projectStart: WOOD_RIVER_B1_WINDOW_START,
    multiUnits: false,
    units: [],
    phases: defaultPhases().map((row) => {
      const next = dates[row.id];
      return next ? { ...row, start: next.start, stop: next.stop, daysPerWeek: next.daysPerWeek, hoursPerDay: next.hoursPerDay } : row;
    }),
  };
}

type B1DayPlug = { ymd: string; hc: number; hps: number; pd: number };

function deskDayPlug(plug: B1DayPlug): B1DayPlug {
  if (plug.hc <= 0 && plug.pd > 0) return { ...plug, hc: 1, hps: 0 };
  return plug;
}

function plugKey(plug: Pick<B1DayPlug, "hc" | "hps" | "pd">) {
  return `${plug.hc}|${plug.hps}|${plug.pd}`;
}

function plugsFromCompressed(ranges: B1CompressedRange[]): B1DayPlug[] {
  const plugs: B1DayPlug[] = [];
  for (const range of ranges) {
    const skip = new Set(range.skipDates ?? []);
    for (const ymd of eachYmd(range.start, range.end)) {
      if (skip.has(ymd)) continue;
      if (!range.days[jsDow(ymd)]) continue;
      const work = range.kind !== "pd" && range.hc > 0;
      plugs.push(deskDayPlug({ ymd, hc: work ? range.hc : 0, hps: work ? range.hps : 0, pd: range.pd }));
    }
  }
  return plugs;
}

function daysMaskFrom(plugs: B1DayPlug[]): boolean[] {
  const days = [false, false, false, false, false, false, false];
  for (const plug of plugs) days[jsDow(plug.ymd)] = true;
  return days;
}

function emptyPhaseRange(phase: PhaseRow, night: boolean, rowId: string): CalendarRange {
  return {
    id: `${rowId}-${phase.id}-empty`,
    start: phase.start,
    end: phase.stop,
    headcount: 0,
    nightHeadcount: 0,
    hoursPerShift: 0,
    perDiemPeople: 0,
    nightPerDiemPeople: 0,
    days: [false, false, false, false, false, false, false],
    phaseId: phase.id,
    shift: night ? "Nights" : "Days",
    otAfter8: phase.id === "pre" || phase.id === "post" ? false : true,
    off: true,
  };
}

function rangeFromPattern(
  plugs: B1DayPlug[],
  phase: PhaseRow,
  night: boolean,
  rowId: string,
  suffix: string,
  start: string,
  end: string,
  skipDates: string[],
): CalendarRange {
  const pattern = plugs[0];
  return {
    id: `${rowId}-${phase.id}-${suffix}`,
    start,
    end,
    headcount: pattern.hc,
    nightHeadcount: 0,
    hoursPerShift: pattern.hps,
    perDiemPeople: pattern.pd,
    nightPerDiemPeople: 0,
    days: daysMaskFrom(plugs),
    skipDates: skipDates.length ? skipDates : undefined,
    phaseId: phase.id,
    shift: night ? "Nights" : "Days",
    otAfter8: phase.id === "pre" || phase.id === "post" ? false : true,
  };
}

/** Five-card Hit Squad stacks (one first range per Job setup phase). Empty phases stay off so desk sync cannot mint HC=1. */
export function hitSquadRangesFromB1(item: B1FixturePosition, rowId: string): CalendarRange[] {
  const byYmd = new Map(plugsFromCompressed(item.ranges).map((plug) => [plug.ymd, plug]));
  const night = item.night;
  const ranges: CalendarRange[] = [];
  for (const phase of boiler17B1Schedule().phases.filter((row) => row.on && PHASE_IDS.includes(row.id as (typeof PHASE_IDS)[number]))) {
    const window = eachYmd(phase.start, phase.stop);
    const live = window.map((ymd) => byYmd.get(ymd)).filter((plug): plug is B1DayPlug => Boolean(plug));
    if (!live.length) {
      ranges.push(emptyPhaseRange(phase, night, rowId));
      continue;
    }
    const pattern = live[0];
    const key = plugKey(pattern);
    const matching = live.filter((plug) => plugKey(plug) === key);
    const skipDates = window.filter((ymd) => {
      const plug = byYmd.get(ymd);
      return !plug || plugKey(plug) !== key;
    });
    ranges.push(rangeFromPattern(matching, phase, night, rowId, "a", phase.start, phase.stop, skipDates));
    const extras = new Map<string, B1DayPlug[]>();
    for (const plug of live) {
      if (plugKey(plug) === key) continue;
      const list = extras.get(plugKey(plug)) ?? [];
      list.push(plug);
      extras.set(plugKey(plug), list);
    }
    let extraIndex = 0;
    for (const group of extras.values()) {
      extraIndex += 1;
      const start = group[0].ymd;
      const end = group[group.length - 1].ymd;
      const skip = eachYmd(start, end).filter((ymd) => !group.some((plug) => plug.ymd === ymd));
      ranges.push(rangeFromPattern(group, phase, night, rowId, `x${extraIndex}`, start, end, skip));
    }
  }
  return ranges;
}

export function crewFromB1Positions(positions: B1FixturePosition[]): EstimateXlsxCrew {
  const crew: EstimateXlsxCrew = {
    staff: [],
    generalForeman: [],
    foreman: [],
    direct: [],
    support: [],
    otAfter8: false,
  };
  positions.forEach((item, index) => {
    const id = `b17-${item.sheet}-${index + 1}`;
    const row: CraftRow = {
      ...blankCraftRow(),
      id,
      position: item.position,
      shift: item.night ? "Nights" : "Days",
      ranges: hitSquadRangesFromB1(item, id),
    };
    const list = crew[item.lane] ?? [];
    (crew[item.lane] as CraftRow[]) = [...list, row];
  });
  crew.support = hydrateSupportLines(crew.support ?? []);
  return crew;
}

export function otherCostFromB1(misc: WoodRiverB1Fixture["misc"]): OtherCostSheet {
  const lines: MiscLine[] = misc
    .filter((row) => row.each > 0)
    .map((row) => ({ ...blankMisc(row.item), qty: row.qty, each: row.each }));
  return { ...emptyOtherCost(), misc: lines };
}

export function typedHoursFromPositions(positions: B1FixturePosition[]): Boiler17TypedHours {
  const next: Boiler17TypedHours = {
    staffHours: 0,
    generalForemanHours: 0,
    foremenHours: 0,
    directHours: 0,
    supportHours: 0,
    staffPlusGfHours: 0,
    targetCraftHours: 0,
    staffPdDays: 0,
    craftPdDays: 0,
  };
  for (const row of positions) {
    if (row.lane === "staff") next.staffHours += row.hours;
    else if (row.lane === "generalForeman") next.generalForemanHours += row.hours;
    else if (row.lane === "foreman") next.foremenHours += row.hours;
    else if (row.lane === "direct") next.directHours += row.hours;
    else next.supportHours += row.hours;
    if (row.lane === "staff" || row.lane === "generalForeman") next.staffPdDays += row.pdDays;
    else next.craftPdDays += row.pdDays;
  }
  next.staffPlusGfHours = next.staffHours + next.generalForemanHours;
  next.targetCraftHours = next.foremenHours + next.directHours + next.supportHours;
  return next;
}

export function ingestFromFixture(fixture: WoodRiverB1Fixture = loadBoiler17B1Fixture()): WoodRiverB1Ingest {
  return {
    fixture,
    schedule: boiler17B1Schedule(),
    crew: crewFromB1Positions(fixture.positions),
    otherCost: otherCostFromB1(fixture.misc),
    jobMeta: {
      jobNumber: BOILER17_JOB_NUMBER,
      area: "Boiler 17",
      staffPerDiemRate: SHAHAN_STAFF_PD,
      craftPerDiemRate: SHAHAN_CRAFT_PD,
    },
  };
}

export function boiler17HoursFromCrew(
  crew: EstimateXlsxCrew | null | undefined,
  site = BOILER17_SITE,
  client = BOILER17_CLIENT,
): Boiler17B1Hours {
  const hoursFor = (rows: CraftRow[] | undefined) =>
    (rows ?? []).reduce((sum, row) => sum + computeRowHours(row, site, client).hours, 0);
  const staffHours = hoursFor(crew?.staff) + hoursFor(crew?.generalForeman);
  const foremenHours = hoursFor(crew?.foreman);
  const directHours = hoursFor(crew?.direct);
  const supportHours = hoursFor(crew?.support);
  return {
    staffHours,
    foremenHours,
    directHours,
    supportHours,
    targetCraftHours: foremenHours + directHours + supportHours,
  };
}

const HOURS_TOL = 1;

export function checkBoiler17OfficialHours(hours?: Boiler17B1Hours | null): { ok: boolean; reason?: string } {
  const golden = OFFICIAL_SUMMARY_HOURS;
  if (!hours) return { ok: false, reason: "missing official hours" };
  const keys = ["directHours", "foremenHours", "supportHours", "targetCraftHours", "staffHours"] as const;
  for (const key of keys) {
    if (!moneyEqual(hours[key], golden[key], HOURS_TOL)) {
      return { ok: false, reason: `${key} ${hours[key]} ≠ official ${golden[key]}` };
    }
  }
  return { ok: true };
}

export function checkBoiler17PackHours(
  crew: EstimateXlsxCrew | null | undefined,
  expected: Boiler17TypedHours = loadBoiler17B1Fixture().typedHours,
): { ok: boolean; reason?: string } {
  const got = boiler17HoursFromCrew(crew);
  if (!moneyEqual(got.staffHours, expected.staffPlusGfHours, HOURS_TOL)) {
    return { ok: false, reason: `staff+GF ${got.staffHours} ≠ typed ${expected.staffPlusGfHours}` };
  }
  if (!moneyEqual(got.foremenHours, expected.foremenHours, HOURS_TOL)) {
    return { ok: false, reason: `foremen ${got.foremenHours} ≠ typed ${expected.foremenHours}` };
  }
  if (!moneyEqual(got.directHours, expected.directHours, HOURS_TOL)) {
    return { ok: false, reason: `direct ${got.directHours} ≠ typed ${expected.directHours}` };
  }
  if (!moneyEqual(got.supportHours, expected.supportHours, HOURS_TOL)) {
    return { ok: false, reason: `support ${got.supportHours} ≠ typed ${expected.supportHours}` };
  }
  return { ok: true };
}

export function boiler17B1FilledSnapshot(
  base?: Partial<EstimatePackSnapshot>,
  ingested: WoodRiverB1Ingest = ingestFromFixture(),
): EstimatePackSnapshot {
  return {
    packId: BOILER17_PACK_ID,
    key: `new:${BOILER17_PACK_ID}`,
    title: BOILER17_TITLE,
    client: BOILER17_CLIENT,
    site: BOILER17_SITE,
    siteId: BOILER17_SITE_ID,
    createdAt: base?.createdAt ?? 1,
    updatedAt: Date.now(),
    ownerEmail: base?.ownerEmail || NATHAN_DESK_EMAIL,
    status: BOILER17_STATUS,
    schedule: ingested.schedule,
    crew: ingested.crew,
    jobMeta: {
      ...(typeof base?.jobMeta === "object" && base.jobMeta ? base.jobMeta : {}),
      ...ingested.jobMeta,
    },
    otherCost: ingested.otherCost,
    costReport: base?.costReport,
  };
}

/** Fill empty Boiler 17 crew / smashed 2026-08-21 demo clock from the official B-1 extract. */
export function shouldFillBoiler17B1Crew(
  pack?: { packId?: string; title?: string; code?: string; crew?: unknown; schedule?: unknown } | null,
) {
  return boiler17NeedsB1Fill(pack);
}

/** Overlay official B-1 crew + Job setup. Keep live identity, JN, and Cost notes. */
export function fillBoiler17FromB1(live: EstimatePackSnapshot): EstimatePackSnapshot {
  const filled = boiler17B1FilledSnapshot({
    createdAt: live.createdAt,
    ownerEmail: live.ownerEmail,
    jobMeta: live.jobMeta,
    costReport: live.costReport,
  });
  return {
    ...live,
    schedule: filled.schedule ?? live.schedule,
    crew: filled.crew ?? live.crew,
    otherCost: filled.otherCost ?? live.otherCost,
    jobMeta: filled.jobMeta ?? live.jobMeta,
    costReport: filled.costReport ?? live.costReport,
    updatedAt: Math.max(live.updatedAt || 0, filled.updatedAt || 0, Date.now()),
  };
}

export const WOOD_RIVER_B1_VAULT_APPLY =
  "Open Boiler 17 on the owner desk while Drive OAuth is live. Empty / 8-21 smashed vault crew is replaced by the official B-1 fill and overwriteEstimateInDrive PATCHes wood-river-boiler-17-2026.json (1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y). Service-account-only isolates cannot PATCH that file — same helper Rodeo/Monroe wake uses. Do not commit the xlsx. If OAuth is off, the desk still paints B-1 locally; reopen once with OAuth to heal the vault.";

export function boiler17VaultFileId() {
  return HIS_BOILER17_FILE_ID;
}

export { BOILER17_COST_NOTE };
