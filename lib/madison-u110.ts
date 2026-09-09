/**
 * Rodeo U110 — Madison contractor R1 → Hit Squad live pack.
 *
 * Family A is hours × one composite rate (Direct / Indirect). There is no
 * B-1 day grid. Positions land on the Wood River five-card desk
 * (Staff / GF / Foreman / Direct / Support). Hole Watch/Fire Watch from the
 * Direct tab sits on Support — same card as Wood River. Book composite rates
 * ride on each crew seat (`bookRate`); desk labor $ is hours × that rate.
 * Madison titles stay typed — they do not invent Shahan Rodeo ST/OT/DT.
 * Non-labor SUMMARY lines seed Other Cost as book-priced sell (no 6.5%
 * markup). Excel binaries stay on Drive.
 *
 * Client-safe: static JSON fixture only. Workbook parse lives in madison-u110-xlsx.ts.
 */

import rodeoU110CrewJson from "./wake-golden/rodeo-u110-crew.json" with { type: "json" };
import { blankCraftRow, hydrateSupportLines, type CalendarRange, type CraftRow } from "./craft-labor.ts";
import { applyPackToStore, crewHasRows, type EstimatePackSnapshot } from "./estimate-pack.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import { computeRowHours } from "./hours-clock.ts";
import {
  listLocalPacks,
  rememberLocalPack,
  readStoreJson,
  storageKeyForPack,
  type StorageLike,
} from "./local-estimates.ts";
import { blankMisc, emptyOtherCost, type MiscLine, type OtherCostSheet } from "./other-cost.ts";
import {
  CREW_STORE_PREFIX,
  defaultPhases,
  type PhaseRow,
  type PhaseScheduleState,
} from "./phase-schedule.ts";
import {
  RODEO_U110_JOB_CODE,
  RODEO_U110_PACK_ID,
  RODEO_U110_SHELL,
} from "./rodeo-monroe-wake.ts";
import { rodeoRowBucket, type RodeoCrew } from "./rodeo-form.ts";
import { RODEO_CRAFT_PD, RODEO_STAFF_PD } from "./shahan-rodeo.ts";
import { U110_CONTRACTOR_GOLDEN, type ContractorGoldenBuckets } from "./wake-golden.ts";

const HOURS_TOL = 1;

export const RODEO_U110_TITLE = RODEO_U110_SHELL.title;
export const RODEO_U110_CLIENT = RODEO_U110_SHELL.client;
export const RODEO_U110_SITE = RODEO_U110_SHELL.site;
export const RODEO_U110_SITE_ID = RODEO_U110_SHELL.siteId;
export const RODEO_U110_STATUS = "In progress" as const;
export const RODEO_U110_HOURS_PLUG = "2026-07-22";

export type MadisonLane = "staff" | "generalForeman" | "foreman" | "direct" | "support";
export type MadisonSheet = "direct" | "indirect";

export type MadisonFixturePosition = {
  sheet: MadisonSheet;
  lane: MadisonLane;
  position: string;
  hours: number;
  bookRate: number;
  bookAmount: number;
};

export type MadisonTypedHours = {
  staffHours: number;
  generalForemanHours: number;
  foremenHours: number;
  directHours: number;
  supportHours: number;
  directBucketHours: number;
  indirectBucketHours: number;
};

export type MadisonU110Fixture = {
  extractedFrom: "official-xlsx";
  officialRevisionId: string;
  officialRevisionName: string;
  hoursPlugDate: string;
  hoursPlugNote: string;
  summaryBuckets: ContractorGoldenBuckets;
  typedHours: MadisonTypedHours;
  jobMeta: { area: string; staffPerDiemRate: number; craftPerDiemRate: number };
  misc: Array<{ item: string; qty: number; each: number; bucket: string }>;
  positions: MadisonFixturePosition[];
  findings: string[];
};

export type MadisonU110Ingest = {
  fixture: MadisonU110Fixture;
  schedule: PhaseScheduleState;
  crew: EstimateXlsxCrew;
  otherCost: OtherCostSheet;
  jobMeta: {
    area: string;
    staffPerDiemRate: number;
    craftPerDiemRate: number;
  };
};

