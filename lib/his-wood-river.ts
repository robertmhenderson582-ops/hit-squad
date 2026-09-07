import {
  BOILER17_COST_NOTE,
  BOILER17_JOB_NUMBER,
  BOILER17_PACK_ID,
  BOILER17_SITE,
  BOILER17_SITE_ID,
  BOILER17_STATUS,
  BOILER17_TITLE,
  BOILER17_WINDOW,
  isBoiler17PackId,
  MIKE_CPPR_108451_STATUS_DATE,
} from "./boiler-17.ts";
import { COST_REPORT_STORE_PREFIX } from "./cost-report-prefix.ts";
import { emptyCostReportBook, hydrateCostReport } from "./cost-report.ts";
import type { EstimateStatus } from "./estimate-status.ts";
import { applyPackToStore, crewHasRows } from "./estimate-pack.ts";
import { CREW_STORE_PREFIX } from "./phase-schedule.ts";
import { boiler17B1FilledSnapshot } from "./wood-river-b1.ts";
import { canonicalEmail, isOwnerIdentity, isSamePerson } from "./identity.ts";
import { JOB_META_PREFIX } from "./job-meta-prefix.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  deleteLocalPack,
  listLocalPacks,
  rememberLocalPack,
  readStoreJson,
  storageKeyForPack,
  writeStoreJson,
  type LocalPack,
  type StorageLike,
} from "./local-estimates.ts";
import { hydrateJobMeta, type JobMeta } from "./staffing-plan.ts";

/** Nathan’s Wood River HIS cards. Identity only — no dollars, no sheet contents. */
export const NATHAN_DESK_EMAIL = "nathanboyte@gmail.com";
export const NATHAN_DESK_NAME = "Nathan Boyte";
const JAMES_DESK_EMAIL = "jameshcainjr@gmail.com";

export type HisWoodRiverFile = {
  packId?: string;
  fileId: string;
  fileName: string;
  title: string;
  client: string;
  site: string;
  siteId: string;
  ownerEmail: string;
  /** Awarded Regular work paints Locked. Bid HIS cards leave this unset. */
  status?: EstimateStatus;
  window?: string;
};

export type HisIdentityPack = {
  packId?: string;
  title?: string;
  client?: string;
  site?: string;
  siteId?: string;
  ownerEmail?: string;
  fileId?: string;
  code?: string;
  estimator?: string;
  transferredTo?: string;
  transferredToName?: string;
  transferredFrom?: string;
  transferredFromName?: string;
  sharedWith?: string[];
  status?: EstimateStatus;
};

