"use client";

import { useEffect, useState } from "react";
import type { JobRecord } from "@/lib/types";

export function JobList({ kind }: { kind?: JobRecord["kind"] }) {
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
        setError(data.error || "Records stayed on this desk.");
        return;
      }
      const all = (data.desk.jobs as JobRecord[]) ?? [];
      setJobs(kind ? all.filter((job) => job.kind === kind) : all);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (error) {
    return <p className="mt-6 text-amber-label">{error}</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {jobs.map((job) => (
        <article key={job.id} className="steel-plate paper-grain px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-xs text-amber-label">{job.code}</p>
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">{job.status}</p>
          </div>
          <h2 className="mt-1 font-display text-2xl tracking-wide">{job.title}</h2>
          <p className="mt-2 text-sm text-paper-cream/80">
            {job.client} · {job.window} · {job.workingFigure}
          </p>
          <p className="mt-2 font-mono text-xs text-steel-glow">{job.hseNote}</p>
        </article>
      ))}
      {jobs.length === 0 ? (
        <p className="font-mono text-sm text-paper-cream/70">No tickets on this rail for this desk.</p>
      ) : null}
    </div>
  );
}
