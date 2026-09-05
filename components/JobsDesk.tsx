"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JobMenuActions } from "@/components/JobMenuActions";
import { JobTreeDesk } from "@/components/JobTreeDesk";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useDisplay } from "@/components/DisplayProvider";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { jobLooksClosed, readClosed } from "@/lib/desk-closeout";
import { estimateForJob } from "@/lib/estimate-open";
import { packsForViewedDesk, snapshotOwnerDesk } from "@/lib/lens-packs";
import { viewAsInit } from "@/lib/desk-scope";
import { deskFetch, flushLocalPacksToVault, hydrateFromVault } from "@/lib/estimate-vault-client";
import { isHisProtectedMenuItem, shouldPaintHisCards } from "@/lib/his-wood-river";
import { isActiveMenuItem, menuForViewedDesk, menuStatus } from "@/lib/job-menu";
import { ensureCbiDummyPack, shouldSeedCbiDummy } from "@/lib/cbi-dummy";
import { catalogSites } from "@/lib/desk-data";
import { companyScopeFor, isStandaloneId, type CompanyId } from "@/lib/companies";
import { catalogSeedsAllowedOnDesk, jobsOnDesk, omitCatalogSeedJobs, omitCatalogSeedPacks, packForJob } from "@/lib/jobs";
import { jobTree, stickyOpenCompanyId, toggleOpenCompanyId } from "@/lib/job-tree";
import type { JobRecord } from "@/lib/types";

export function JobsDesk() {
  const alias = useAlias();
  const { lens, seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const { openNewEstimate } = useEstimateModal();
  const { board } = useDeskBoard();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const estimates = board?.estimates ?? [];
  const [serverJobs, setServerJobs] = useState<JobRecord[]>([]);
  const [companyId, setCompanyId] = useState<CompanyId | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [packTick, setPackTick] = useState(0);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    snapshotOwnerDesk(lens);
  }, [lens, viewingAs, packTick]);

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    setHydrating(true);
    (async () => {
      const jobsReq = deskFetch("/api/desk/jobs", viewAsInit(seat));
      void hydrateFromVault(undefined, { viewAs: seat })
        .then(async () => {
          if (cancelled) return;
          await flushLocalPacksToVault(undefined, { viewAs: seat });
          snapshotOwnerDesk(lens);
          if (!cancelled) setPackTick((value) => value + 1);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setHydrating(false);
        });
      const response = await jobsReq;
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Jobs stayed on this desk.");
        return;
      }
      const incoming = ((data.desk?.jobs as JobRecord[]) ?? []);
      const nextScope = companyScopeFor(lens, typeof data.companyId === "string" ? (data.companyId as CompanyId) : companyId);
      setServerJobs(catalogSeedsAllowedOnDesk(nextScope, seat) ? incoming : omitCatalogSeedJobs(incoming));
      if (typeof data.companyId === "string") setCompanyId(data.companyId as CompanyId);
      if (shouldSeedCbiDummy(nextScope)) ensureCbiDummyPack();
    })();
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, tick, viewingAs, lens]);

  const closed = readClosed();
  const scope = companyScopeFor(lens, companyId);
  const deskPacks = omitCatalogSeedPacks(packsForViewedDesk(lens, viewingAs, seat));
  const menu = menuForViewedDesk(viewingAs, undefined, seat);
  const includeSeeds = catalogSeedsAllowedOnDesk(scope, seat);
  const deskJobs = jobsOnDesk(serverJobs, deskPacks, viewingAs, scope, menu, { includeSeeds, seat });
  const jobs = includeSeeds ? deskJobs : omitCatalogSeedJobs(deskJobs);
  void packTick;
  const active = jobs.filter((job) => {
    const pack = packForJob(job, deskPacks);
    if (shouldPaintHisCards(lens) && isHisProtectedMenuItem({ id: job.id, packId: pack?.packId, title: job.title })) {
      return !jobLooksClosed(job, closed);
    }
    return isActiveMenuItem(job, menu) && !jobLooksClosed(job, closed);
  });
  const archived = jobs.filter((job) => menuStatus(job, menu) === "archived");
  const transferred = menu.transferred;
  const standaloneLane = isStandaloneId(scope?.companyId);
  const tree = jobTree({
    scope,
    jobs: active,
    sites: board?.sites?.length ? board.sites : catalogSites(),
    packs: deskPacks,
  });
  const currentOpen = stickyOpenCompanyId(openCompanyId, tree);

  function refresh() {
    setTick((value) => value + 1);
    setPackTick((value) => value + 1);
  }

  return (
    <div className={`${night ? "instrument-desk" : "paper-desk"} -mx-3 mt-4 rounded-sm px-4 py-5 sm:-mx-4 sm:px-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-[#163038]">
          {standaloneLane
            ? "This seat is on Standalone. Company jobs stay on the company door."
            : "Company, then site, then the job. Open a card to open that estimate. Archive hides a job. Delete removes your copy after you confirm."}
        </p>
        {standaloneLane ? (
          <Link href="/standalone" className="rounded-lg bg-steel px-4 py-2 text-white">
            Standalone
          </Link>
        ) : (
          <button type="button" onClick={() => openNewEstimate()} className="rounded-lg bg-steel px-4 py-2 text-white">
            + New estimate
          </button>
        )}
      </div>
      {error ? <p className="mt-3 text-amber-flare">{error}</p> : null}
      {hydrating ? (
        <p className="mt-4 text-sm font-semibold text-[#163038]" aria-live="polite">
          Refreshing jobs on this desk…
        </p>
      ) : null}
      {standaloneLane ? (
        <p className="mt-6 text-sm text-[#5b6f73]">
          One-off estimates, the change-order log, and tools that are not tied to a client site live on{" "}
          <Link href="/standalone" className="text-steel underline">
            Standalone
          </Link>
          .
        </p>
      ) : (
        <JobTreeDesk
          tree={tree}
          estimates={estimates}
          packs={deskPacks}
          openCompanyId={currentOpen}
          onToggleCompany={(id) => setOpenCompanyId((current) => toggleOpenCompanyId(current, id, tree))}
          onMenuChange={refresh}
        />
      )}
      {archived.length ? (
        <details className="plant-card mt-6 px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Archived</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {archived.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {job.code} · {alias(job.title)}
                </span>
                <JobMenuActions
                  id={job.id}
                  title={job.title}
                  packId={packForJob(job, deskPacks, estimateForJob(job, estimates)?.id)?.packId}
                  archived
                  onChange={refresh}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {transferred.length ? (
        <details className="plant-card mt-4 px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Transferred</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {transferred.map((row) => (
              <li key={`${row.id}-${row.at}`}>
                {row.title} · turned over to {row.toName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
