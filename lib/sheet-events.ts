export const ESTIMATE_SHEETS_EVENT = "hs-estimate-sheets";

export function notifyEstimateSheets() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ESTIMATE_SHEETS_EVENT));
}

export function onEstimateSheets(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ESTIMATE_SHEETS_EVENT, fn);
  return () => window.removeEventListener(ESTIMATE_SHEETS_EVENT, fn);
}