export function loadRodeoU110Fixture(): MadisonU110Fixture {
  return rodeoU110CrewJson as MadisonU110Fixture;
}

function sheetKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isRodeoU110PackId(packId = "") {
  return packId.trim().toLowerCase() === RODEO_U110_PACK_ID;
}

export function madisonContractorLaborSheet(name: string): MadisonSheet | null {
  const key = sheetKey(name);
  if (key.startsWith("2 ") || /\bindirect\s+labor\b/.test(key)) return "indirect";
  if (key.startsWith("1 ") || /\bdirect\s+labor\b/.test(key)) return "direct";
  return null;
}

export function madisonLaneFor(sheet: MadisonSheet, title: string): MadisonLane {
  const key = title.toLowerCase();
  if (sheet === "direct") {
    if (/fire\s*watch|hole\s*watch|tool\s*room|bottle\s*watch/i.test(key)) return "support";
    return "direct";
  }
  if (/general\s*foreman|\bgf\b/.test(key)) return "generalForeman";
  if (/\bforeman\b/.test(key)) return "foreman";
  return "staff";
}

export function rodeoU110Schedule(plug = loadRodeoU110Fixture().hoursPlugDate): PhaseScheduleState {
  return {
    projectStart: plug,
    multiUnits: false,
    units: [],
    phases: defaultPhases().map((row) =>
      row.id === "mech"
        ? { ...row, on: true, start: plug, stop: plug, daysPerWeek: 7, hoursPerDay: 0, otAfter8: false }
        : { ...row, on: false },
    ),
  };
}

function hoursPlugRange(hours: number, rowId: string, phase: PhaseRow, plug: string): CalendarRange {
  return {
    id: `${rowId}-${phase.id}-hours-plug`,
    start: plug,
    end: plug,
    headcount: 1,
    nightHeadcount: 0,
    hoursPerShift: hours,
    perDiemPeople: 0,
    nightPerDiemPeople: 0,
    days: [true, true, true, true, true, true, true],
    phaseId: phase.id,
    shift: "Days",
    otAfter8: false,
  };
}

export function crewFromMadisonPositions(
  positions: MadisonFixturePosition[],
  plug = loadRodeoU110Fixture().hoursPlugDate,
  idPrefix = "u110",
): EstimateXlsxCrew {
  const schedule = rodeoU110Schedule(plug);
  const mech = schedule.phases.find((row) => row.id === "mech") ?? schedule.phases[0];
  const crew: EstimateXlsxCrew = {
    staff: [],
    generalForeman: [],
    foreman: [],
    direct: [],
    support: [],
    otAfter8: false,
  };
  positions.forEach((item, index) => {
    const id = `${idPrefix}-${item.sheet}-${index + 1}`;
    const row: CraftRow = {
      ...blankCraftRow(),
      id,
      position: item.position,
      shift: "Days",
      bookRate: item.bookRate,
      ranges: [hoursPlugRange(item.hours, id, mech, plug)],
    };
    const list = crew[item.lane] ?? [];
    (crew[item.lane] as CraftRow[]) = [...list, row];
  });
  crew.support = hydrateSupportLines(crew.support ?? []);
  return crew;
}

export function otherCostFromMadison(misc: MadisonU110Fixture["misc"]): OtherCostSheet {
  const lines: MiscLine[] = misc
    .filter((row) => row.each > 0 && row.qty > 0)
    .map((row) => ({ ...blankMisc(row.item), qty: row.qty, each: row.each, bookPriced: true }));
  return { ...emptyOtherCost(), misc: lines };
}

