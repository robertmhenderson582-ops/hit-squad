import { localPackVisibleTo, ownerVaultEmail, visibleDeskPacks, type ScopeUser } from "./estimate-scope.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { listLocalPacks, type LocalPack, type StorageLike } from "./local-estimates.ts";

export const LENS_PACKS_KEY = "hs_lens_packs_v1";
export const OWNER_PACKS_KEY = "hs_owner_packs_v1";

function asStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readAll(store: StorageLike): Record<string, LocalPack[]> {
  try {
    const raw = store.getItem(LENS_PACKS_KEY);
    if (!raw) return {};
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
  if (local) return local;
  const ownerHit = readOwnerPacks(store).find((row) => row.packId === id);
  if (ownerHit) return ownerHit;
  if (!seat) return null;
  return readLensPacks(seat, store).find((row) => row.packId === id) ?? null;
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

function mergeDeskPacks(...lists: LocalPack[][]): LocalPack[] {
  const map = new Map<string, LocalPack>();
  for (const list of lists) {
    for (const pack of list) {
      if (!pack?.packId) continue;
      const current = map.get(pack.packId);
      if (!current || (pack.updatedAt || 0) >= (current.updatedAt || 0)) map.set(pack.packId, pack);
    }
  }
  return [...map.values()];
}

function ownerShouldSeePack(user: ScopeUser, pack: LocalPack) {
  const email = user.email.trim().toLowerCase();
  if (localPackVisibleTo(user, pack)) return true;
  return (pack.transferredFrom || "").trim().toLowerCase() === email;
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
  const live = visibleDeskPacks(user, viewingAs, store);
  if (viewingAs) {
    if (live.length || !seat) return live;
    return readLensPacks(seat, store);
  }
  const extras = [readOwnerPacks(store)];
  if (user) extras.push(localPacksOwnerShouldSee(user, store), lensPacksOwnerShouldSee(user, store));
  return mergeDeskPacks(live, ...extras);
}

export function snapshotOwnerDesk(user?: ScopeUser | null, store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return;
  const owner = user ?? { email: ownerVaultEmail(), role: "owner" as const };
  writeOwnerPacks(mergeDeskPacks(readOwnerPacks(target), packsForViewedDesk(owner, false, null, target)), target);
}
