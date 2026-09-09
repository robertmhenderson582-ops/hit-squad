/**
 * Rodeo U250 — Madison contractor R2 → Hit Squad live pack.
 *
 * Same Wood River five-card desk as U110 (Staff / GF / Foreman / Direct /
 * Support). Family A is hours × one composite rate. Hole Watch/Fire Watch
 * from the Direct tab sits on Support. Official book has no GF / PM /
 * Super rows — do not invent them. Book composite rates ride on each
 * crew seat (`bookRate`); desk labor $ is hours × that rate. Madison
 * titles stay typed. Non-labor SUMMARY lines seed Other Cost as
 * book-priced sell (no 6.5% markup). Excel binaries stay on Drive.
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
export const RODEO_U250_HOURS_PLUG = "2026-08-17";

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
      rodeoForm: { tarUnit: "U250", contractor: "", block: "" },
    },
    otherCost: ingested.otherCost,
    costReport: base?.costReport,
  };
}

/** Fill empty U250 crew from the official Madison R2 extract. Do not smash a live clock. */
export function shouldFillRodeoU250Crew(pack?: { packId?: string; crew?: unknown } | null) {
  if (!isRodeoU250PackId(pack?.packId)) return false;
  return !crewHasRows(pack?.crew);
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
  if (!crewHasRows(crew)) {
    const filled = rodeoU250FilledSnapshot({
      createdAt: pack?.createdAt,
      ownerEmail: pack?.ownerEmail,
      status: pack?.status || RODEO_U250_STATUS,
    });
    applyPackToStore(store, filled);
  }
}

/** After wake cards paint, fill empty U250 from Madison R2. Prefer filled seed over empty Drive. */
export function persistRodeoU250Wake(store?: StorageLike | null) {
  if (!store) return;
  seedRodeoU250LocalDefaults(store, RODEO_U250_PACK_ID);
}

/** Drive Estimates-room name `estimateFileName` will mint on first owner Save. */
export const RODEO_U250_VAULT_FILE = "rodeo-rodeo-u250-fall-2026.json";

export const RODEO_U250_VAULT_APPLY =
  "Owner OAuth vault write: open Rodeo U250 so wake seeds Family A hours × bookRate (desk total $2,470,680), then Save. Landing name: rodeo-rodeo-u250-fall-2026.json. No vault JSON on Drive yet — do not upload a seed whose desk total is other+markup only. Service-account-only isolates cannot PATCH a missing file. Do not commit the xlsx. Do not invent Family B workbook dollars. Do not create EST-MTN9RM or a second U250 pack.";

export { RODEO_U250_JOB_CODE, RODEO_U250_PACK_ID };
