"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { jobLooksClosed, readClosed } from "@/lib/desk-closeout";
import type { JobRecord } from "@/lib/types";

export function JobsDesk() {
  const alias = useAlias();
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

  return (
    <div className="mt-4 space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Outage and T&amp;M jobs loaded for this owner. Open Wood River for Overview / Estimates /
        Change orders / People.
      </p>
      {error ? <p className="text-amber-flare">{error}</p> : null}
      {jobs.map((job) => (
        <article key={job.id} className="plant-card px-4 py-5">
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
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.16em]">
            <Link href="/jobs/wood-river" className="border border-steel px-3 py-2 text-steel">
              WOOD RIVER
            </Link>
            <Link href="/estimates" className="border border-steel px-3 py-2 text-steel">
              ESTIMATES
            </Link>
            <Link href="/cost" className="border border-steel px-3 py-2 text-steel">
              COST
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
