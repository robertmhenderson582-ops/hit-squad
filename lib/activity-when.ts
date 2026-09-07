/** US desk clock for Activity log WHEN / through dates. */
export const ACTIVITY_WHEN_TZ = "America/Chicago";

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** mm/dd/yyyy in America/Chicago. Clock stays 24-hour so WHEN still shows the minute. */
export function formatActivityWhen(at: number): string {
  if (!Number.isFinite(at)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACTIVITY_WHEN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  return `${part(parts, "month")}/${part(parts, "day")}/${part(parts, "year")}, ${part(parts, "hour")}:${part(parts, "minute")}:${part(parts, "second")}`;
}
