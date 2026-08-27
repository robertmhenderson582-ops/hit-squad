"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EstimateCard } from "@/components/EstimateCard";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useDisplay } from "@/components/DisplayProvider";
import { estimateForJob, estimateHref, estimatesForPlant } from "@/lib/estimate-open";
import { readClosed } from "@/lib/desk-closeout";
import { ChangeOrderDesk } from "@/components/ChangeOrderDesk";
import { StatusStamp } from "@/components/StatusStamp";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { localPacksForUser } from "@/lib/estimate-scope";
import { VIEW_RESPONSIBILITIES, VISUAL_ROSTER } from "@/lib/owner-desk";
import { boundOtLabel, siteClockFromText } from "@/lib/hours-clock";
import { jobByCode, plantJobTally, plantJobsLine, plantTabFromQuery, plantTabQuery, seedJobs, type PlantTab } from "@/lib/jobs";
import { listLocalPacks, localPackToJob } from "@/lib/local-estimates";

const PLANTS: Record<string, { client: string; folder: string; name: string; city: string; plant: string; site: string }> = {
  "wood-river": {
    client: "MADISON · PHILLIPS 66",
    folder: "Phillips 66",
    name: "Wood River",
    city: "Roxana, IL",
    plant: "Wood River Refinery, Roxana, IL",
    site: "Wood River — Roxana, IL",
  },
  yates: {
    client: "MADISON · GEORGIA POWER",
    folder: "Georgia Power",
    name: "Yates",
    city: "Newnan, GA",
    plant: "Yates generating station",
    site: "Yates — Newnan, GA",
  },
  rodeo: {
    client: "MADISON · PHILLIPS 66",
    folder: "Phillips 66",
    name: "Rodeo",
    city: "Rodeo, CA",
    plant: "Rodeo refinery",
    site: "Rodeo — Rodeo, CA",
  },
  bayway: {
    client: "MADISON · PHILLIPS 66",
    folder: "Phillips 66",
    name: "Bayway",
    city: "Linden, NJ",
    plant: "Bayway refinery",
    site: "Bayway — Linden, NJ",
  },
  ferndale: {
    client: "MADISON · PHILLIPS 66",
    folder: "Phillips 66",
    name: "Ferndale",
    city: "Ferndale, WA",
    plant: "Ferndale refinery",
    site: "Ferndale — Ferndale, WA",
  },
  billings: {
    client: "MADISON · PHILLIPS 66",
    folder: "Phillips 66",
    name: "Billings",
    city: "Billings, MT",
    plant: "Billings refinery",
    site: "Billings — Billings, MT",
  },
};

const TABS = ["Overview", "Estimates", "Change orders", "People"] as const;

