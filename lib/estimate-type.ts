export const ESTIMATE_TYPES = ["T&M", "Lump sum", "CR/FF", "Hybrid"] as const;

export type EstimateType = (typeof ESTIMATE_TYPES)[number];

export function isEstimateType(value: unknown): value is EstimateType {
  return typeof value === "string" && (ESTIMATE_TYPES as readonly string[]).includes(value);
}

/** Outage is the job/event, never the contract type. */
export function displayEstimateType(value: unknown): EstimateType {
  if (typeof value !== "string") return "T&M";
  if (/outage/i.test(value)) return "T&M";
  const trimmed = value.replace(/\s*\/\s*T&M/i, "").trim();
  if (isEstimateType(trimmed)) return trimmed;
  if (isEstimateType(value)) return value;
  return "T&M";
}
