"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusStamp } from "@/components/StatusStamp";
import type { JobRecord } from "@/lib/types";

export function JobsDesk() {
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
      setJobs((data.desk.jobs as JobRecord[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-4 space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Outage and T&amp;M jobs loaded for this owner. Open a package on Estimates, Cost, or HSE
        from the same blotter.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      {jobs.map((job) => (
        <article key={job.id} className="steel-plate paper-grain px-4 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-xs text-amber-label">{job.code}</p>
            <StatusStamp value={job.status} />
          </div>
          <h2 className="mt-1 font-display text-2xl tracking-wide">{job.title}</h2>
          <p className="mt-2 text-sm text-paper-cream/80">
            {job.client} · {job.discipline} · {job.kind.toUpperCase()}
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
            <Link href="/estimates" className="border border-steel-rim/40 px-3 py-2 text-paper-cream/90">
              ESTIMATES
            </Link>
            <Link href="/cost" className="border border-steel-rim/40 px-3 py-2 text-paper-cream/90">
              COST
            </Link>
            <Link href="/hse" className="border border-steel-rim/40 px-3 py-2 text-paper-cream/90">
              HSE
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
