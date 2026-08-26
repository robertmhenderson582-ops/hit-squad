import { boardForUser } from "./desk-data.ts";
import type { DeskBoard, JobRecord } from "./types.ts";

const JOBS: JobRecord[] = [];

export const PLANT_TABS = ["Overview", "Estimates", "Change orders", "People"] as const;
export type PlantTab = (typeof PLANT_TABS)[number];

export function jobByCode(code: string | null | undefined): JobRecord | undefined {
  if (!code) return undefined;
  const needle = code.trim().toLowerCase();
  return JOBS.find((job) => job.code.toLowerCase() === needle);
}

export function plantJobTally(jobs: JobRecord[] = JOBS) {
  return {
    total: jobs.length,
    open: jobs.filter((job) => job.status === "OPEN").length,
    hold: jobs.filter((job) => job.status === "HOLD").length,
    estimates: jobs.filter((job) => job.kind !== "hse").length,
    hse: jobs.filter((job) => job.kind === "hse").length,
  };
}

export function plantJobsLine(tally = plantJobTally()) {
  const holdBit = tally.hold ? `, ${tally.hold} hold` : "";
  return `${tally.total} jobs on this plant (${tally.open} open${holdBit}). ${tally.estimates} estimates. HSE walkdown is a job, not an estimate.`;
}

export function plantTabFromQuery(value: string | null | undefined): PlantTab {
  const key = (value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "estimates") return "Estimates";
  if (key === "change-orders" || key === "changeorders") return "Change orders";
  if (key === "people") return "People";
  return "Overview";
}

export function plantTabQuery(tab: PlantTab) {
  if (tab === "Overview") return null;
  if (tab === "Change orders") return "change-orders";
  return tab.toLowerCase();
}

export function jobPlantHref(code: string, tab?: PlantTab | string | null) {
  const params = new URLSearchParams({ job: code });
  const next = tab
    ? PLANT_TABS.includes(tab as PlantTab)
      ? (tab as PlantTab)
      : plantTabFromQuery(tab)
    : undefined;
  const query = next ? plantTabQuery(next) : null;
  if (query) params.set("tab", query);
  return `/jobs/wood-river?${params.toString()}`;
}

export function deskForUser(userId: string): DeskBoard {
  const jobs = JOBS.filter((job) => job.ownerId === userId);
  return {
    jobs,
    estimatesOpen: boardForUser(userId).estimates.length,
    costTickets: jobs.filter((job) => job.kind === "t&m" || job.kind === "outage").length,
    hseOpen: jobs.filter((job) => job.kind === "hse" || job.hseNote.toLowerCase().includes("open")).length,
  };
}

export function jobsForUser(userId: string, kind?: JobRecord["kind"]): JobRecord[] {
  return deskForUser(userId).jobs.filter((job) => (kind ? job.kind === kind : true));
}