export function typedHoursFromMadisonPositions(positions: MadisonFixturePosition[]): MadisonTypedHours {
  const next: MadisonTypedHours = {
    staffHours: 0,
    generalForemanHours: 0,
    foremenHours: 0,
    directHours: 0,
    supportHours: 0,
    directBucketHours: 0,
    indirectBucketHours: 0,
  };
  for (const row of positions) {
    if (row.lane === "staff") next.staffHours += row.hours;
    else if (row.lane === "generalForeman") next.generalForemanHours += row.hours;
    else if (row.lane === "foreman") next.foremenHours += row.hours;
    else if (row.lane === "direct") next.directHours += row.hours;
    else next.supportHours += row.hours;
  }
  next.directBucketHours = next.directHours + next.supportHours;
  next.indirectBucketHours = next.staffHours + next.generalForemanHours + next.foremenHours;
  return next;
}

export function ingestRodeoU110FromFixture(fixture: MadisonU110Fixture = loadRodeoU110Fixture()): MadisonU110Ingest {
  return {
    fixture,
    schedule: rodeoU110Schedule(fixture.hoursPlugDate),
    crew: crewFromMadisonPositions(fixture.positions, fixture.hoursPlugDate),
    otherCost: otherCostFromMadison(fixture.misc),
    jobMeta: {
      area: fixture.jobMeta.area || "U110",
      staffPerDiemRate: fixture.jobMeta.staffPerDiemRate || RODEO_STAFF_PD,
      craftPerDiemRate: fixture.jobMeta.craftPerDiemRate || RODEO_CRAFT_PD,
    },
  };
}

export function rodeoU110HoursFromCrew(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  site = RODEO_U110_SITE,
  client = RODEO_U110_CLIENT,
): MadisonTypedHours {
  const hoursFor = (rows: CraftRow[] | undefined) =>
    (rows ?? []).reduce((sum, row) => sum + computeRowHours(row, site, client).hours, 0);
  const staffHours = hoursFor(crew?.staff as CraftRow[] | undefined);
  const generalForemanHours = hoursFor(crew?.generalForeman as CraftRow[] | undefined);
  const foremenHours = hoursFor(crew?.foreman as CraftRow[] | undefined);
  const directHours = hoursFor(crew?.direct as CraftRow[] | undefined);
  const supportHours = hoursFor(crew?.support as CraftRow[] | undefined);
  return {
    staffHours,
    generalForemanHours,
    foremenHours,
    directHours,
    supportHours,
    directBucketHours: directHours + supportHours,
    indirectBucketHours: staffHours + generalForemanHours + foremenHours,
  };
}

export function rodeoU110BucketHoursFromCrew(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  site = RODEO_U110_SITE,
  client = RODEO_U110_CLIENT,
) {
  const lanes: MadisonLane[] = ["staff", "generalForeman", "foreman", "direct", "support"];
  let directHours = 0;
  let indirectHours = 0;
  for (const lane of lanes) {
    for (const row of (crew?.[lane] as CraftRow[] | undefined) ?? []) {
      if (!row.position?.trim()) continue;
      const hours = computeRowHours(row, site, client).hours;
      if (rodeoRowBucket(lane, row) === "direct") directHours += hours;
      else indirectHours += hours;
    }
  }
  return { directHours, indirectHours, totalHours: directHours + indirectHours };
}

function moneyEqual(a: number, b: number, tol = HOURS_TOL) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
}

