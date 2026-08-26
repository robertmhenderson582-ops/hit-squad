"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useSeatEstimates } from "@/components/useSeatEstimates";
import { useDisplay } from "@/components/DisplayProvider";
import { jobLooksClosed, readClosed } from "@/lib/desk-closeout";
import { estimateForJob, estimateHref } from "@/lib/estimate-open";
import { jobPlantHref, plantJobsLine } from "@/lib/jobs";
import type { JobRecord } from "@/lib/types";

export function JobsDesk() {
  const alias = useAlias();
  const router = useRouter();
  const { records: estimates } = useSeatEstimates();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/desk/jobs", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Jobs stayed on this desk.");
        return;
      }
      setJobs(((data.desk.jobs as JobRecord[]) ?? []).filter((job) => !jobLooksClosed(job, readClosed())));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function go(href: string, event?: { preventDefault: () => void; stopPropagation: () => void }) {
    event?.preventDefault();
    event?.stopPropagation();
    router.push(href);
  }

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-4 rounded-sm px-4 py-5 sm:-mx-4 sm:px-6`}>
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {plantJobsLine()} Open a job to keep its ID, window, and working figure. {alias("WOOD RIVER")} opens the
        plant with that job still showing.
      </p>
      {error ? <p className="text-amber-flare">{error}</p> : null}
      {jobs.length === 0 ? (
        <p className="mt-4 text-sm text-[#5b6f73]">No jobs on this desk yet. A job you create keeps its ID.</p>
      ) : null}
      {jobs.map((job) => {
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
          </article>
        );
      })}
    </div>
  );
}
