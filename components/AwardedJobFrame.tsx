"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { useDeskBoard } from "@/components/useDeskBoard";
import {
  OPEN_JOB_EMPTY_COPY,
  dropClosedJobs,
  mergeOpenJobs,
  openBoardJobs,
  openLocalJobs,
  pickOpenJob,
  type JobPick,
} from "@/lib/quality-hse-modules";

export function OpenJobFrame({
  label = "JOB",
  empty,
  children,
}: {
  label?: string;
  empty?: ReactNode;
  children: (job: JobPick) => ReactNode;
}) {
  const { board } = useDeskBoard();
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    setReady(true);
  }, []);
  const jobs = useMemo(
    () =>
      ready
        ? dropClosedJobs(
            mergeOpenJobs(
              openLocalJobs(),
              openBoardJobs(board?.estimates ?? [], board?.sites ?? []),
            ),
          )
        : [],
    [board, ready],
  );
  const job = pickOpenJob(jobs, picked);

  return (
    <div className="space-y-4">
      <label className="block max-w-xl text-sm">
        <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{label}</span>
        <select
          className="paper-field mt-1"
          value={job?.id ?? ""}
          onChange={(event) => setPicked(event.target.value)}
        >
          {jobs.length === 0 ? <option value="">Job</option> : null}
          {jobs.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title}
              {row.site ? ` · ${row.site}` : ""}
            </option>
          ))}
        </select>
      </label>
      {job ? (
        <EstimatePackageProvider estimateKey={job.key}>{children(job)}</EstimatePackageProvider>
      ) : ready ? (
        (empty ?? <p className="text-sm text-[#5b6f73]">{OPEN_JOB_EMPTY_COPY}</p>)
      ) : null}
    </div>
  );
}

/** @deprecated Use OpenJobFrame — Quality/HSE no longer wait for Awarded. */
export const AwardedJobFrame = OpenJobFrame;
