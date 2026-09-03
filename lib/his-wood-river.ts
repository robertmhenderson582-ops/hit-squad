import { canonicalEmail, isOwnerIdentity, isSamePerson } from "./identity.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { listLocalPacks, rememberLocalPack, type LocalPack, type StorageLike } from "./local-estimates.ts";

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
    // Live job code EST-MTJ5D6 = first six of packId after `new-`. Not a guessed longer id.
    packId: "new-mtj5d6",
    fileId: "1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI",
    fileName: "wood-river-wood-river-t-m-2027-01-to-06.json",
    title: "Wood River / T&M 2027-01 to 06",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
];

export const HIS_AROMATICS_PACK_ID = "new-mtj7bvtk-akmei";
export const HIS_CAT2_PACK_ID = "new-mtaajdwa-f7539";
export const HIS_TM_PACK_ID = "new-mtj5d6";
export const HIS_AROMATICS_FILE_ID = "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz";
export const HIS_CAT2_FILE_ID = "1wa1bH4SgGlkMg2sUX7kLeyZXooI0aD-d";
export const HIS_TM_FILE_ID = "1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI";
export const HIS_AROMATICS_STUB_ID = "1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9";
export const HIS_SNAPSHOTS_FOLDER_ID = "1yMOHR4ES9Ba7Y0G5C2wFcpwH34i0sJ7m";

export function hisKnownEstimateFiles() {
  return HIS_WOOD_RIVER_FILES.filter((row) => row.fileId !== HIS_AROMATICS_STUB_ID);
}

function normPackId(value = "") {
  return value.trim().toLowerCase();
}

/** EST-MTJ5D6 from a new- packId, a job-code leftover, or any id that already contains EST-XXXXXX. */
export function jobCodeFromPackId(packId = "") {
  const id = packId.trim();
  if (!id) return "";
  const coded = id.toUpperCase().match(/EST-([A-Z0-9]{6})/);
  if (coded) return `EST-${coded[1]}`;
  return `EST-${id.replace(/^new-/i, "").slice(0, 6).toUpperCase()}`;
}

function hisTmFile() {
  return hisKnownEstimateFiles().find((row) => row.fileId === HIS_TM_FILE_ID) ?? null;
}

export function hisFileForPackId(packId: string) {
  const id = (packId || "").trim();
  if (!id) return null;
  const needle = normPackId(id);
  const exact = hisKnownEstimateFiles().find((row) => row.packId && normPackId(row.packId) === needle);
  if (exact) return exact;
  const byPrefix = hisKnownEstimateFiles().find(
    (row) => row.packId && needle.startsWith(normPackId(row.packId)) && normPackId(row.packId).length >= HIS_TM_PACK_ID.length,
  );
  if (byPrefix) return byPrefix;
  // Live leftover is often EST-MTJ5D6 or new-MTJ5D6-… — not only exact new-mtj5d6.
  if (needle.includes("mtj5d6") || jobCodeFromPackId(id) === "EST-MTJ5D6") {
    return hisTmFile();
  }
  return null;
}

export function hisFileByDriveId(fileId: string) {
  const id = (fileId || "").trim();
  if (!id) return null;
  return hisKnownEstimateFiles().find((row) => row.fileId === id) ?? null;
}

function hisTitleKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Known Nathan Wood River jobs only. "New Turnaround estimate" is never a match. */
export function hisMatchForPack(pack?: HisIdentityPack | null) {
  if (!pack) return null;
  if (pack.fileId) {
    const byFile = hisFileByDriveId(pack.fileId);
    if (byFile) return byFile;
  }
  const byId = pack.packId ? hisFileForPackId(pack.packId) : null;
  if (byId) return byId;
  const code = (pack.code || "").trim().toUpperCase();
  if (code === "EST-MTJ5D6" || jobCodeFromPackId(pack.packId || "") === "EST-MTJ5D6") {
    return hisTmFile();
  }
  const title = hisTitleKey(pack.title);
  if (!title) return null;
  // Exact HIS title is enough. Leftover T&M often has an empty site until rememberLocalPack defaults it.
  return hisKnownEstimateFiles().find((row) => hisTitleKey(row.title) === title) ?? null;
}

export function isHisWoodRiverPack(pack?: HisIdentityPack | null) {
  return Boolean(hisMatchForPack(pack));
}

export function isHisWoodRiverJob(job?: { title?: string; code?: string } | null) {
  if (!job) return false;
  if ((job.code || "").trim().toUpperCase() === "EST-MTJ5D6") return true;
  const title = hisTitleKey(job.title);
  return Boolean(title && hisKnownEstimateFiles().some((row) => hisTitleKey(row.title) === title));
}

/** Job-menu leftover ids: packId, job-{packId}, EST-MTJ5D6, or a HIS title. */
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

export const HIS_LEFTOVER_GEN = "4";
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
    if (jobCodeFromPackId(row.packId) === jobCodeFromPackId(card.packId) && jobCodeFromPackId(card.packId) === "EST-MTJ5D6") {
      return true;
    }
    return hisTitleKey(row.title) === hisTitleKey(card.title);
  });
}

/** Identity cards only when the desk does not already have that job (by packId, job code, or title). */
export function mergeHisWoodRiverCards(packs: LocalPack[]): LocalPack[] {
  const next = packs.map((pack) => {
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

/** Rewrite stale local HIS leftover rows in place. Does not add extras or clear other keys. */
export function rewriteStaleHisLocalLeftover(store?: StorageLike | null): LocalPack[] {
  if (!store) return [];
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

/** After leftover hydrate, restamp matches and keep Aromatics / CAT / T&M on the desk. Identity only. */
export function persistHisWoodRiverCards(store?: StorageLike | null): LocalPack[] {
  if (!store) return [];
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
      },
      store,
    );
  }
  return mergeHisWoodRiverCards(listLocalPacks(store));
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
  };
}
