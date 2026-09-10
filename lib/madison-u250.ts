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
 * One reserved pack: EST-U25026 / new-u25026-rodeo. Do not seed EST-MTN9RM
 * or any second U250 pack.
 *
 * Client-safe: static JSON fixture only. Workbook parse lives in madison-u250-xlsx.ts.
 */

import rodeoU250CrewJson from "./wake-golden/rodeo-u250-crew.json" with { type: "json" };
import { applyPackToStore, crewHasRows, type EstimatePackSnapshot } from "./estimate-pack.ts";
import type { EstimateXlsxCrew } from "./estimate-xlsx.ts";
import {
  checkRodeoU110PackHours,
  crewFromMadisonPositions,
  otherCostFromMadison,
  rodeoU110BucketHoursFromCrew,
  rodeoU110HoursFromCrew,
  rodeoU110Schedule,
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
import { CREW_STORE_PREFIX } from "./phase-schedule.ts";
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
export const RODEO_U250_HOURS_PLUG = "2026-09-10";
export const RODEO_U250_CONTRACTOR = "MADISON INDUSTRIAL SVCS TEAM LLC";
export const RODEO_U250_BLOCK = "2026 U250 Cat Change (TAR.ER01.26.250)";

export type MadisonU250Fixture = MadisonU110Fixture;
export type MadisonU250Ingest = MadisonU110Ingest;

export function loadRodeoU250Fixture(): MadisonU250Fixture {
  return rodeoU250CrewJson as MadisonU250Fixture;
}

export function isRodeoU250PackId(packId = "") {
  return packId.trim().toLowerCase() === RODEO_U250_PACK_ID;
}

export function rodeoU250Schedule(plug = loadRodeoU250Fixture().hoursPlugDate) {
  return rodeoU110Schedule(plug);
}

export function ingestRodeoU250FromFixture(fixture: MadisonU250Fixture = loadRodeoU250Fixture()): MadisonU250Ingest {
  return {
    fixture,
    schedule: rodeoU250Schedule(fixture.hoursPlugDate),
    crew: crewFromMadisonPositions(fixture.positions, fixture.hoursPlugDate, "u250"),
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
 * Fill empty U250 crew, or replace a stale R2 / drifted clock that no longer
 * matches the JB 09.10.26 official hours. Do not smash a clock that already
 * matches the live lock.
 */
export function shouldFillRodeoU250Crew(pack?: { packId?: string; crew?: unknown } | null) {
  if (!pack || !isRodeoU250PackId(pack.packId)) return false;
  if (!crewHasRows(pack.crew)) return true;
  return !checkRodeoU250PackHours(pack.crew as never).ok;
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
