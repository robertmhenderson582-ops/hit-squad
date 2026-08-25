import type { ForgebookBoard, JobRecord } from "@/lib/types";

const REPLACEMENTS: [RegExp, string][] = [
  [/phillips\s*66/gi, "Client West"],
  [/\bP66\b/gi, "Client West"],
  [/georgia power/gi, "Client South"],
  [/madison/gi, "Shop North"],
  [/wood river/gi, "Plant WR"],
  [/roxana/gi, "North yard"],
  [/rodeo/gi, "Plant RD"],
  [/bayway/gi, "Plant BW"],
  [/linden/gi, "East yard"],
  [/ferndale/gi, "Plant FD"],
  [/billings/gi, "Plant BL"],
  [/yates/gi, "Plant YT"],
  [/newnan/gi, "South yard"],
];

export function aliasText(value: string): string {
  return REPLACEMENTS.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value);
}

function aliasValue<T>(value: T): T {
  if (typeof value === "string") return aliasText(value) as T;
  if (Array.isArray(value)) return value.map((item) => aliasValue(item)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) next[key] = aliasValue(item);
    return next as T;
  }
  return value;
}

export function aliasJobs(jobs: JobRecord[]): JobRecord[] {
  return aliasValue(jobs);
}

export function aliasBoard(board: ForgebookBoard): ForgebookBoard {
  return aliasValue(board);
}
