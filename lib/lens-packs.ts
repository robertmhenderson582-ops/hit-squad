import { isOwner } from "./desk-role.ts";
import { localPackVisibleTo, ownerVaultEmail, visibleDeskPacks, type ScopeUser } from "./estimate-scope.ts";
import {
  applyHisIdentity,
  hisMatchForPack,
  leftoverGenIsCurrent,
  leftoverHasStaleHisIdentity,
  markLeftoverGen,
  mergeHisWoodRiverCards,
  rewriteStaleHisLocalLeftover,
  shouldPaintHisCards,
} from "./his-wood-river.ts";
import { isSamePerson } from "./identity.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { JOB_MENU_KEY, clearHisJobMenuLeftover } from "./job-menu.ts";
import { omitCatalogSeedPacks } from "./jobs.ts";
import { listLocalPacks, type LocalPack, type StorageLike } from "./local-estimates.ts";

/** Live leftover keys already on the signed-in desktop. Rewrite these in place. */
export const LENS_PACKS_KEY = "hs_lens_packs_v1";
export const OWNER_PACKS_KEY = "hs_owner_packs_v1";
export const LENS_PACKS_LEGACY_KEY = "hs_lens_packs_v1";
export const OWNER_PACKS_LEGACY_KEY = "hs_owner_packs_v1";

const JOBS_LEFTOVER_KEYS = new Set([LENS_PACKS_KEY, OWNER_PACKS_KEY, JOB_MENU_KEY, "hs_his_leftover_gen", "hs_pack_index_v1"]);

export function isJobsLeftoverKey(key: string) {
  return JOBS_LEFTOVER_KEYS.has(key) || key.startsWith("hs_pack_v1:") || key.startsWith(`${JOB_MENU_KEY}:`);
}

function asStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parseLensMap(raw: string | null): Record<string, LocalPack[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, LocalPack[]> = {};
    for (const [seat, rows] of Object.entries(parsed)) {
      if (!Array.isArray(rows)) continue;
      next[seat] = rows.filter((row): row is LocalPack => Boolean(row && typeof row.packId === "string"));
    }
    return next;
  } catch {
    return {};
  }
}

function readAll(store: StorageLike): Record<string, LocalPack[]> {
  return parseLensMap(store.getItem(LENS_PACKS_KEY));
}

export function snapshotLensPack(
  pack: Pick<
    EstimatePackSnapshot,
    | "packId"
    | "key"
    | "title"
    | "client"
    | "site"
    | "size"
    | "siteId"
    | "createdAt"
    | "updatedAt"
    | "ownerEmail"
    | "archived"
    | "sharedWith"
    | "transferredFrom"
    | "transferredTo"
    | "transferredToName"
    | "transferredFromName"
  >,
): LocalPack {
  return {
    packId: pack.packId,
    key: pack.key,
    title: pack.title,
    client: pack.client,
    site: pack.site,
    size: pack.size,
    siteId: pack.siteId,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    ownerEmail: pack.ownerEmail,
    archived: pack.archived,
    sharedWith: pack.sharedWith,
    transferredFrom: pack.transferredFrom,
    transferredTo: pack.transferredTo,
    transferredToName: pack.transferredToName,
    transferredFromName: pack.transferredFromName,
  };
}

export function findDeskPack(packId: string, seat?: string | null, store?: StorageLike | null): LocalPack | null {
  const id = (packId || "").trim();
  if (!id) return null;
  const local = listLocalPacks(store).find((row) => row.packId === id);
  if (local) return hisMatchForPack(local) ? applyHisIdentity(local) : local;
  const ownerHit = readOwnerPacks(store).find((row) => row.packId === id);
  if (ownerHit) return hisMatchForPack(ownerHit) ? applyHisIdentity(ownerHit) : ownerHit;
  if (!seat) return null;
  const lens = readLensPacks(seat, store).find((row) => row.packId === id) ?? null;
  return lens && hisMatchForPack(lens) ? applyHisIdentity(lens) : lens;
}

