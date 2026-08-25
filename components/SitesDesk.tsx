"use client";

import Link from "next/link";
import { useDeskBoard } from "@/components/useDeskBoard";

export function SitesDesk() {
  const { board, error } = useDeskBoard();
  const georgia = (board?.sites ?? []).filter((site) => site.family === "Georgia Power");
  const p66 = (board?.sites ?? []).filter((site) => site.family === "Phillips 66" && !site.id.includes("coker"));

  return (
    <div className="paper-desk -mx-3 mt-5 rounded-sm px-4 py-6 sm:-mx-4 sm:px-6">
      <h2 className="text-3xl font-semibold text-[#163038]">Madison</h2>
      {error ? <p className="mt-3 text-amber-flare">{error}</p> : null}

      <p className="mt-8 text-xs font-semibold tracking-[0.22em] text-[#5b6f73]">GEORGIA POWER</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {georgia.map((site) => (
          <Link key={site.id} href={`/estimates/new?preset=other&site=${site.id}`} className="plant-card block px-5 py-5">
            <p className="text-xl font-semibold text-[#163038]">{site.name}</p>
            <p className="mt-1 text-sm text-[#5b6f73]">
              {site.city} · {site.openJobs} open jobs
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs font-semibold tracking-[0.22em] text-[#5b6f73]">PHILLIPS 66</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {p66.map((site) => (
          <Link key={site.id} href={`/estimates/new?preset=p66&site=${site.id}`} className="plant-card block px-5 py-5">
            <p className="text-xl font-semibold text-[#163038]">{site.name}</p>
            <p className="mt-1 text-sm text-[#5b6f73]">
              {site.city} · {site.openJobs} open jobs
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
