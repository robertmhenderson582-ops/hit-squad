/**
 * Wood River classic B-1 → Hit Squad live pack.
 *
 * Staff / Foremen / Direct / Support (leading space on official RH tabs)
 * become desk cards Staff / GF / Foreman / Direct Craft / Support.
 * Hours come from typed HC × Hours/shift grids. Labor $ cells that were
 * #REF are not invented — Rate Tables / Shahan titles resolve billable $.
 * Numeric Summary / Misc lines (PD face, materials, heat, staff travel)
 * may seed Other Cost. Excel binaries stay on Drive.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  BOILER17_CLIENT,
  BOILER17_COST_NOTE,
  BOILER17_JOB_NUMBER,
  BOILER17_PACK_ID,
  BOILER17_SITE,
  BOILER17_SITE_ID,
  BOILER17_STATUS,
  BOILER17_TITLE,
  isBoiler17PackId,
} from "./boiler-17.ts";
import { blankCraftRow, hydrateSupportLines, type CalendarRange, type CraftRow } from "./craft-labor.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { crewHasRows } from "./estimate-pack.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
const HIS_BOILER17_FILE_ID = "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y";
const NATHAN_DESK_EMAIL = "nathanboyte@gmail.com";
import { blankMisc, emptyOtherCost, type MiscLine, type OtherCostSheet } from "./other-cost.ts";
import {
  defaultPhases,
  formatYmd,
  parseYmd,
  phaseOwningDate,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import { SHAHAN_CRAFT_PD, SHAHAN_STAFF_PD } from "./shahan-wood-river.ts";
import { OFFICIAL_BOILER17_B1_REVISION_ID, OFFICIAL_BOILER17_B1_REVISION_NAME } from "./work-folder.ts";

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

const FIXTURE_URL = new URL("./wake-golden/boiler17-b1-crew.json", import.meta.url);

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

let cachedFixture: WoodRiverB1Fixture | null = null;

export function loadBoiler17B1Fixture(): WoodRiverB1Fixture {
  if (cachedFixture) return cachedFixture;
  const raw = JSON.parse(readFileSync(fileURLToPath(FIXTURE_URL), "utf8")) as WoodRiverB1Fixture;
  cachedFixture = raw;
  return raw;
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

function asNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !value.trim().startsWith("=")) {
    const next = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(next) ? next : 0;
  }
  if (value && typeof value === "object" && "result" in value) return asNum((value as { result: unknown }).result);
  return 0;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "result" in value) return asText((value as { result: unknown }).result);
  return "";
}

function cellYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatYmd(value);
  if (typeof value === "number" && value > 30000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return formatYmd(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return "";
}

function ymdAdd(start: string, days: number) {
  const date = parseYmd(start);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

function laborDates(ws: ExcelJS.Worksheet): string[] {
  for (const row of [6, 5, 1]) {
    const first = cellYmd(ws.getCell(row, WOOD_RIVER_B1_DATE_COL).value);
    if (first) {
      return Array.from({ length: 119 }, (_, index) => ymdAdd(first, index)).filter(Boolean);
    }
  }
  return Array.from({ length: 119 }, (_, index) => ymdAdd(WOOD_RIVER_B1_WINDOW_START, index)).filter(Boolean);
}

function nightAfterRow(ws: ExcelJS.Worksheet, stRow: number) {
  for (let row = 1; row <= stRow; row += 1) {
    const label = asText(ws.getCell(row, 3).value).replace(/\s+/g, "");
    if (/nightshift/i.test(label)) return true;
  }
  return false;
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

function parseLaborSheet(ws: ExcelJS.Worksheet, sheet: "staff" | "foremen" | "direct" | "support"): B1FixturePosition[] {
  const dates = laborDates(ws);
  const positions: B1FixturePosition[] = [];
  const last = Math.max(ws.rowCount || 7, 7);
  for (let row = 7; row <= last; row += 1) {
    if (asText(ws.getCell(row, 7).value).toUpperCase() !== "ST") continue;
    const title = asText(ws.getCell(row, 3).value);
    const hcRow = row - 2;
    const hpsRow = row - 1;
    const pdRow = row + 3;
    const plugs: Array<{ ymd: string; hc: number; hps: number; pd: number }> = [];
    let hours = 0;
    let pdDays = 0;
    dates.forEach((ymd, index) => {
      const col = WOOD_RIVER_B1_DATE_COL + index;
      const hc = asNum(ws.getCell(hcRow, col).value);
      const hps = asNum(ws.getCell(hpsRow, col).value);
      const pd = asNum(ws.getCell(pdRow, col).value);
      if (hc > 0 || pd > 0) {
        plugs.push({ ymd, hc, hps, pd });
        hours += hc * hps;
        pdDays += pd;
      }
    });
    if (!plugs.length) continue;
    const nameRaw = asText(ws.getCell(row + 4, 3).value);
    const name = nameRaw.startsWith("=") ? "" : nameRaw;
    const lane = b1LaneFor(sheet, title);
    positions.push({
      sheet,
      lane,
      position: title || "Empty",
      night: nightAfterRow(ws, row),
      name,
      ranges: compressPlugs(plugs),
      hours,
      pdDays,
    });
  }
  return positions;
}

function parseSummaryHours(ws: ExcelJS.Worksheet | undefined): Boiler17B1Hours | null {
  if (!ws) return null;
  const directHours = asNum(ws.getCell("C8").value);
  const foremenHours = asNum(ws.getCell("C9").value);
  const supportHours = asNum(ws.getCell("C10").value);
  const staffHours = asNum(ws.getCell("C17").value);
  if (!directHours && !staffHours) return null;
  return {
    directHours,
    foremenHours,
    supportHours,
    targetCraftHours: directHours + foremenHours + supportHours,
    staffHours,
    craftPerDiem: asNum(ws.getCell("D12").value),
    materials: asNum(ws.getCell("D13").value) || 104100,
    heatInduction: asNum(ws.getCell("D15").value),
    staffPerDiem: asNum(ws.getCell("D18").value),
    staffTravel: asNum(ws.getCell("D20").value),
  };
}

export function boiler17B1Schedule(): PhaseScheduleState {
  const dates: Record<string, { start: string; stop: string; daysPerWeek: number; hoursPerDay: number }> = {
    pre: { start: "2026-08-10", stop: "2026-09-06", daysPerWeek: 5, hoursPerDay: 9 },
    "oil-out": { start: "2026-09-07", stop: "2026-09-13", daysPerWeek: 6, hoursPerDay: 10 },
    mech: { start: "2026-09-14", stop: "2026-10-25", daysPerWeek: 6, hoursPerDay: 10 },
    "oil-in": { start: "2026-10-26", stop: "2026-11-15", daysPerWeek: 6, hoursPerDay: 11 },
    post: { start: "2026-11-16", stop: "2026-12-06", daysPerWeek: 5, hoursPerDay: 10 },
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

function rangeFromCompressed(row: B1CompressedRange, night: boolean, index: number): CalendarRange {
  const phase = phaseOwningDate(boiler17B1Schedule().phases, row.start);
  const work = row.kind !== "pd" && row.hc > 0;
  return {
    id: `b17-${row.start}-${night ? "n" : "d"}-${index}`,
    start: row.start,
    end: row.end,
    headcount: work ? row.hc : 1,
    nightHeadcount: 0,
    hoursPerShift: work ? row.hps : 0,
    perDiemPeople: row.pd,
    nightPerDiemPeople: 0,
    days: row.days,
    skipDates: row.skipDates,
    phaseId: phase?.id,
    shift: night ? "Nights" : "Days",
    otAfter8: phase?.id === "pre" || phase?.id === "post" ? false : true,
  };
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
    const ranges = item.ranges.map((range, rangeIndex) => rangeFromCompressed(range, item.night, rangeIndex));
    const row: CraftRow = {
      ...blankCraftRow(),
      id: `b17-${item.sheet}-${index + 1}`,
      position: item.position,
      shift: item.night ? "Nights" : "Days",
      ranges,
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

export async function ingestWoodRiverB1(bytes: Uint8Array, fileName = ""): Promise<WoodRiverB1Ingest> {
  void fileName;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const positions: B1FixturePosition[] = [];
  for (const ws of wb.worksheets) {
    const sheet = classicB1LaborSheet(ws.name);
    if (!sheet) continue;
    positions.push(...parseLaborSheet(ws, sheet));
  }
  const summary =
    parseSummaryHours(wb.worksheets.find((sheet) => /summary/i.test(sheet.name))) ?? loadBoiler17B1Fixture().summaryHours;
  const fixture: WoodRiverB1Fixture = {
    extractedFrom: "drive-text",
    officialRevisionId: OFFICIAL_BOILER17_B1_REVISION_ID,
    officialRevisionName: fileName || OFFICIAL_BOILER17_B1_REVISION_NAME,
    window: { start: WOOD_RIVER_B1_WINDOW_START, end: WOOD_RIVER_B1_WINDOW_END },
    summaryHours: summary,
    typedHours: typedHoursFromPositions(positions),
    misc: loadBoiler17B1Fixture().misc,
    positions,
  };
  return ingestFromFixture(fixture);
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

/** Fill empty Boiler 17 crew / smashed 2026 seed clock from the official B-1 extract. */
export function shouldFillBoiler17B1Crew(pack?: { packId?: string; crew?: unknown; schedule?: unknown } | null) {
  if (!isBoiler17PackId(pack?.packId)) return false;
  return !crewHasRows(pack?.crew);
}

export const WOOD_RIVER_B1_VAULT_APPLY =
  "Owner OAuth vault write: open Boiler 17 so wake seeds the filled pack, then Save. overwriteEstimateInDrive writes wood-river-boiler-17-2026.json (1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y). Service-account-only isolates cannot PATCH that file — same helper Rodeo/Monroe wake uses. Do not commit the xlsx.";

export function boiler17VaultFileId() {
  return HIS_BOILER17_FILE_ID;
}

export { BOILER17_COST_NOTE };