export function readLensPacks(seat: string, store?: StorageLike | null): LocalPack[] {
  const target = asStore(store);
  const id = (seat || "").trim().toLowerCase();
  if (!target || !id || id === "owner") return [];
  return readAll(target)[id] ?? [];
}

export function writeLensPacks(seat: string, packs: LocalPack[], store?: StorageLike | null) {
  const target = asStore(store);
  const id = (seat || "").trim().toLowerCase();
  if (!target || !id || id === "owner") return;
  const all = readAll(target);
  all[id] = packs;
  target.setItem(LENS_PACKS_KEY, JSON.stringify(all));
}

function readPackList(store: StorageLike | null, key: string): LocalPack[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(key) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is LocalPack => Boolean(row && typeof row.packId === "string"));
  } catch {
    return [];
  }
}

export function readOwnerPacks(store?: StorageLike | null): LocalPack[] {
  return readPackList(asStore(store), OWNER_PACKS_KEY);
}

export function writeOwnerPacks(packs: LocalPack[], store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return;
  target.setItem(OWNER_PACKS_KEY, JSON.stringify(packs));
}

function allLensPacks(store?: StorageLike | null): LocalPack[] {
  const target = asStore(store);
  if (!target) return [];
  return Object.values(readAll(target)).flat();
}

function namedDeskTitle(pack?: LocalPack | null) {
  const title = (pack?.title || "").trim();
  return Boolean(title && title !== "Working estimate");
}

function preferDeskPack(current: LocalPack, next: LocalPack): LocalPack {
  const newer = (next.updatedAt || 0) >= (current.updatedAt || 0) ? next : current;
  const older = newer === next ? current : next;
  const merged: LocalPack = {
    ...older,
    ...newer,
    title: namedDeskTitle(newer) ? newer.title : older.title,
    site: newer.site || older.site,
    siteId: newer.siteId || older.siteId,
    client: newer.client || older.client,
    ownerEmail: newer.ownerEmail || older.ownerEmail,
    sharedWith: newer.sharedWith?.length ? newer.sharedWith : older.sharedWith,
    transferredFrom: newer.transferredFrom || older.transferredFrom,
    transferredFromName: newer.transferredFromName || older.transferredFromName,
    transferredTo: newer.transferredTo || older.transferredTo,
    transferredToName: newer.transferredToName || older.transferredToName,
    updatedAt: Math.max(current.updatedAt || 0, next.updatedAt || 0),
  };
  const his = hisMatchForPack(merged) || hisMatchForPack(current) || hisMatchForPack(next);
  return his ? applyHisIdentity(merged, his) : merged;
}

function mergeDeskPacks(...lists: LocalPack[][]): LocalPack[] {
  const map = new Map<string, LocalPack>();
  for (const list of lists) {
    for (const pack of list) {
      if (!pack?.packId) continue;
      const current = map.get(pack.packId);
      map.set(pack.packId, current ? preferDeskPack(current, pack) : pack);
    }
  }
  return [...map.values()];
}

function rewriteHisLeftoverList(packs: LocalPack[]): LocalPack[] {
  return packs.map((pack) => (hisMatchForPack(pack) ? applyHisIdentity(pack) : pack));
}

function dropHisFromOtherLens(seat: string, packs: LocalPack[]): LocalPack[] {
  if (seat === "nathan") return rewriteHisLeftoverList(packs);
  return packs.filter((pack) => !hisMatchForPack(pack));
}

function leftoverPacksForStaleCheck(store: StorageLike): LocalPack[] {
  return [...listLocalPacks(store), ...readOwnerPacks(store), ...allLensPacks(store)];
}

/**
 * Owner / Nathan Jobs paint. Rewrites leftover keys whenever gen is stale
 * or a HIS row still names James / any non-Nathan non-owner. Not a one-shot flag.
 * Never clears cookies, sessionStorage, or the rest of localStorage.
 */