export function JobPlantPage({ slug }: { slug: string }) {
  const plant = PLANTS[slug] ?? PLANTS["wood-river"];
  const { openNewEstimate } = useEstimateModal();
  const alias = useAlias();
  const { lens, viewingAs, lensKey } = useDeskLens();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const jobCode = searchParams.get("job");
  const tab = plantTabFromQuery(searchParams.get("tab"));
  const { board } = useDeskBoard();
  const [localJobs, setLocalJobs] = useState<ReturnType<typeof localPackToJob>[]>([]);
  useEffect(() => {
    const packs = lens
      ? localPacksForUser(lens, listLocalPacks()).filter((pack) => !viewingAs || !pack.archived)
      : [];
    setLocalJobs(packs.map((pack) => localPackToJob(pack)));
  }, [board, lensKey, viewingAs]);
  const openedJob = jobByCode(jobCode, localJobs);
  const closed = readClosed().filter((item) => item.kind === "estimate").map((item) => item.id);
  const plantEstimates = estimatesForPlant(
    (board?.estimates ?? []).filter((row) => !closed.includes(row.id)),
    board?.sites ?? [],
    plant.name,
    plant.city,
  );
  const tally = plantJobTally([...(viewingAs ? [] : seedJobs()), ...localJobs]);
  const openedEstimate = openedJob ? estimateForJob(openedJob, board?.estimates ?? []) : undefined;

  function setTab(next: PlantTab) {
    const params = new URLSearchParams(searchParams.toString());
    const query = plantTabQuery(next);
    if (query) params.set("tab", query);
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-4 rounded-sm px-4 py-5 sm:-mx-4 sm:px-6`}>
      <p className="text-xs font-semibold tracking-[0.2em] text-[#5b6f73]">{alias(plant.client)}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl font-semibold text-[#163038]">{alias(plant.name)}</h2>
          <p className="mt-1 text-[#5b6f73]">
            {alias(plant.city)} · {alias(plant.plant)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNewEstimate({ client: plant.folder, site: plant.site, size: "outage", knownPlant: true })}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          + New estimate
        </button>
      </div>

      {openedJob ? (
        <article className="site-plate plant-card mt-5 px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-xs text-steel">{openedJob.code}</p>
            <StatusStamp value={openedJob.status} />
          </div>
          <h3 className="mt-1 font-display text-2xl tracking-wide">{alias(openedJob.title)}</h3>
          <p className="mt-2 text-sm text-[#5b6f73]">
            {alias(openedJob.client)} · {openedJob.discipline} · {openedJob.kind.toUpperCase()}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WINDOW</dt>
              <dd className="mt-1 font-mono text-xs">{openedJob.window}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING FIGURE</dt>
              <dd className="mt-1 font-mono text-xs text-amber-label">{openedJob.workingFigure}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">HSE</dt>
              <dd className="mt-1 font-mono text-xs">{openedJob.hseNote}</dd>
            </div>
          </dl>
          {openedEstimate ? (
            <Link href={estimateHref(openedEstimate.id)} className="job-action mt-4 inline-flex">
              Open estimate
            </Link>
          ) : null}
        </article>
      ) : jobCode ? (
        <p className="mt-4 text-sm text-amber-flare">No job on this desk matches {jobCode}.</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-4 py-2 text-sm ${
              tab === item ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <article className="site-plate plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">JOBS ON THIS PLANT</p>
              <p className="mt-2 font-display text-4xl">{tally.total}</p>
              <p className="mt-2 text-sm text-[#5b6f73]">
                {tally.open} open · {tally.hold} hold
              </p>
            </article>
            <article className="site-plate plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">OPEN ESTIMATES</p>
              <p className="mt-2 font-display text-4xl">{plantEstimates.length || "0"}</p>
              <p className="mt-2 text-sm text-[#5b6f73]">HSE walkdown is a job, not an estimate.</p>
            </article>
            <article className="site-plate plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">OT RULE</p>
              <p className="mt-2 font-display text-2xl">{boundOtLabel(plant.name, plant.folder)}</p>
              {siteClockFromText(plant.name, plant.folder) === "east-coast" ? (
                <p className="mt-1 text-xs text-[#5b6f73]">PCA0001103 — never PA or Mid-Atlantic</p>
              ) : null}
            </article>
          </div>
          <p className="mt-5 text-sm text-[#5b6f73]">
            {plantJobsLine(tally)} Start an estimate for this plant with + New estimate. SCRs live on that
            job’s Change orders tab. People assigns who owns change orders, HSE, or quality on{" "}
            {alias(plant.name)}.
          </p>
        </>
      ) : null}

      {tab === "Estimates" ? (
        <div className="mt-6 space-y-4">
          {plantEstimates.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {plantEstimates.map((row) => (
                <EstimateCard key={row.id} estimate={row} />
              ))}
            </div>
          ) : (
            <div className="site-plate plant-card px-5 py-6">
              <p className="text-[#5b6f73]">No open estimates on this plant yet.</p>
            </div>
          )}
        </div>
      ) : null}

      {tab === "Change orders" ? (
        <div className="mt-6">
          <ChangeOrderDesk />
        </div>
      ) : null}

      {tab === "People" ? (
        <section className="site-plate plant-card mt-6 px-5 py-6">
          <h3 className="text-xl font-semibold text-[#163038]">People</h3>
          <p className="mt-2 text-sm text-[#5b6f73]">
            People is not Users. Users is who may sign in. People is who owns change orders, HSE, or
            Quality on {alias(plant.name)}. Testers stay anonymous unless they share this shop. Empty
            until you pick someone — no seeded logins.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {VIEW_RESPONSIBILITIES.map((role) => (
              <label key={role} className="block text-sm">
                {role}
                <select className="paper-field mt-1">
                  <option value="">Not assigned</option>
                  <option value="anonymous">Anonymous (this shop)</option>
                  {VISUAL_ROSTER.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
