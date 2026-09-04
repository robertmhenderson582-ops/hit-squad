"use client";

import Link from "next/link";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias, useDeskLens, useOwnerDesk } from "@/components/OwnerDeskContext";
import { visibleDeskPacks } from "@/lib/estimate-scope";
import { useDeskBoard } from "@/components/useDeskBoard";
import { isActiveMenuItem, menuForViewedDesk } from "@/lib/job-menu";
import { canSeeCompany, companyScopeFor } from "@/lib/companies";
import { jobsOnDesk, plantJobTally, plantJobsLine, seedJobsAllowed } from "@/lib/jobs";
import type { SiteRecord } from "@/lib/types";

function slugFor(site: SiteRecord) {
  return site.name.toLowerCase().replace(/\s+/g, "-");
}

function assignedZero(site: SiteRecord, viewSite?: string) {
  if (!viewSite) return false;
  return viewSite.toLowerCase().includes(site.name.toLowerCase()) && site.openJobs === 0;
}

function siteCountLine(site: SiteRecord, tally = plantJobTally()) {
  if (site.name.toLowerCase().includes("wood river")) {
    return `${tally.total} jobs · ${tally.open} open · ${tally.hold} hold · ${tally.estimates} estimates`;
  }
  return `${site.openJobs} open jobs`;
}

export function SitesDesk() {
  const { board, error, companyId } = useDeskBoard();
  const { lens, seat, viewingAs } = useDeskLens();
  const scope = companyScopeFor(lens, companyId);
  const menu = menuForViewedDesk(viewingAs, undefined, seat);
  const tally = plantJobTally(
    jobsOnDesk([], visibleDeskPacks(lens, viewingAs, undefined, scope), viewingAs, scope, menu, {
      includeSeeds: seedJobsAllowed(scope),
    }).filter((job) =>
      isActiveMenuItem(job, menu),
    ),
  );
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const showMadison = canSeeCompany(scope, "madison");
  const all = (board?.sites ?? []).filter((site) => !site.id.includes("coker"));
  const visible = all.filter((site) => site.openJobs > 0 || assignedZero(site, owner?.viewSite));
  const noneOpen = all.every((site) => site.openJobs === 0);
  const georgia = showMadison ? visible.filter((site) => site.family === "Georgia Power") : [];
  const p66 = showMadison ? visible.filter((site) => site.family === "Phillips 66") : [];
  const monroe = showMadison ? visible.filter((site) => site.family === "Monroe Energy") : [];

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-5 rounded-sm px-4 py-6 sm:-mx-4 sm:px-6`}>
      {showMadison ? <h2 className="text-3xl font-semibold text-[#163038]">{alias("Madison")}</h2> : null}
      <p className={`${showMadison ? "mt-3" : ""} max-w-3xl text-sm leading-6 text-[#5b6f73]`}>{plantJobsLine(tally)}</p>
      {error ? <p className="mt-3 text-amber-flare">{error}</p> : null}
      {showMadison && noneOpen ? (
        <p className="mt-4 max-w-3xl text-sm text-[#5b6f73]">
          A client or plant shows up here once an estimate starts. A plant only lists once it has
          work. A PM still sees their assigned site at zero jobs.
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
                  {alias(site.city)} · {siteCountLine(site, tally)}
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
                  {alias(site.city)} · {siteCountLine(site, tally)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {monroe.length ? (
        <>
          <p className="mt-10 text-xs font-semibold tracking-[0.22em] text-[#5b6f73]">{alias("Monroe Energy").toUpperCase()}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {monroe.map((site) => (
              <Link key={site.id} href={`/jobs/${slugFor(site)}`} className="site-plate plant-card block px-5 py-5">
                <p className="text-xl font-semibold text-[#163038]">{alias(site.name)}</p>
                <p className="mt-1 text-sm text-[#5b6f73]">
                  {alias(site.city)} · {siteCountLine(site, tally)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
