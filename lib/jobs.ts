import { aliasJobs } from "@/lib/aliases";
import { findSeatByUserId } from "@/lib/seats";
import type { DeskBoard, JobRecord, PublicUser } from "@/lib/types";

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

function summarize(jobs: JobRecord[]): DeskBoard {
  return {
    jobs,
    estimatesOpen: jobs.filter((job) => job.kind === "estimate" || job.status !== "CLOSED").length,
    costTickets: jobs.filter((job) => job.kind === "t&m" || job.kind === "outage").length,
    hseOpen: jobs.filter((job) => job.kind === "hse" || job.hseNote.toLowerCase().includes("open")).length,
  };
}

export function deskForViewer(user: PublicUser): DeskBoard {
  const seat = findSeatByUserId(user.id);
  if (user.role !== "owner" && !seat) return summarize([]);

  let jobs = JOBS;
  if (!user.can.jobs && !user.can.estimates) jobs = [];
  if (!user.can.hse) jobs = jobs.filter((job) => job.kind !== "hse");
  if (user.aliasPlants) jobs = aliasJobs(jobs);
  return summarize(jobs);
}

export function deskForUser(userId: string): DeskBoard {
  const jobs = JOBS.filter((job) => job.ownerId === userId);
  return summarize(jobs);
}

export function jobsForUser(userId: string, kind?: JobRecord["kind"]): JobRecord[] {
  return deskForUser(userId).jobs.filter((job) => (kind ? job.kind === kind : true));
}
