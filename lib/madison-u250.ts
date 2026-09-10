/**
 * Rodeo U250 — JB 09.10.26 Summary → Family A five-card live pack.
 *
 * Same Wood River five-card desk as U110 (Staff / GF / Foreman / Direct /
 * Support). Live lock is John Beech's 09.10.26 P66 workbook Summary
 * ($2,351,438.99 / 12,001 hrs) on the Madison contractor transfer face.
 * Family A is hours × one composite `bookRate` (bookAmount ÷ hours so
 * displayed rounded rates do not drift). Official book has no GF / PM /
 * Super / Fire Watch rows — do not invent them. Tool Room Attendant sits
 * on Indirect → Staff. Titles stay typed. Non-labor SUMMARY lines seed
 * Other Cost as book-priced sell (no 6.5% markup; JB 6% MISC markup is
 * its own line). Excel binaries stay on Drive.
 *
 * Day-grid shape comes from Staffing R3 09102026 (HC calendar). Seat hours
 * stay the JB lock — HPS is locked hours ÷ staffing person-days. Do not
 * invent a new total from that grid. If a seat has no staffing calendar,
 * hours spread across Job setup phase dates the same way Wood River B-1
 * does (HC × HPS stacks + skipDates). Never lump every seat onto one date.
 *
 * One reserved pack: EST-U25026 / new-u25026-rodeo. Do not seed EST-MTN9RM
 * or any second U250 pack.
 *
 * Client-safe: static JSON fixture only. Workbook parse lives in madison-u250-xlsx.ts.
 */

