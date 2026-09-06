/**
 * Phone overlay for Estimate Total. Hide is UI only — the live total
 * path is unchanged. Not a pack field and not a second grand total.
 */
export const ESTIMATE_TOTAL_RAIL_PHONE_KEY = "hs_est_total_rail_phone_v1";
/** Matches when the rail floats over Job setup (no desktop padding-right). */
export const ESTIMATE_TOTAL_RAIL_PHONE_QUERY = "(max-width: 899px)";

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function storage(store?: Store | null): Store | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readEstimateTotalRailPhoneHidden(store?: Store | null): boolean {
  const target = storage(store);
  if (!target) return false;
  try {
    const raw = target.getItem(ESTIMATE_TOTAL_RAIL_PHONE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { hidden?: unknown };
    return parsed.hidden === true;
  } catch {
    return false;
  }
}

export function writeEstimateTotalRailPhoneHidden(hidden: boolean, store?: Store | null) {
  const target = storage(store);
  if (!target) return;
  try {
    target.setItem(ESTIMATE_TOTAL_RAIL_PHONE_KEY, JSON.stringify({ hidden: Boolean(hidden) }));
  } catch {
    // keep the previous copy
  }
}
