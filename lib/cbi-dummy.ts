import { isRetiredPeerPack, type CompanyScope } from "./companies.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";

/** Retired CBI shop sketch. Never seed this pack on any desk. */
export const CBI_DUMMY_PACK_ID = "new-cbi-shape-1";
export const CBI_DUMMY_TITLE = "Shop sketch";

export function cbiDummyPack(): LocalPack | null {
  return null;
}

export function shouldSeedCbiDummy(_scope?: CompanyScope | null): boolean {
  return false;
}

export function dummyPacksForUser(_scope?: CompanyScope | null): LocalPack[] {
  return [];
}

/** No-op. CBI dummy seeding is retired. */
export function ensureCbiDummyPack(
  _store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  return null;
}

export function mergeDummyPacks(packs: LocalPack[], _scope?: CompanyScope | null): LocalPack[] {
  return packs.filter((pack) => !isRetiredPeerPack(pack));
}
