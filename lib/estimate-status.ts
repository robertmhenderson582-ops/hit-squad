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

export function readEstimateStatus(estimateId: string, store?: Storage | null): EstimateStatus {
  if (!estimateId) return "Estimate";
  const storage = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!storage) return "Estimate";
  try {
    return parseEstimateStatus(storage.getItem(statusStoreKey(estimateId)));
  } catch {
    return "Estimate";
  }
}

export function writeEstimateStatus(estimateId: string, status: EstimateStatus, store?: Storage | null) {
  if (!estimateId || !isEstimateStatus(status)) return;
  const storage = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!storage) return;
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