import rodeoU250CrewJson from "./wake-golden/rodeo-u250-crew.json" with { type: "json" };
import rodeoU250StaffingJson from "./wake-golden/rodeo-u250-staffing.json" with { type: "json" };
import { blankCraftRow, hydrateSupportLines, type CalendarRange, type CraftRow } from "./craft-labor.ts";
import { applyPackToStore, crewHasRows, type EstimatePackSnapshot } from "./estimate-pack.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import {
  checkRodeoU110PackHours,
  otherCostFromMadison,
  rodeoU110BucketHoursFromCrew,
  rodeoU110HoursFromCrew,
  type MadisonFixturePosition,
  type MadisonTypedHours,
  type MadisonU110Fixture,
  type MadisonU110Ingest,
} from "./madison-u110.ts";
import {
  listLocalPacks,
  rememberLocalPack,
  readStoreJson,
  storageKeyForPack,
  type StorageLike,
} from "./local-estimates.ts";
import {
  CREW_STORE_PREFIX,
  PHASE_IDS,
  defaultPhases,
  eachYmd,
  isWorkedDay,
  parseYmd,
  type PhaseRow,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import {
  RODEO_U250_JOB_CODE,
  RODEO_U250_PACK_ID,
  RODEO_U250_SHELL,
} from "./rodeo-monroe-wake.ts";
import type { RodeoCrew } from "./rodeo-form.ts";
import { RODEO_CRAFT_PD, RODEO_STAFF_PD } from "./shahan-rodeo.ts";
import { U250_CONTRACTOR_GOLDEN, type ContractorGoldenBuckets } from "./wake-golden.ts";

const HOURS_TOL = 1;

export const RODEO_U250_TITLE = RODEO_U250_SHELL.title;
export const RODEO_U250_CLIENT = RODEO_U250_SHELL.client;
export const RODEO_U250_SITE = RODEO_U250_SHELL.site;
export const RODEO_U250_SITE_ID = RODEO_U250_SHELL.siteId;
export const RODEO_U250_STATUS = "In progress" as const;
/** JB 09.10.26 revision date — identity / note only. Not the day-grid clock. */
export const RODEO_U250_HOURS_PLUG = "2026-09-10";
export const RODEO_U250_SCHEDULE_START = "2026-09-07";
export const RODEO_U250_SCHEDULE_STOP = "2027-01-08";
export const RODEO_U250_CONTRACTOR = "MADISON INDUSTRIAL SVCS TEAM LLC";
export const RODEO_U250_BLOCK = "2026 U250 Cat Change (TAR.ER01.26.250)";

export type MadisonU250Fixture = MadisonU110Fixture;
export type MadisonU250Ingest = MadisonU110Ingest;

type U250StaffPlug = { ymd: string; hc: number };
type U250StaffCraft = { day: U250StaffPlug[]; night: U250StaffPlug[] };
type U250StaffingFixture = {
  phases: Array<{
    id: string;
    start: string;
    stop: string;
    daysPerWeek: number;
    hoursPerDay: number;
    otAfter8: boolean;
  }>;
  crafts: Record<string, U250StaffCraft>;
};

type DayPlug = { ymd: string; hc: number; hps: number };

export function loadRodeoU250Fixture(): MadisonU250Fixture {
  return rodeoU250CrewJson as MadisonU250Fixture;
}

export function loadRodeoU250Staffing(): U250StaffingFixture {
  return rodeoU250StaffingJson as U250StaffingFixture;
}

export function isRodeoU250PackId(packId = "") {
  return packId.trim().toLowerCase() === RODEO_U250_PACK_ID;
}

export function rodeoU250Schedule(_plug = loadRodeoU250Fixture().hoursPlugDate): PhaseScheduleState {
  const staffing = loadRodeoU250Staffing();
  const byId = new Map(staffing.phases.map((row) => [row.id, row]));
  return {
    projectStart: RODEO_U250_SCHEDULE_START,
    multiUnits: false,
    units: [],
    phases: defaultPhases().map((row) => {
      const next = byId.get(row.id);
      return next
        ? {
            ...row,
            on: true,
            start: next.start,
            stop: next.stop,
            daysPerWeek: next.daysPerWeek,
            hoursPerDay: next.hoursPerDay,
            otAfter8: next.otAfter8,
            sundaysOff: [],
          }
        : { ...row, on: false };
    }),
  };
}

function jsDow(ymd: string) {
  return parseYmd(ymd)?.getDay() ?? 0;
}

function plugKey(plug: Pick<DayPlug, "hc" | "hps">) {
  return `${plug.hc}|${plug.hps}`;
}

function daysMaskFrom(plugs: DayPlug[]): boolean[] {
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
  plugs: DayPlug[],
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
    perDiemPeople: 0,
    nightPerDiemPeople: 0,
    days: daysMaskFrom(plugs),
    skipDates: skipDates.length ? skipDates : undefined,
    phaseId: phase.id,
    shift: night ? "Nights" : "Days",
    otAfter8: phase.id === "pre" || phase.id === "post" ? false : true,
  };
}

