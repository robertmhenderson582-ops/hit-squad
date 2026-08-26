"use client";

import Link from "next/link";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { plantJobTally, plantJobsLine } from "@/lib/jobs";
import type { SiteRecord } from "@/lib/types";

function slugFor(site: SiteRecord) {
  return site.name.toLowerCase().replace(/\s+/g, "-");
}

function siteCountLine(site: SiteRecord) {
  if (site.name.toLowerCase().includes("wood river")) {
    const tally = plantJobTally();
    return `${tally.total} jobs · ${tally.open} open · ${tally.hold} hold · ${tally.estimates} estimates`;
  }
  return `${site.openJobs} open jobs`;
}

export function SitesDesk() {
  const { board, error } = useDeskBoard();
  const alias = useAlias();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const all = (board?.sites ?? []).filter((site) => !site.id.includes("coker"));
  const visible = all;
  const noneOpen = all.every((site) => site.openJobs === 0);
  const georgia = visible.filter((site) => site.family === "Georgia Power");
  const p66 = visible.filter((site) => site.family === "Phillips 66");

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-5 rounded-sm px-4 py-6 sm:-mx-4 sm:px-6`}>
      <h2 className="text-3xl font-semibold text-[#163038]">{alias("Madison")}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5b6f73]">{plantJobsLine()}</p>
      {error ? <p className="mt-3 text-amber-flare">{error}</p> : null}
      {noneOpen ? (
        <p className="mt-4 max-w-3xl text-sm text-[#5b6f73]">
          Plant tiles are a site directory. Open-job counts stay at zero until a job is on this
          desk. Assigned sites still show at zero.
        </p>
      ) : null}

      {georgia.length ? (
        <>
          <p className="mt-8 text-xs font-semibold tracking-[0.22em] text-[#5b6f73]">{alias("Georgia Power").toUpperCase()}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {georgia.map((site) => (
              <Link key={site.id} href="/jobs/yates" className="site-plate plant-card block px-5 py-5">
                <p className="text-xl font-semibold text-[#163038]">{alias(site.name)}</p>
                <p className="mt-1 text-sm text-[#5b6f73]">
                  {alias(site.city)} · {siteCountLine(site)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {p66.length ? (
        <>
          <p className="mt-10 text-xs font-semibold tracking-[0.22em] text-[#5b6f73]">{alias("Phillips 66").toUpperCase()}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p66.map((site) => (
              <Link key={site.id} href={`/jobs/${slugFor(site)}`} className="site-plate plant-card block px-5 py-5">
                <p className="text-xl font-semibold text-[#163038]">{alias(site.name)}</p>
                <p className="mt-1 text-sm text-[#5b6f73]">
                  {alias(site.city)} · {siteCountLine(site)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
