/**
 * Phone overlay + rail placement for Estimate Total. Hide and drag are UI
 * only — the live total path is unchanged. Not a pack field and not a
 * second grand total. Position is localStorage on this device (seat key
 * when we have email).
 */
export const ESTIMATE_TOTAL_RAIL_PHONE_KEY = "hs_est_total_rail_phone_v1";
export const ESTIMATE_TOTAL_RAIL_POS_KEY = "hs_est_total_rail_pos_v1";
export const ESTIMATE_TOTAL_RAIL_POS_MARGIN = 8;
/** Matches when the rail floats over Job setup (no desktop padding-right). */
export const ESTIMATE_TOTAL_RAIL_PHONE_QUERY = "(max-width: 899px)";

export type EstimateTotalRailPosition = {
  left: number;
  top: number;
};

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function storage(store?: Store | null): Store | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function estimateTotalRailPositionKey(seat = "") {
  const id = seat.trim().toLowerCase();
  return id ? `${ESTIMATE_TOTAL_RAIL_POS_KEY}:${id}` : ESTIMATE_TOTAL_RAIL_POS_KEY;
}

function parsePosition(raw: string | null): EstimateTotalRailPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
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

export function readEstimateTotalRailPosition(store?: Store | null, seat = ""): EstimateTotalRailPosition | null {
  const target = storage(store);
  if (!target) return null;
  return parsePosition(target.getItem(estimateTotalRailPositionKey(seat)))
    ?? (seat ? parsePosition(target.getItem(ESTIMATE_TOTAL_RAIL_POS_KEY)) : null);
}

export function writeEstimateTotalRailPosition(
  pos: EstimateTotalRailPosition,
  store?: Store | null,
  seat = "",
) {
  const target = storage(store);
  if (!target) return;
  try {
    target.setItem(estimateTotalRailPositionKey(seat), JSON.stringify({ left: pos.left, top: pos.top }));
  } catch {
    // keep the previous copy
  }
}

export function clearEstimateTotalRailPosition(store?: Store | null, seat = "") {
  const target = storage(store);
  if (!target) return;
  try {
    target.removeItem?.(estimateTotalRailPositionKey(seat));
    if (seat) target.removeItem?.(ESTIMATE_TOTAL_RAIL_POS_KEY);
  } catch {
    // keep the previous copy
  }
}

export function clampEstimateTotalRailPosition(
  pos: EstimateTotalRailPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  margin = ESTIMATE_TOTAL_RAIL_POS_MARGIN,
): EstimateTotalRailPosition {
  const maxLeft = Math.max(margin, viewport.width - size.width - margin);
  const maxTop = Math.max(margin, viewport.height - size.height - margin);
  return {
    left: Math.min(maxLeft, Math.max(margin, pos.left)),
    top: Math.min(maxTop, Math.max(margin, pos.top)),
  };
}
