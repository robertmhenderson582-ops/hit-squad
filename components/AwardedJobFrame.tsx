"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { useDeskBoard } from "@/components/useDeskBoard";
import { awardedBoardJobs, awardedLocalJobs, mergeAwardedJobs, type AwardedJobPick } from "@/lib/quality-hse-modules";

export function AwardedJobFrame({
  label,
  empty,
  children,
}: {
  label: string;
  empty?: ReactNode;
  children: (job: AwardedJobPick) => ReactNode;
}) {
  const { board } = useDeskBoard();
  const jobs = useMemo(
    () =>
      mergeAwardedJobs(
        awardedLocalJobs(),
        awardedBoardJobs(board?.estimates ?? [], board?.sites ?? []),
      ),
    [board],
  );
  const [picked, setPicked] = useState("");
  const job = jobs.find((row) => row.id === picked) ?? null;

  return (
    <div className="space-y-4">
      <label className="block max-w-xl text-sm">
        <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{label}</span>
        <select
          className="paper-field mt-1"
          value={picked}
          onChange={(event) => setPicked(event.target.value)}
        >
          <option value="">Awarded job</option>
          {jobs.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title}
              {row.site ? ` · ${row.site}` : ""}
            </option>
          ))}
        </select>
      </label>
      {job ? <EstimatePackageProvider estimateKey={job.key}>{children(job)}</EstimatePackageProvider> : empty}
    </div>
  );
}
