export const ESTIMATE_STATUSES = [
  "Draft",
  "In progress",
  "Budgetary",
  "Review",
  "Locked",
  "Submitted",
  "Awarded",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const DEFAULT_ESTIMATE_STATUS: EstimateStatus = "Draft";
export const LEGACY_ESTIMATE_STATUS = "Estimate";
export const ESTIMATE_STATUS_GATE = ["Locked", "Submitted", "Awarded"] as const;
export type EstimateStatusGate = (typeof ESTIMATE_STATUS_GATE)[number];

export const ESTIMATE_STATUS_PREFIX = "hs_estimate_status_v1:";

export function isEstimateStatus(value: unknown): value is EstimateStatus {
  return ESTIMATE_STATUSES.includes(value as EstimateStatus);
}

export function isEstimateStatusGate(value: unknown): value is EstimateStatusGate {
  return ESTIMATE_STATUS_GATE.includes(value as EstimateStatusGate);
}

/** Stamp + desk signal. This pass does not invent an edit-block. */
export function isEstimateLocked(status: EstimateStatus | string | undefined) {
  return status === "Locked";
}

export function parseEstimateStatus(
  value: unknown,
  fallback: EstimateStatus = DEFAULT_ESTIMATE_STATUS,
): EstimateStatus {
  if (value === LEGACY_ESTIMATE_STATUS) return "Draft";
  return isEstimateStatus(value) ? value : fallback;
}

/** Full list today. Site Regular-client lanes can narrow this later — do not hardcode plants. */
export function statusOptionsForSite(_site = ""): readonly EstimateStatus[] {
  void _site;
  return ESTIMATE_STATUSES;
}

export function statusStoreKey(estimateId: string) {
  return `${ESTIMATE_STATUS_PREFIX}${estimateId}`;
}

export function readEstimateStatus(estimateId: string, store?: Storage | null): EstimateStatus {
  if (!estimateId) return DEFAULT_ESTIMATE_STATUS;
  const storage = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!storage) return DEFAULT_ESTIMATE_STATUS;
  try {
    return parseEstimateStatus(storage.getItem(statusStoreKey(estimateId)));
  } catch {
    return DEFAULT_ESTIMATE_STATUS;
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

/** Pack snapshot wins. localStorage mirrors for paint / Awarded lists only. */
export function resolveEstimateStatus(
  packStatus: unknown,
  estimateId = "",
  store?: Storage | null,
): EstimateStatus {
  if (packStatus != null && String(packStatus).trim() !== "") {
    return parseEstimateStatus(packStatus);
  }
  return readEstimateStatus(estimateId, store);
}

/** Confirm into or out of Locked / Submitted / Awarded. Draft → In progress does not confirm. */
export function needsStatusConfirm(from: EstimateStatus, to: EstimateStatus) {
  if (from === to) return false;
  return isEstimateStatusGate(from) || isEstimateStatusGate(to);
}

export function statusConfirmCopy(from: EstimateStatus, to: EstimateStatus) {
  return `Move this job from ${from} to ${to}?`;
}

/** PM+ for Locked / Submitted / Awarded. Everyday Draft → In progress stays open. */
export function statusNeedsManager(from: EstimateStatus, to: EstimateStatus) {
  if (from === to) return false;
  return isEstimateStatusGate(from) || isEstimateStatusGate(to);
}
