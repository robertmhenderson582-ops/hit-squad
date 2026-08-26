import { boardForUser } from "./desk-data.ts";
import type { DeskBoard, JobRecord } from "./types.ts";

const JOBS: JobRecord[] = [
  {
    id: "job-8841",
    ownerId: "owner-robert-henderson",
    code: "TA-8841",
    title: "Unit 3 turnaround — mechanical T&M",
    client: "Madison / P66",
    discipline: "mechanical",
    kind: "outage",
    status: "OPEN",
    window: "12 Sep → 04 Oct 2026",
    workingFigure: "$2.41M working",
    hseNote: "Permits current · gas test AM",
  },
  {
    id: "job-8902",
    ownerId: "owner-robert-henderson",
    code: "TM-8902",
    title: "Coker drum valve package — time & material",
    client: "Madison / P66",
    discipline: "mechanical",
    kind: "t&m",
    status: "OPEN",
    window: "Night shift window",
    workingFigure: "$186k accrued",
    hseNote: "Hot work in force",
  },
  {
    id: "job-8710",
    ownerId: "owner-robert-henderson",
    code: "ES-8710",
    title: "Cooling-tower basin repair estimate",
    client: "Confidential contractor",
    discipline: "civil",
    kind: "estimate",
    status: "HOLD",
    window: "Quote due Friday",
    workingFigure: "$410k draft",
    hseNote: "Confined space plan pending",
  },
  {
    id: "job-8622",
    ownerId: "owner-robert-henderson",
    code: "HS-8622",
    title: "Pre-outage HSE walkdown — flare / piperack",
    client: "Madison / P66",
    discipline: "hse",
    kind: "hse",
    status: "OPEN",
    window: "This week",
    workingFigure: "No cost ticket",
    hseNote: "3 actions still open",
  },
];

export const PLANT_TABS = ["Overview", "Estimates", "Change orders", "People"] as const;
export type PlantTab = (typeof PLANT_TABS)[number];

export function jobByCode(code: string | null | undefined, extras: JobRecord[] = []): JobRecord | undefined {
  if (!code) return undefined;
  const needle = code.trim().toLowerCase();
  return [...JOBS, ...extras].find((job) => job.code.toLowerCase() === needle);
}

export function seedJobs(): JobRecord[] {
  return JOBS;
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