/** Wood River B-1 phase stacks: first range owns the Job setup window; extras hold HC changes. */
function hitSquadRangesFromPlugs(plugs: DayPlug[], night: boolean, rowId: string, schedule: PhaseScheduleState): CalendarRange[] {
  const byYmd = new Map(plugs.map((plug) => [plug.ymd, plug]));
  const ranges: CalendarRange[] = [];
  for (const phase of schedule.phases.filter((row) => row.on && PHASE_IDS.includes(row.id as (typeof PHASE_IDS)[number]))) {
    const window = eachYmd(phase.start, phase.stop);
    const live = window.map((ymd) => byYmd.get(ymd)).filter((plug): plug is DayPlug => Boolean(plug));
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
    const extras = new Map<string, DayPlug[]>();
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

function fallbackPlugs(hours: number, schedule: PhaseScheduleState): DayPlug[] {
  const days: string[] = [];
  for (const phase of schedule.phases.filter((row) => row.on)) {
    for (const ymd of eachYmd(phase.start, phase.stop)) {
      if (isWorkedDay(ymd, phase.daysPerWeek, phase.sundaysOff)) days.push(ymd);
    }
  }
  if (!days.length || hours <= 0) return [];
  const hps = hours / days.length;
  return days.map((ymd) => ({ ymd, hc: 1, hps }));
}

function staffingPlugs(raw: U250StaffPlug[] | undefined, hours: number): DayPlug[] {
  const live = (raw ?? []).filter((row) => row.hc > 0);
  const personDays = live.reduce((sum, row) => sum + row.hc, 0);
  if (!live.length || personDays <= 0 || hours <= 0) return [];
  const hps = hours / personDays;
  return live.map((row) => ({ ymd: row.ymd, hc: row.hc, hps }));
}

/** Map Family A / upload titles onto Staffing R3 craft keys. Foreman before journeyman. */
export function u250StaffingCraftKey(title: string): string | null {
  const key = title.toLowerCase();
  if (/foreman/.test(key) && /boiler/.test(key)) return "boilermaker-foreman";
  if (/foreman/.test(key) && /pipe/.test(key)) return "pipefitter-foreman";
  if (/qa|qc/.test(key)) return "lead-qa-qc";
  if (/lead\s*safety|safety\s*\(/.test(key) || (/safety/.test(key) && !/foreman|attendant/.test(key))) return "lead-safety";
  if (/tool\s*room/.test(key)) return "toolroom";
  if (/expediter|coordinator\s*material/.test(key)) return "material-expediter";
  if (/operator|fork\s*lift/.test(key)) return "operator-eng-a-grp-iii";
  if (/laborer/.test(key) && /grp\s*iii/.test(key)) return "laborer-grp-iii";
  if (/pipefitter\s+apprentice/.test(key)) return "pipefitter-apprentice";
  if (/pipefitter/.test(key) && !/foreman/.test(key)) return "pipefitter-journeyman";
  if (/boilermaker\s+apprentice/.test(key)) return "boilermaker-apprentice";
  if (/boilermaker/.test(key) && !/foreman/.test(key)) return "boilermaker-journeyman";
  return null;
}

function titleIsNight(title: string) {
  return /\bnight/.test(title.toLowerCase());
}

export function crewFromU250Positions(
  positions: MadisonFixturePosition[],
  schedule: PhaseScheduleState = rodeoU250Schedule(),
  staffing: U250StaffingFixture = loadRodeoU250Staffing(),
): EstimateXlsxCrew {
  const crew: EstimateXlsxCrew = {
    staff: [],
    generalForeman: [],
    foreman: [],
    direct: [],
    support: [],
    otAfter8: false,
  };
  positions.forEach((item, index) => {
    const id = `u250-${item.sheet}-${index + 1}`;
    const night = titleIsNight(item.position);
    const craft = staffing.crafts[u250StaffingCraftKey(item.position) ?? ""];
    const plugs = staffingPlugs(night ? craft?.night : craft?.day, item.hours);
    const shaped = plugs.length ? plugs : fallbackPlugs(item.hours, schedule);
    const row: CraftRow = {
      ...blankCraftRow(),
      id,
      position: item.position,
      shift: night ? "Nights" : "Days",
      bookRate: item.bookRate,
      ranges: hitSquadRangesFromPlugs(shaped, night, id, schedule),
    };
    const list = crew[item.lane] ?? [];
    (crew[item.lane] as CraftRow[]) = [...list, row];
  });
  crew.support = hydrateSupportLines(crew.support ?? []);
  return crew;
}

export function liveU250WorkDates(row: { ranges?: CalendarRange[] } | null | undefined): string[] {
  const dates = new Set<string>();
  for (const range of row?.ranges ?? []) {
    if (range.off) continue;
    if (!range.start || !range.end) continue;
    const hc = Math.max(Number(range.headcount) || 0, Number(range.nightHeadcount) || 0);
    if (hc <= 0 || !(Number(range.hoursPerShift) > 0)) continue;
    for (const ymd of eachYmd(range.start, range.end)) {
      if (range.skipDates?.includes(ymd)) continue;
      const date = parseYmd(ymd);
      if (Array.isArray(range.days) && range.days.length === 7 && date && !range.days[date.getDay()]) continue;
      dates.add(ymd);
    }
  }
  return [...dates].sort();
}

/** True when every billed seat dumps its hours onto a single calendar date. */
export function u250CrewDayGridCollapsed(crew: EstimateXlsxCrew | RodeoCrew | null | undefined): boolean {
  const rows = [
    ...((crew?.staff as CraftRow[] | undefined) ?? []),
    ...((crew?.generalForeman as CraftRow[] | undefined) ?? []),
    ...((crew?.foreman as CraftRow[] | undefined) ?? []),
    ...((crew?.direct as CraftRow[] | undefined) ?? []),
    ...((crew?.support as CraftRow[] | undefined) ?? []),
  ].filter((row) => row.position?.trim() && liveU250WorkDates(row).length);
  if (!rows.length) return true;
  return rows.every((row) => liveU250WorkDates(row).length <= 1);
}

export function ingestRodeoU250FromFixture(fixture: MadisonU250Fixture = loadRodeoU250Fixture()): MadisonU250Ingest {
  const schedule = rodeoU250Schedule(fixture.hoursPlugDate);
  return {
    fixture,
    schedule,
    crew: crewFromU250Positions(fixture.positions, schedule),
    otherCost: otherCostFromMadison(fixture.misc),
    jobMeta: {
      area: fixture.jobMeta.area || "U250",
      staffPerDiemRate: fixture.jobMeta.staffPerDiemRate || RODEO_STAFF_PD,
      craftPerDiemRate: fixture.jobMeta.craftPerDiemRate || RODEO_CRAFT_PD,
    },
  };
}

export function rodeoU250HoursFromCrew(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  site = RODEO_U250_SITE,
  client = RODEO_U250_CLIENT,
): MadisonTypedHours {
  return rodeoU110HoursFromCrew(crew, site, client);
}

export function rodeoU250BucketHoursFromCrew(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  site = RODEO_U250_SITE,
  client = RODEO_U250_CLIENT,
) {
  return rodeoU110BucketHoursFromCrew(crew, site, client);
}

function moneyEqual(a: number, b: number, tol = HOURS_TOL) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
}

export function checkRodeoU250OfficialHours(
  hours?: Pick<ContractorGoldenBuckets, "directHours" | "indirectHours" | "totalHours"> | null,
): { ok: boolean; reason?: string } {
  const golden = U250_CONTRACTOR_GOLDEN.buckets!;
  if (!hours) return { ok: false, reason: "missing official hours" };
  if (!moneyEqual(hours.directHours, golden.directHours, HOURS_TOL)) {
    return { ok: false, reason: `directHours ${hours.directHours} ≠ official ${golden.directHours}` };
  }
  if (!moneyEqual(hours.indirectHours, golden.indirectHours, HOURS_TOL)) {
    return { ok: false, reason: `indirectHours ${hours.indirectHours} ≠ official ${golden.indirectHours}` };
  }
  if (!moneyEqual(hours.totalHours, golden.totalHours, HOURS_TOL)) {
    return { ok: false, reason: `totalHours ${hours.totalHours} ≠ official ${golden.totalHours}` };
  }
  return { ok: true };
}

export function checkRodeoU250PackHours(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  expected: MadisonTypedHours = loadRodeoU250Fixture().typedHours,
): { ok: boolean; reason?: string } {
  return checkRodeoU110PackHours(crew, expected);
}

export function rodeoU250FilledSnapshot(
  base?: Partial<EstimatePackSnapshot>,
  ingested: MadisonU250Ingest = ingestRodeoU250FromFixture(),
): EstimatePackSnapshot {
  return {
    packId: RODEO_U250_PACK_ID,
    key: `new:${RODEO_U250_PACK_ID}`,
    title: RODEO_U250_TITLE,
    client: RODEO_U250_CLIENT,
    site: RODEO_U250_SITE,
    siteId: RODEO_U250_SITE_ID,
    createdAt: base?.createdAt ?? 1,
    updatedAt: Date.now(),
    ownerEmail: base?.ownerEmail || "",
    status: base?.status || RODEO_U250_STATUS,
    schedule: ingested.schedule,
    crew: ingested.crew,
    jobMeta: {
      ...(typeof base?.jobMeta === "object" && base.jobMeta ? base.jobMeta : {}),
      ...ingested.jobMeta,
      rodeoForm: { tarUnit: "U250", contractor: RODEO_U250_CONTRACTOR, block: RODEO_U250_BLOCK },
    },
    otherCost: ingested.otherCost,
    costReport: base?.costReport,
  };
}

/**
 * Fill empty U250 crew, replace a stale R2 / drifted clock that no longer
 * matches the JB 09.10.26 official hours, or replace a one-date day-grid
 * lump. Do not smash a multi-day clock that already matches the live lock.
 */
export function shouldFillRodeoU250Crew(pack?: { packId?: string; crew?: unknown } | null) {
  if (!pack || !isRodeoU250PackId(pack.packId)) return false;
  if (!crewHasRows(pack.crew)) return true;
  if (!checkRodeoU250PackHours(pack.crew as never).ok) return true;
  return u250CrewDayGridCollapsed(pack.crew as never);
}

export function seedRodeoU250LocalDefaults(store: StorageLike, packId: string) {
  if (!isRodeoU250PackId(packId)) return;
  const pack = listLocalPacks(store).find((row) => row.packId === packId);
  if (!pack) {
    rememberLocalPack(
      {
        packId,
        title: RODEO_U250_TITLE,
        client: RODEO_U250_CLIENT,
        site: RODEO_U250_SITE,
        status: RODEO_U250_STATUS,
      },
      store,
    );
  } else if (!pack.status) {
    rememberLocalPack(
      {
        packId,
        title: pack.title || RODEO_U250_TITLE,
        client: pack.client || RODEO_U250_CLIENT,
        site: pack.site || RODEO_U250_SITE,
        ownerEmail: pack.ownerEmail,
        status: RODEO_U250_STATUS,
      },
      store,
    );
  }
  const key = storageKeyForPack(packId);
  const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
  if (shouldFillRodeoU250Crew({ packId, crew })) {
    const filled = rodeoU250FilledSnapshot({
      createdAt: pack?.createdAt,
      ownerEmail: pack?.ownerEmail,
      status: pack?.status || RODEO_U250_STATUS,
    });
    applyPackToStore(store, filled);
  }
}

/** After wake cards paint, fill/refresh U250 from the JB 09.10.26 lock. Prefer filled seed over empty Drive. */
export function persistRodeoU250Wake(store?: StorageLike | null) {
  if (!store) return;
  seedRodeoU250LocalDefaults(store, RODEO_U250_PACK_ID);
}

/** Drive Estimates-room name `estimateFileName` will mint on first owner Save. */
export const RODEO_U250_VAULT_FILE = "rodeo-rodeo-u250-fall-2026.json";

export const RODEO_U250_VAULT_APPLY =
  "Owner OAuth vault write: open Rodeo U250 so wake seeds JB 09.10.26 hours × bookRate (desk total $2,351,438.99), then Save. First Save createJson mints rodeo-rodeo-u250-fall-2026.json. A broken other+markup-only seed is a 409 with the locked-total reason — do not upload it. Service-account-only isolates cannot PATCH a missing file; create is the first-write path. Do not commit the xlsx. Do not invent hours from #REF! Water Walls sheets. Do not create EST-MTN9RM or a second U250 pack.";

export { RODEO_U250_JOB_CODE, RODEO_U250_PACK_ID };
