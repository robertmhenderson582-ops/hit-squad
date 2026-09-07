"use client";

import { useMemo, useState } from "react";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { PurchasingDesk } from "@/components/PurchasingDesk";
import { useDeskBoard } from "@/components/useDeskBoard";
import { liveCostJobs } from "@/lib/cost-report";
import { estimateStorageKey } from "@/lib/estimate-open";
import { listLocalPacks } from "@/lib/local-estimates";
import { PURCHASING_INTERNAL_NOTE, PURCHASING_LIVE_NOTE, PURCHASING_PARKED } from "@/lib/purchasing";

export function PurchasingModuleDesk() {
  const { board, error } = useDeskBoard();
  const jobs = useMemo(() => {
    const local = listLocalPacks().map((pack) => ({
      packId: pack.packId,
      title: pack.title,
      client: pack.client,
      site: pack.site,
      key: pack.key,
    }));
    const fromBoard = (board?.estimates ?? []).map((row) => ({
      packId: row.id,
      title: row.title,
      client: row.client,
      site: board?.sites.find((site) => site.id === row.siteId)?.name || row.unit || "",
      key: estimateStorageKey(row.id),
    }));
    return liveCostJobs([...local, ...fromBoard]);
  }, [board]);
  const [picked, setPicked] = useState(jobs[0]?.id ?? "");
  const job = jobs.find((row) => row.id === picked) ?? jobs[0];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {PURCHASING_LIVE_NOTE} Pick a live estimate. The same Purchasing tab sits on the package.
      </p>
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">{PURCHASING_INTERNAL_NOTE}</p>
      {error ? <p className="text-amber-flare">{error}</p> : null}
      {jobs.length === 0 ? (
        <section className="plant-card px-5 py-5">
          <h2 className="text-2xl font-semibold text-[#163038]">No live estimate yet</h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Open a job and build the estimate. Purchasing reads that pack — it does not invent a second
            buy book.
          </p>
        </section>
      ) : (
        <>
          <label className="block max-w-xl text-sm">
            Live estimate
            <select
              className="paper-field mt-1"
              value={job?.id ?? ""}
              onChange={(event) => setPicked(event.target.value)}
            >
              {jobs.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} — {row.site || row.client}
                </option>
              ))}
            </select>
          </label>
          {job ? (
            <EstimatePackageProvider estimateKey={job.key}>
              <PurchasingDesk client={job.client} site={job.site} />
            </EstimatePackageProvider>
          ) : null}
        </>
      )}
      <p className="text-sm text-[#5b6f73]">Parked: {PURCHASING_PARKED.join(" · ")}.</p>
    </div>
  );
}