export function checkRodeoU110OfficialHours(
  hours?: Pick<ContractorGoldenBuckets, "directHours" | "indirectHours" | "totalHours"> | null,
): { ok: boolean; reason?: string } {
  const golden = U110_CONTRACTOR_GOLDEN.buckets!;
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

export function checkRodeoU110PackHours(
  crew: EstimateXlsxCrew | RodeoCrew | null | undefined,
  expected: MadisonTypedHours = loadRodeoU110Fixture().typedHours,
): { ok: boolean; reason?: string } {
  const got = rodeoU110HoursFromCrew(crew);
  const keys = ["staffHours", "generalForemanHours", "foremenHours", "directHours", "supportHours"] as const;
  for (const key of keys) {
    if (!moneyEqual(got[key], expected[key], HOURS_TOL)) {
      return { ok: false, reason: `${key} ${got[key]} ≠ typed ${expected[key]}` };
    }
  }
  const buckets = rodeoU110BucketHoursFromCrew(crew);
  if (!moneyEqual(buckets.directHours, expected.directBucketHours, HOURS_TOL)) {
    return { ok: false, reason: `direct bucket ${buckets.directHours} ≠ ${expected.directBucketHours}` };
  }
  if (!moneyEqual(buckets.indirectHours, expected.indirectBucketHours, HOURS_TOL)) {
    return { ok: false, reason: `indirect bucket ${buckets.indirectHours} ≠ ${expected.indirectBucketHours}` };
  }
  return { ok: true };
}

export function rodeoU110FilledSnapshot(
  base?: Partial<EstimatePackSnapshot>,
  ingested: MadisonU110Ingest = ingestRodeoU110FromFixture(),
): EstimatePackSnapshot {
  return {
    packId: RODEO_U110_PACK_ID,
    key: `new:${RODEO_U110_PACK_ID}`,
    title: RODEO_U110_TITLE,
    client: RODEO_U110_CLIENT,
    site: RODEO_U110_SITE,
    siteId: RODEO_U110_SITE_ID,
    createdAt: base?.createdAt ?? 1,
    updatedAt: Date.now(),
    ownerEmail: base?.ownerEmail || "",
    status: base?.status || RODEO_U110_STATUS,
    schedule: ingested.schedule,
    crew: ingested.crew,
    jobMeta: {
      ...(typeof base?.jobMeta === "object" && base.jobMeta ? base.jobMeta : {}),
      ...ingested.jobMeta,
      rodeoForm: { tarUnit: "U110", contractor: "", block: "" },
    },
    otherCost: ingested.otherCost,
    costReport: base?.costReport,
  };
}

/** Fill empty U110 crew from the official Madison R1 extract. Do not smash a live clock. */
export function shouldFillRodeoU110Crew(pack?: { packId?: string; crew?: unknown } | null) {
  if (!isRodeoU110PackId(pack?.packId)) return false;
  return !crewHasRows(pack?.crew);
}

export function seedRodeoU110LocalDefaults(store: StorageLike, packId: string) {
  if (!isRodeoU110PackId(packId)) return;
  const pack = listLocalPacks(store).find((row) => row.packId === packId);
  if (!pack) {
    rememberLocalPack(
      {
        packId,
        title: RODEO_U110_TITLE,
        client: RODEO_U110_CLIENT,
        site: RODEO_U110_SITE,
        status: RODEO_U110_STATUS,
      },
      store,
    );
  } else if (!pack.status) {
    rememberLocalPack(
      {
        packId,
        title: pack.title || RODEO_U110_TITLE,
        client: pack.client || RODEO_U110_CLIENT,
        site: pack.site || RODEO_U110_SITE,
        ownerEmail: pack.ownerEmail,
        status: RODEO_U110_STATUS,
      },
      store,
    );
  }
  const key = storageKeyForPack(packId);
  const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
  if (!crewHasRows(crew)) {
    const filled = rodeoU110FilledSnapshot({
      createdAt: pack?.createdAt,
      ownerEmail: pack?.ownerEmail,
      status: pack?.status || RODEO_U110_STATUS,
    });
    applyPackToStore(store, filled);
  }
}

/** After wake cards paint, fill empty U110 from Madison R1. Prefer filled seed over empty Drive. */
export function persistRodeoU110Wake(store?: StorageLike | null) {
  if (!store) return;
  seedRodeoU110LocalDefaults(store, RODEO_U110_PACK_ID);
}

/** Drive Estimates-room name `estimateFileName` will mint on first owner Save. */
export const RODEO_U110_VAULT_FILE = "rodeo-rodeo-u110-2026-ta.json";

export const RODEO_U110_VAULT_APPLY =
  "Owner OAuth vault write: open Rodeo U110 so wake seeds Family A hours × bookRate (desk total $5,247,587), then Save. Landing name: rodeo-rodeo-u110-2026-ta.json. No vault JSON on Drive yet — do not upload a seed whose desk total is other+markup only. Service-account-only isolates cannot PATCH a missing file. Do not commit the xlsx. Do not invent Family B workbook dollars.";

export { RODEO_U110_JOB_CODE, RODEO_U110_PACK_ID };
