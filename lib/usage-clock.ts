/** Owner-entered Cursor / agent usage clock. Never invent live spend metering. */

export const DEFAULT_HIGH_USAGE_THRESHOLD = 70;

export const HIGH_USAGE_NOTE_TITLE = "Usage clock";

export const HIGH_USAGE_NOTE_BODY =
  "Agent and Cursor work share one clock. When it is high, new builds and ideas may slow so a reserve stays for must-need emergency fixes. This is not a failure of the desk.";

export type UsageClockInput = {
  showHighUsageNote?: boolean | null;
  usagePercent?: number | null;
  highUsageThreshold?: number | null;
};

export function parseUsagePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseUsageThreshold(value: unknown): number {
  const n = parseUsagePercent(value);
  return n == null ? DEFAULT_HIGH_USAGE_THRESHOLD : n;
}

/** High when Owner flips the flag, or enters a % at/above the threshold. Unset is not high. */
export function isHighUsageClock(input?: UsageClockInput | null): boolean {
  if (!input) return false;
  if (input.showHighUsageNote === true) return true;
  const percent = parseUsagePercent(input.usagePercent);
  if (percent == null) return false;
  return percent >= parseUsageThreshold(input.highUsageThreshold);
}

export function highUsageNotePercentLine(percent: unknown): string | null {
  const n = parseUsagePercent(percent);
  if (n == null) return null;
  return `Owner marks the clock at ${n}%.`;
}
