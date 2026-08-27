"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { JobHandoffMark } from "@/components/JobHandoffMark";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useDisplay } from "@/components/DisplayProvider";
import { jobLooksClosed, readClosed } from "@/lib/desk-closeout";
import { estimateForJob, estimateHref } from "@/lib/estimate-open";
import { localPacksForUser } from "@/lib/estimate-scope";
import { deskFetch, flushLocalPacksToVault, hydrateFromVault } from "@/lib/estimate-vault-client";
import { isActiveMenuItem, menuForViewedDesk, menuStatus } from "@/lib/job-menu";
import { jobPlantHref, plantJobTally, plantJobsLine } from "@/lib/jobs";
import { listLocalPacks, mergeLocalJobs } from "@/lib/local-estimates";
import type { JobRecord } from "@/lib/types";

export function JobsDesk() {
  const alias = useAlias();
  const { lens, seat, viewingAs, lensReady } = useDeskLens();
  const router = useRouter();
  const { board } = useDeskBoard();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const estimates = board?.estimates ?? [];
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!lensReady || !lens) return;
    await hydrateFromVault(undefined, { viewAs: seat });
    await flushLocalPacksToVault();
    const response = await deskFetch("/api/desk/jobs");
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Jobs stayed on this desk.");
      return;
    }
    const packs = localPacksForUser(lens, listLocalPacks()).filter((pack) => !viewingAs || !pack.archived);
    setJobs(mergeLocalJobs((data.desk.jobs as JobRecord[]) ?? [], packs));
  }, [lens, lensReady, seat, viewingAs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, tick]);

  const menu = menuForViewedDesk(viewingAs);
  const closed = readClosed();
  const deskPacks = lens ? localPacksForUser(lens, listLocalPacks()) : [];
  const active = jobs.filter((job) => isActiveMenuItem(job, menu) && !jobLooksClosed(job, closed));
  const archived = jobs.filter((job) => menuStatus(job, menu) === "archived");
  const transferred = menu.transferred;

  function go(href: string, event?: { preventDefault: () => void; stopPropagation: () => void }) {
    event?.preventDefault();
    event?.stopPropagation();
    router.push(href);
  }

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-4 rounded-sm px-4 py-5 sm:-mx-4 sm:px-6`}>
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {plantJobsLine(plantJobTally(active))} Open a job to keep its ID, window, and working figure. {alias("WOOD RIVER")} opens the
        plant with that job still showing. Archive hides a job. Delete removes your copy after you confirm.
      </p>
      {error ? <p className="text-amber-flare">{error}</p> : null}
      {active.map((job) => {
        const estimate = estimateForJob(job, estimates);
        const plantHref = jobPlantHref(job.code);
        const estimatesHref = estimate ? estimateHref(estimate.id) : jobPlantHref(job.code, "Estimates");
        return (
          <article
            key={job.id}
            className="site-plate plant-card estimate-card mt-4 cursor-pointer px-4 py-5"
            role="link"
            tabIndex={0}
            onClick={() => router.push(plantHref)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(plantHref);
              }
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-xs text-steel">{job.code}</p>
              <StatusStamp value={job.status} />
            </div>
            <h2 className="mt-1 font-display text-2xl tracking-wide">{alias(job.title)}</h2>
            <JobHandoffMark
              pack={deskPacks.find((pack) => pack.packId === estimate?.id || `job-${pack.packId}` === job.id)}
              email={lens?.email}
            />
            <p className="mt-2 text-sm text-[#5b6f73]">
              {alias(job.client)} · {job.discipline} · {job.kind.toUpperCase()}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WINDOW</dt>
                <dd className="mt-1 font-mono text-xs">{job.window}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING FIGURE</dt>
                <dd className="mt-1 font-mono text-xs text-amber-label">{job.workingFigure}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">HSE</dt>
                <dd className="mt-1 font-mono text-xs">{job.hseNote}</dd>
              </div>
            </dl>
            <div
              className="relative z-20 mt-4 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.16em]"
              onClick={(event) => event.stopPropagation()}
            >
              <Link href={plantHref} className="job-action" onClick={(event) => go(plantHref, event)}>
                {alias("WOOD RIVER")}
              </Link>
              <Link href={estimatesHref} className="job-action" onClick={(event) => go(estimatesHref, event)}>
                ESTIMATES
              </Link>
              <Link href="/cost" className="job-action" onClick={(event) => go("/cost", event)}>
                COST
              </Link>
            </div>
            <div className="relative z-20 mt-3" onClick={(event) => event.stopPropagation()}>
              <JobMenuActions
                id={job.id}
                title={job.title}
                packId={estimate?.id}
                onChange={() => setTick((value) => value + 1)}
              />
            </div>
          </article>
        );
      })}
      {archived.length ? (
        <details className="plant-card mt-6 px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Archived</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {archived.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {job.code} · {alias(job.title)}
                </span>
                <JobMenuActions
                  id={job.id}
                  title={job.title}
                  packId={estimateForJob(job, estimates)?.id}
                  archived
                  onChange={() => setTick((value) => value + 1)}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {transferred.length ? (
        <details className="plant-card mt-4 px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Transferred</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {transferred.map((row) => (
              <li key={`${row.id}-${row.at}`}>
                {row.title} · turned over to {row.toName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