/** Live Drive files. Never the thin Aromatics stub. Snapshots folder is frozen and omitted. */
export const HIS_WOOD_RIVER_FILES: HisWoodRiverFile[] = [
  {
    packId: "new-mtj7bvtk-akmei",
    fileId: "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz",
    fileName: "wood-river-2027-aromatics-turnaround.json",
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
  {
    packId: "new-mtaajdwa-f7539",
    fileId: "1wa1bH4SgGlkMg2sUX7kLeyZXooI0aD-d",
    fileName: "wood-river-madison-cat-2-pit-stop.json",
    title: "Madison CAT 2 (Pit Stop)",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
  {
    packId: BOILER17_PACK_ID,
    fileId: "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y",
    fileName: "wood-river-boiler-17-2026.json",
    title: BOILER17_TITLE,
    client: "Phillips 66",
    site: BOILER17_SITE,
    siteId: BOILER17_SITE_ID,
    ownerEmail: NATHAN_DESK_EMAIL,
    status: BOILER17_STATUS,
    window: BOILER17_WINDOW,
  },
];

export const HIS_AROMATICS_PACK_ID = "new-mtj7bvtk-akmei";
export const HIS_CAT2_PACK_ID = "new-mtaajdwa-f7539";
export const HIS_BOILER17_PACK_ID = BOILER17_PACK_ID;
export const HIS_BOILER17_FILE_ID = "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y";
export const HIS_BOILER17_JOB_CODE = "EST-B1726";
/** Purged leftover. Trashed Drive file — never restamp, first-paint, or hydrate. */
export const HIS_TM_PACK_ID = "new-mtj5d6";
export const HIS_AROMATICS_FILE_ID = "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz";
export const HIS_CAT2_FILE_ID = "1wa1bH4SgGlkMg2sUX7kLeyZXooI0aD-d";
/** Purged leftover file id. Keep for drop/skip only. */
export const HIS_TM_FILE_ID = "1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI";
export const HIS_TM_TITLE = "Wood River / T&M 2027-01 to 06";
export const HIS_TM_JOB_CODE = "EST-MTJ5D6";
export const HIS_AROMATICS_STUB_ID = "1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9";
/**
 * Sep 2 2027 Aromatics freeze.json — a FILE, not a folder. Read-only restore
 * snapshot for the last steady Estimate Total. Never write this id. Pack has
 * no estimate-total undo history; Purchasing / PPR snapshots are not the clock.
 */
export const HIS_AROMATICS_FREEZE_FILE_ID = "1yMOHR4ES9Ba7Y0G5C2wFcpwH34i0sJ7m";
/** @deprecated misnomer — this id is the Aromatics freeze file, not a folder. */
export const HIS_SNAPSHOTS_FOLDER_ID = HIS_AROMATICS_FREEZE_FILE_ID;

export function hisKnownEstimateFiles() {
  return HIS_WOOD_RIVER_FILES.filter((row) => row.fileId !== HIS_AROMATICS_STUB_ID);
}

function normPackId(value = "") {
  return value.trim().toLowerCase();
}

/** EST-XXXXXX from a new- packId, a job-code leftover, or any id that already contains EST-XXXXXX. */
export function jobCodeFromPackId(packId = "") {
  const id = packId.trim();
  if (!id) return "";
  const coded = id.toUpperCase().match(/EST-([A-Z0-9]{6})/);
  if (coded) return `EST-${coded[1]}`;
  return `EST-${id.replace(/^new-/i, "").slice(0, 6).toUpperCase()}`;
}

function hisNeedle(value = "") {
  return `${value}`.toLowerCase();
}

/** Trashed HIS leftover EST-MTJ5D6 / T&M card. Never restamp, first-paint, or hydrate. */
export function isPurgedHisLeftover(pack?: HisIdentityPack | null): boolean {
  if (!pack) return false;
  if (pack.fileId === HIS_TM_FILE_ID || pack.fileId === HIS_AROMATICS_STUB_ID) return true;
  const ids = [pack.packId, pack.code, pack.fileId].filter(Boolean).join(" ");
  if (hisNeedle(ids).includes("mtj5d6") || jobCodeFromPackId(pack.packId || pack.code || "") === HIS_TM_JOB_CODE) {
    return true;
  }
  return hisTitleKey(pack.title) === hisTitleKey(HIS_TM_TITLE);
}

export function omitPurgedHisLeftovers<T extends HisIdentityPack>(packs: T[] | undefined | null): T[] {
  return (packs ?? []).filter((pack) => !isPurgedHisLeftover(pack));
}

export function hisFileForPackId(packId: string) {
  const id = (packId || "").trim();
  if (!id || isPurgedHisLeftover({ packId: id })) return null;
  const needle = normPackId(id);
  const exact = hisKnownEstimateFiles().find((row) => row.packId && normPackId(row.packId) === needle);
  if (exact) return exact;
  return (
    hisKnownEstimateFiles().find((row) => row.packId && needle.startsWith(normPackId(row.packId))) ?? null
  );
}

export function hisFileByDriveId(fileId: string) {
  const id = (fileId || "").trim();
  if (!id) return null;
  return hisKnownEstimateFiles().find((row) => row.fileId === id) ?? null;
}

function hisTitleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Known Nathan Wood River jobs only. Purged T&M leftover and "New Turnaround estimate" never match. */
export function hisMatchForPack(pack?: HisIdentityPack | null) {
  if (!pack || isPurgedHisLeftover(pack)) return null;
  if (pack.fileId) {
    const byFile = hisFileByDriveId(pack.fileId);
    if (byFile) return byFile;
  }
  const byId = pack.packId ? hisFileForPackId(pack.packId) : null;
  if (byId) return byId;
  const title = hisTitleKey(pack.title);
  if (!title) return null;
  return hisKnownEstimateFiles().find((row) => hisTitleKey(row.title) === title) ?? null;
}

export function isHisWoodRiverPack(pack?: HisIdentityPack | null) {
  return Boolean(hisMatchForPack(pack));
}

export function isHisWoodRiverJob(job?: { title?: string; code?: string; packId?: string; id?: string } | null) {
  if (!job || isPurgedHisLeftover({ packId: job.packId || job.id, title: job.title, code: job.code })) return false;
  const title = hisTitleKey(job.title);
  return Boolean(title && hisKnownEstimateFiles().some((row) => hisTitleKey(row.title) === title));
}

/** Job-menu leftover ids: packId, job-{packId}, or a live HIS title. Purged T&M is not protected. */
export function isHisProtectedMenuItem(item?: { id?: string; packId?: string; title?: string } | null) {
  if (!item) return false;
  const rawId = (item.id || "").trim();
  const rawPack = (item.packId || "").trim();
  const candidates = [
    rawPack,
    rawId,
    rawId.startsWith("job-") ? rawId.slice(4) : "",
    rawPack.startsWith("job-") ? rawPack.slice(4) : "",
    item.title,
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (hisMatchForPack({ packId: candidate, title: item.title || candidate })) return true;
    if (isHisWoodRiverJob({ title: item.title || candidate, code: candidate })) return true;
  }
  return false;
}

export function shouldPaintHisCards(user?: { email?: string; role?: string } | null) {
  if (!user) return true;
  if (user.role === "owner" || isOwnerIdentity(user.email)) return true;
  return canonicalEmail(user.email) === NATHAN_DESK_EMAIL;
}

/** Nathan unless the owner already holds the pack with no James / foreign leftover stamp. */
function hisDeskOwnerEmail(pack: HisIdentityPack) {
  const current = hisOwnerKey(pack.ownerEmail);
  if (current === NATHAN_DESK_EMAIL) return NATHAN_DESK_EMAIL;
  if (
    isOwnerIdentity(current) &&
    !isForeignHisIdentity(pack.transferredTo) &&
    !isForeignHisIdentity(pack.transferredToName)
  ) {
    return OWNER_LOGIN_EMAIL;
  }
  return NATHAN_DESK_EMAIL;
}

export const HIS_LEFTOVER_GEN = "5";
export const HIS_LEFTOVER_GEN_KEY = "hs_his_leftover_gen";

function isJamesStamp(value?: string) {
  const key = canonicalEmail(value) || (value || "").trim().toLowerCase();
  if (!key) return false;
  return key === JAMES_DESK_EMAIL || isSamePerson(value, JAMES_DESK_EMAIL) || /james cain/i.test(value || "");
}

/** James, Benny, or any other non-Nathan non-owner stamp on a HIS card. */
export function isForeignHisIdentity(value?: string) {
  if (!value?.trim()) return false;
  if (isJamesStamp(value)) return true;
  const email = canonicalEmail(value) || value.trim().toLowerCase();
  if (!email) return false;
  return email !== NATHAN_DESK_EMAIL && !isOwnerIdentity(email);
}

function hisOwnerKey(value?: string) {
  return canonicalEmail(value) || (value || "").trim().toLowerCase();
}

function shouldClearHisStamp(value?: string) {
  return isForeignHisIdentity(value);
}

/** Leftover HIS row whose ownerEmail / transferredTo is James or any non-Nathan non-owner. */
export function isStaleHisLeftoverIdentity(pack?: HisIdentityPack | null) {
  if (!pack || !hisMatchForPack(pack)) return false;
  return (
    isForeignHisIdentity(pack.ownerEmail) ||
    isForeignHisIdentity(pack.transferredTo) ||
    isForeignHisIdentity(pack.transferredToName)
  );
}

export function leftoverHasStaleHisIdentity(packs: HisIdentityPack[]): boolean {
  return packs.some((pack) => isStaleHisLeftoverIdentity(pack));
}

export function leftoverHasPurgedHisCards(packs: HisIdentityPack[]): boolean {
  return packs.some((pack) => isPurgedHisLeftover(pack));
}

export function leftoverNeedsRewrite(packs: HisIdentityPack[]): boolean {
  return leftoverHasStaleHisIdentity(packs) || leftoverHasPurgedHisCards(packs);
}

export function leftoverGenIsCurrent(store?: StorageLike | null) {
  if (!store) return false;
  return store.getItem(HIS_LEFTOVER_GEN_KEY) === HIS_LEFTOVER_GEN;
}

export function markLeftoverGen(store?: StorageLike | null) {
  if (!store) return;
  store.setItem(HIS_LEFTOVER_GEN_KEY, HIS_LEFTOVER_GEN);
}

/** Restore Nathan identity when leftover still names James / Benny. Owner OPEN/edits by role. No share rows, no dollars. */
export function applyHisIdentity<T extends HisIdentityPack>(pack: T, his?: HisWoodRiverFile | null): T {
  const row = his ?? hisMatchForPack(pack);
  if (!row) return pack;
  const ownerEmail = hisDeskOwnerEmail(pack);
  const next: T = {
    ...pack,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    ownerEmail,
    status: pack.status || row.status,
  };
  return {
    ...next,
    estimator: shouldClearHisStamp(pack.estimator) ? NATHAN_DESK_NAME : pack.estimator,
    transferredTo: shouldClearHisStamp(pack.transferredTo) ? undefined : pack.transferredTo,
    transferredToName: shouldClearHisStamp(pack.transferredToName) ? undefined : pack.transferredToName,
    transferredFrom: isJamesStamp(pack.transferredFrom) ? undefined : pack.transferredFrom,
    transferredFromName: isJamesStamp(pack.transferredFromName) ? undefined : pack.transferredFromName,
    sharedWith: Array.isArray(pack.sharedWith)
      ? pack.sharedWith.filter((email) => !isForeignHisIdentity(email))
      : pack.sharedWith,
  };
}

function cardFromHis(row: HisWoodRiverFile & { packId: string }): LocalPack {
  return {
    packId: row.packId,
    key: `new:${row.packId}`,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: row.ownerEmail,
    status: row.status,
  };
}

/** First-paint Wood River cards when local storage and Drive list are empty. */
export function hisWoodRiverCards(): LocalPack[] {
  return hisKnownEstimateFiles()
    .filter((row): row is HisWoodRiverFile & { packId: string } => Boolean(row.packId))
    .map(cardFromHis);
}

function hisCardAlreadyPresent(packs: LocalPack[], card: LocalPack) {
  return packs.some((row) => {
    if (normPackId(row.packId) === normPackId(card.packId)) return true;
    const match = hisMatchForPack(row);
    if (match && match.packId && normPackId(match.packId) === normPackId(card.packId)) return true;
    return hisTitleKey(row.title) === hisTitleKey(card.title);
  });
}

/** Identity cards only when the desk does not already have that job (by packId or title). Drops purged T&M leftover. */
export function mergeHisWoodRiverCards(packs: LocalPack[]): LocalPack[] {
  const next = omitPurgedHisLeftovers(packs).map((pack) => {
    const his = hisMatchForPack(pack);
    return his ? applyHisIdentity(pack, his) : pack;
  });
  const others: LocalPack[] = [];
  const byHis = new Map<string, LocalPack>();
  for (const pack of next) {
    const his = hisMatchForPack(pack);
    if (!his) {
      others.push(pack);
      continue;
    }
    const current = byHis.get(his.fileId);
    if (!current) {
      byHis.set(his.fileId, pack);
      continue;
    }
    const seed = his.packId ? normPackId(his.packId) : "";
    const currentIsSeed = Boolean(seed && normPackId(current.packId) === seed);
    const nextIsLeftover = Boolean(seed && normPackId(pack.packId) !== seed);
    if (currentIsSeed && nextIsLeftover) byHis.set(his.fileId, pack);
  }
  const kept = [...others, ...byHis.values()];
  const extras = hisWoodRiverCards().filter((row) => !hisCardAlreadyPresent(kept, row));
  return [...kept, ...extras];
}

/** Rewrite stale local HIS leftover rows in place. Drops purged T&M. Does not add extras or clear other keys. */
export function rewriteStaleHisLocalLeftover(store?: StorageLike | null): LocalPack[] {
  if (!store) return [];
  dropPurgedHisLocalLeftover(store);
  for (const pack of listLocalPacks(store)) {
    if (!isStaleHisLeftoverIdentity(pack)) continue;
    const next = applyHisIdentity(pack);
    rememberLocalPack(
      {
        packId: next.packId,
        title: next.title,
        client: next.client,
        site: next.site,
        size: next.size,
        ownerEmail: next.ownerEmail,
        archived: next.archived,
        estimator: next.estimator,
        sharedWith: next.sharedWith,
        transferredFrom: next.transferredFrom,
        transferredTo: next.transferredTo,
        transferredToName: next.transferredToName,
        transferredFromName: next.transferredFromName,
        replaceHandoff: true,
      },
      store,
    );
  }
  return listLocalPacks(store);
}

function dropPurgedHisLocalLeftover(store: StorageLike) {
  for (const pack of listLocalPacks(store)) {
    if (!isPurgedHisLeftover(pack)) continue;
    deleteLocalPack(pack.packId, store);
  }
}

/** After leftover hydrate, restamp live HIS matches and keep Aromatics / CAT on the desk. Drops purged T&M. */
export function persistHisWoodRiverCards(store?: StorageLike | null): LocalPack[] {
  if (!store) return [];
  dropPurgedHisLocalLeftover(store);
  const painted = mergeHisWoodRiverCards(listLocalPacks(store));
  for (const pack of painted) {
    if (!hisMatchForPack(pack)) continue;
    rememberLocalPack(
      {
        packId: pack.packId,
        title: pack.title,
        client: pack.client,
        site: pack.site,
        size: pack.size,
        ownerEmail: pack.ownerEmail,
        archived: pack.archived,
        estimator: pack.estimator,
        sharedWith: pack.sharedWith,
        transferredFrom: pack.transferredFrom,
        transferredTo: pack.transferredTo,
        transferredToName: pack.transferredToName,
        transferredFromName: pack.transferredFromName,
        replaceHandoff: true,
        status: pack.status,
      },
      store,
    );
    seedBoiler17LocalDefaults(store, pack.packId);
  }
  return mergeHisWoodRiverCards(listLocalPacks(store));
}

/** Job # 108451 + Mike CPPR May notes when Cost has not been pasted yet. */
export function seedBoiler17LocalDefaults(store: StorageLike, packId: string) {
  if (!isBoiler17PackId(packId)) return;
  const pack = listLocalPacks(store).find((row) => row.packId === packId);
  if (pack && !pack.status) {
    rememberLocalPack(
      {
        packId,
        title: pack.title || BOILER17_TITLE,
        client: pack.client || "Phillips 66",
        site: pack.site || BOILER17_SITE,
        ownerEmail: pack.ownerEmail,
        status: BOILER17_STATUS,
      },
      store,
    );
  }
  const key = storageKeyForPack(packId);
  const meta = hydrateJobMeta(readStoreJson<Partial<JobMeta>>(store, `${JOB_META_PREFIX}${key}`));
  if (!meta.jobNumber.trim()) {
    writeStoreJson(store, `${JOB_META_PREFIX}${key}`, {
      ...meta,
      jobNumber: BOILER17_JOB_NUMBER,
      area: meta.area || "Boiler 17",
    });
  }
  const book = hydrateCostReport(readStoreJson(store, `${COST_REPORT_STORE_PREFIX}${key}`));
  if (!book.notes.trim()) {
    writeStoreJson(store, `${COST_REPORT_STORE_PREFIX}${key}`, {
      ...emptyCostReportBook(),
      ...book,
      statusDate: MIKE_CPPR_108451_STATUS_DATE,
      notes: BOILER17_COST_NOTE,
    });
  }
  const crew = readStoreJson(store, `${CREW_STORE_PREFIX}${key}`);
  if (!crewHasRows(crew)) {
    const filled = boiler17B1FilledSnapshot({
      createdAt: pack?.createdAt,
      ownerEmail: pack?.ownerEmail,
      jobMeta: meta,
      costReport: book.notes.trim() ? book : { ...emptyCostReportBook(), ...book, statusDate: MIKE_CPPR_108451_STATUS_DATE, notes: BOILER17_COST_NOTE },
    });
    applyPackToStore(store, filled);
  }
}

export function hisCardToSnapshot(row: HisWoodRiverFile & { packId: string }): EstimatePackSnapshot {
  return {
    packId: row.packId,
    key: `new:${row.packId}`,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: row.ownerEmail,
    status: row.status,
  };
}
