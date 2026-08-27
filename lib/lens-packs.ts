import { visibleDeskPacks, type ScopeUser } from "./estimate-scope.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { listLocalPacks, type LocalPack, type StorageLike } from "./local-estimates.ts";

export const LENS_PACKS_KEY = "hs_lens_packs_v1";

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

/** Live packs for the viewed seat, or the last hydrated snapshot if leftover flush cleared local. */
export function packsForViewedDesk(
  user?: ScopeUser | null,
  viewingAs = false,
  seat?: string | null,
  store?: StorageLike | null,
): LocalPack[] {
  const live = visibleDeskPacks(user, viewingAs, store);
  if (!viewingAs || live.length || !seat) return live;
  return readLensPacks(seat, store);
}
