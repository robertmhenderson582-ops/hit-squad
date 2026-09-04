export const ESTIMATE_STATUSES = ["Estimate", "Submitted", "Awarded"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const ESTIMATE_STATUS_PREFIX = "hs_estimate_status_v1:";

export function isEstimateStatus(value: unknown): value is EstimateStatus {
  return ESTIMATE_STATUSES.includes(value as EstimateStatus);
}

export function parseEstimateStatus(value: unknown, fallback: EstimateStatus = "Estimate"): EstimateStatus {
  return isEstimateStatus(value) ? value : fallback;
}

export function statusStoreKey(estimateId: string) {
  return `${ESTIMATE_STATUS_PREFIX}${estimateId}`;
}

type StatusStore = { getItem(key: string): string | null; setItem?(key: string, value: string): void } | null;

export function readEstimateStatus(estimateId: string, store?: StatusStore): EstimateStatus {
  if (!estimateId) return "Estimate";
  const storage = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!storage) return "Estimate";
  try {
    return parseEstimateStatus(storage.getItem(statusStoreKey(estimateId)));
  } catch {
    return "Estimate";
  }
}

export function writeEstimateStatus(estimateId: string, status: EstimateStatus, store?: StatusStore) {
  if (!estimateId || !isEstimateStatus(status)) return;
  const storage = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!storage?.setItem) return;
  try {
    storage.setItem(statusStoreKey(estimateId), status);
  } catch {
    // keep the previous copy
  }
}

/** Adjacent Estimate ↔ Submitted and Submitted ↔ Awarded, both directions. Same confirm going reverse. */
export function needsStatusConfirm(from: EstimateStatus, to: EstimateStatus) {
  if (from === to) return false;
  const pair = [from, to].sort().join("|");
  return pair === "Estimate|Submitted" || pair === "Awarded|Submitted" || pair === "Awarded|Estimate";
}

export function statusConfirmCopy(from: EstimateStatus, to: EstimateStatus) {
  return `Move this job from ${from} to ${to}?`;
}

function statusIdsForItem(item?: { id?: string; packId?: string } | null): string[] {
  if (!item) return [];
  const ids = [item.packId, item.id];
  if (item.id?.startsWith("job-")) ids.push(item.id.slice(4));
  if (item.packId && !item.packId.startsWith("job-")) ids.push(`job-${item.packId}`);
  return [...new Set(ids.filter((id): id is string => Boolean(id && id.trim())))];
}

/** Awarded jobs may archive. They cannot be hard-deleted from any seat. */
export function isAwardedEstimate(item?: { id?: string; packId?: string } | null, store?: StatusStore) {
  return statusIdsForItem(item).some((id) => readEstimateStatus(id, store) === "Awarded");
}

export function canHardDeleteEstimate(item?: { id?: string; packId?: string } | null, store?: StatusStore) {
  return !isAwardedEstimate(item, store);
}