export function bustHisLeftoverOnce(store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return;
  const stale = leftoverHasStaleHisIdentity(leftoverPacksForStaleCheck(target));
  if (leftoverGenIsCurrent(target) && !stale) return;
  rewriteStaleHisLocalLeftover(target);

  const lens = readAll(target);
  const cleanedLens: Record<string, LocalPack[]> = {};
  for (const [seat, rows] of Object.entries(lens)) {
    cleanedLens[seat] = dropHisFromOtherLens(seat, rows);
  }
  target.setItem(LENS_PACKS_KEY, JSON.stringify(cleanedLens));

  const ownerRows = rewriteHisLeftoverList(readOwnerPacks(target));
  writeOwnerPacks(ownerRows, target);
  clearHisJobMenuLeftover(target);
  clearHisJobMenuLeftover(target, "nathan");
  markLeftoverGen(target);
}

export function ownerShouldSeePack(user: ScopeUser, pack: LocalPack) {
  if (isOwner(user)) return true;
  if (localPackVisibleTo(user, pack)) return true;
  const from = pack.transferredFrom || "";
  return isSamePerson(from, user.email) || isSamePerson(from, ownerVaultEmail());
}

/** Owner-owned or transferred-from-owner cards. A shared-only leftover is not enough to paint Wood River. */
export function ownerDeskHasImmediateWork(
  user?: ScopeUser | null,
  store?: StorageLike | null,
) {
  const owner = user ?? { email: ownerVaultEmail(), role: "owner" as const };
  return packsForViewedDesk(owner, false, null, store).some((pack) => {
    const ownerEmail = pack.ownerEmail || "";
    const from = pack.transferredFrom || "";
    return (
      !ownerEmail ||
      isSamePerson(ownerEmail, owner.email) ||
      isSamePerson(from, owner.email) ||
      isSamePerson(from, ownerVaultEmail())
    );
  });
}

function lensPacksOwnerShouldSee(user: ScopeUser, store?: StorageLike | null): LocalPack[] {
  return allLensPacks(store).filter((pack) => ownerShouldSeePack(user, pack));
}

function localPacksOwnerShouldSee(user: ScopeUser, store?: StorageLike | null): LocalPack[] {
  return listLocalPacks(store).filter((pack) => ownerShouldSeePack(user, pack));
}

/** Live packs for the viewed seat. Owner first paint merges local + last snapshot + lens packs he should see. */
export function packsForViewedDesk(
  user?: ScopeUser | null,
  viewingAs = false,
  seat?: string | null,
  store?: StorageLike | null,
): LocalPack[] {
  const target = asStore(store);
  if (target) bustHisLeftoverOnce(target);
  const live = visibleDeskPacks(user, viewingAs, store);
  if (viewingAs) {
    const next = seat ? mergeDeskPacks(live, readLensPacks(seat, store)) : live;
    // View as Nathan still injects HIS Wood River cards. James / CBI stay off this merge.
    const painted = shouldPaintHisCards(user) ? mergeHisWoodRiverCards(next) : next;
    return omitCatalogSeedPacks(painted);
  }
  const extras = [readOwnerPacks(store)];
  if (user) extras.push(localPacksOwnerShouldSee(user, store), lensPacksOwnerShouldSee(user, store));
  const merged = mergeDeskPacks(live, ...extras);
  const painted = shouldPaintHisCards(user) ? mergeHisWoodRiverCards(merged) : merged;
  return omitCatalogSeedPacks(painted);
}

export function snapshotOwnerDesk(_user?: ScopeUser | null, store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return;
  bustHisLeftoverOnce(target);
  const owner = { email: ownerVaultEmail(), role: "owner" as const };
  writeOwnerPacks(mergeDeskPacks(readOwnerPacks(target), packsForViewedDesk(owner, false, null, target)), target);
}
