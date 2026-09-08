import { inferCompanyId, isWipedPeerCompany, type CompanyScope } from "./companies.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";

/** Retired CBI shop sketch. Kept so leftover ids stay recognizable and never re-seed. */
export const CBI_DUMMY_PACK_ID = "new-cbi-shape-1";
export const CBI_DUMMY_TITLE = "Shop sketch";

export function isCbiDummyPack(pack?: { packId?: string; client?: string; title?: string } | null): boolean {
  if (!pack) return false;
  if ((pack.packId || "").trim() === CBI_DUMMY_PACK_ID) return true;
  const client = (pack.client || "").trim().toLowerCase();
  const title = (pack.title || "").trim().toLowerCase();
  return client === "cbi" && title === CBI_DUMMY_TITLE.toLowerCase();
}

export function shouldSeedCbiDummy(_scope?: CompanyScope | null): boolean {
  return false;
}

export function dummyPacksForUser(_scope?: CompanyScope | null): LocalPack[] {
  return [];
}

export function ensureCbiDummyPack(
  _store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  return null;
}

export function mergeDummyPacks(packs: LocalPack[], _scope?: CompanyScope | null): LocalPack[] {
  return packs.filter((row) => !isCbiDummyPack(row) && !isWipedPeerCompany(inferCompanyId(row.client)));
}
