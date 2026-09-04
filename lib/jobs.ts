import { catalogVisibleTo, type CompanyScope } from "./companies.ts";
import { dummyPacksForUser } from "./cbi-dummy.ts";
import { boardForUser } from "./desk-data.ts";
import { ownerKeepsHisMenuPaint } from "./his-wood-river.ts";
import { isOwnerIdentity } from "./identity.ts";
import { mergeLocalJobs, type LocalPack } from "./local-estimates.ts";
import { omitDeletedJobs, type JobMenuState } from "./job-menu.ts";
import { JOHN_BEECH_EMAIL } from "./tester-seats.ts";
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

export const CATALOG_SEED_CODES = JOBS.map((job) => job.code);

export function visibleSeedJobs(scope?: CompanyScope | null): JobRecord[] {
  return seedJobs().filter((job) => catalogVisibleTo(scope, job.client, job.title, job.code));
}

/** Sample catalog jobs stay on testers who are supposed to have samples. Unknown seat → no seeds. */
export function seedJobsAllowed(scope?: CompanyScope | null) {
  const email = scope?.email?.trim().toLowerCase();
  if (!email) return false;
  if (scope?.isOwner || isOwnerIdentity(email)) return false;
  return email !== "nathanboyte@gmail.com" && email !== JOHN_BEECH_EMAIL;
}

function normSeedText(value = "") {
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isCatalogSeedJob(job: Pick<JobRecord, "id" | "code" | "title">) {
  const code = (job.code || "").trim().toUpperCase();
  const title = normSeedText(job.title);
  const id = (job.id || "").trim();
  return seedJobs().some((seed) => {
    const seedCode = seed.code.toUpperCase();
    return (
      seed.id === id ||
      (id && (id === seed.code || id === `job-${seed.code}` || id === seedCode)) ||
      (code && (code === seedCode || code === seed.id.toUpperCase())) ||
      (title && title === normSeedText(seed.title))
    );
  });
}

export function isCatalogSeedPack(pack: Pick<LocalPack, "packId" | "title"> & { code?: string }) {
  const packId = (pack.packId || "").trim();
  return isCatalogSeedJob({
    id: packId.startsWith("job-") ? packId : `job-${packId}`,
    code: pack.code || packId,
    title: pack.title,
  });
}

export function omitCatalogSeedJobs<T extends Pick<JobRecord, "id" | "code" | "title">>(jobs: T[] | undefined | null): T[] {
  return (jobs ?? []).filter((job) => !isCatalogSeedJob(job));
}

export function omitCatalogSeedPacks<T extends Pick<LocalPack, "packId" | "title">>(packs: T[] | undefined | null): T[] {
  return (packs ?? []).filter((pack) => !isCatalogSeedPack(pack));
}

/** View as Nathan / owner leftover / missing seat never paint catalog samples. */
export function catalogSeedsAllowedOnDesk(scope?: CompanyScope | null, seat?: string | null) {
  const id = (seat || "").trim().toLowerCase();
  if (id === "nathan" || id === "john") return false;
  return seedJobsAllowed(scope);
}

/** Owner/Sites seed jobs stay on the signed-in desk. Follow / View as uses that person's packs only. */
export function packForJob<T extends { packId: string }>(
  job: { id: string },
  packs: T[],
  estimateId?: string,
): T | undefined {
  return packs.find((pack) => job.id === `job-${pack.packId}` || (estimateId ? pack.packId === estimateId : false));
}

export function jobsOnDesk(
  serverJobs: JobRecord[] | undefined,
  packs: LocalPack[],
  viewingAs: boolean,
  scope?: CompanyScope | null,
  menu?: JobMenuState | null,
  opts?: { includeSeeds?: boolean; seat?: string | null },
) {
  const allowed = catalogSeedsAllowedOnDesk(scope, opts?.seat);
  // Missing scope, View as Nathan, and protected seats never merge catalog samples.
  const includeSeeds = allowed && opts?.includeSeeds === true;
  const fromServer = includeSeeds ? (serverJobs ?? []) : omitCatalogSeedJobs(serverJobs);
  const nextPacks = omitCatalogSeedPacks([
    ...packs,
    ...dummyPacksForUser(scope).filter((pack) => !packs.some((row) => row.packId === pack.packId)),
  ]);
  const merged = includeSeeds
    ? (() => {
        const seeds = visibleSeedJobs(scope);
        const seen = new Set(fromServer.map((job) => job.id));
        return mergeLocalJobs([...seeds.filter((job) => !seen.has(job.id)), ...fromServer], nextPacks);
      })()
    : mergeLocalJobs(fromServer, nextPacks);
  const painted = includeSeeds ? merged : omitCatalogSeedJobs(merged);
  const keepHis = ownerKeepsHisMenuPaint(
    scope ? { email: scope.email, role: scope.isOwner ? "owner" : undefined } : null,
    viewingAs,
  );
  return menu ? omitDeletedJobs(painted, menu, keepHis) : painted;
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

export function deskForUser(userId: string, scope?: CompanyScope | null): DeskBoard {
  const jobs = !seedJobsAllowed(scope)
    ? []
    : userId === "owner-robert-henderson" || scope?.isOwner
      ? JOBS
      : visibleSeedJobs(scope);
  return {
    jobs,
    estimatesOpen: boardForUser(userId, scope).estimates.length,
    costTickets: jobs.filter((job) => job.kind === "t&m" || job.kind === "outage").length,
    hseOpen: jobs.filter((job) => job.kind === "hse" || job.hseNote.toLowerCase().includes("open")).length,
  };
}

export function jobsForUser(userId: string, kind?: JobRecord["kind"]): JobRecord[] {
  return deskForUser(userId).jobs.filter((job) => (kind ? job.kind === kind : true));
}
