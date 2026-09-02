"use client";

import { useEffect, useMemo, useState } from "react";
import { RateBuilder } from "@/components/RateBuilder";
import { RateBuilderCard } from "@/components/RateBuilderCard";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { companyName, companyScopeFor, type CompanyId } from "@/lib/companies";
import { viewAsInit } from "@/lib/desk-scope";
import { canUseRateBuilder } from "@/lib/desk-role";
import { deskFetch } from "@/lib/estimate-vault-client";
import { menuForViewedDesk } from "@/lib/job-menu";
import { jobsOnDesk } from "@/lib/jobs";
import { packsForViewedDesk } from "@/lib/lens-packs";
import {
  WOOD_RIVER_SITE_ID,
  archiveRateBook,
  canArchiveRateBook,
  clearJobOverride,
  companiesWithRateChrome,
  hasSiteBook,
  isRateCompanyOpen,
  jobOverrides,
  jobsForRateSite,
  resolvedCrafts,
  siteBookFor,
  visibleRateSites,
  writeRateCompanyOpen,
} from "@/lib/rate-books";
import { formatDeskDollars, SHAHAN_BOOK_LABEL } from "@/lib/shahan-wood-river";
import { compositeRates } from "@/lib/rate-builder";
import type { JobRecord } from "@/lib/types";

export function RatesDesk({
  initialCompanyId,
  initialSiteId,
  initialJobId,
  initialJobTitle,
}: {
  initialCompanyId?: CompanyId;
  initialSiteId?: string;
  initialJobId?: string;
  initialJobTitle?: string;
} = {}) {
  const alias = useAlias();
  const { lens, seat, viewingAs, lensReady } = useDeskLens();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const builder = canUseRateBuilder(lens);
  const scope = companyScopeFor(lens);
  const companies = companiesWithRateChrome(scope);
  const menu = menuForViewedDesk(viewingAs, undefined, seat);
  const deskPacks = packsForViewedDesk(lens, viewingAs, seat);
  const [serverJobs, setServerJobs] = useState<JobRecord[]>([]);
  const [sitesOpen, setSitesOpen] = useState(true);
  const [companyId, setCompanyId] = useState<CompanyId>(
    initialCompanyId && companies.some((row) => row.id === initialCompanyId)
      ? initialCompanyId
      : companies.some((row) => row.id === "madison")
        ? "madison"
        : companies[0]?.id || "hitsquad",
  );
  const [siteId, setSiteId] = useState(initialSiteId || WOOD_RIVER_SITE_ID);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!companies.some((row) => row.id === companyId)) {
      setCompanyId(companies[0]?.id || "hitsquad");
    }
  }, [companies, companyId]);

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    deskFetch("/api/desk/jobs", viewAsInit(seat))
      .then(async (response) => {
        const data = await response.json();
        if (cancelled || !response.ok) return;
        setServerJobs((data.desk?.jobs as JobRecord[]) ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lensReady, seat, viewingAs]);

  const jobs = jobsOnDesk(serverJobs, deskPacks, viewingAs, scope, menu);

  useEffect(() => {
    setSitesOpen(isRateCompanyOpen(companyId, undefined, viewingAs ? seat : undefined));
  }, [companyId, seat, viewingAs]);

  const sites = useMemo(
    () => visibleRateSites(scope, companyId, jobs, deskPacks),
    [companyId, deskPacks, jobs, scope],
  );

  useEffect(() => {
    if (sites.length && !sites.some((row) => row.id === siteId)) {
      setSiteId(sites[0].id);
    }
    if (!sites.length) setSiteId("");
  }, [companyId, siteId, sites]);
  const selectedSite = sites.find((row) => row.id === siteId) ?? sites[0];
  const currentSiteId = selectedSite?.id;
  const book = currentSiteId ? siteBookFor(companyId, currentSiteId) : null;
  const loaded = currentSiteId ? hasSiteBook(companyId, currentSiteId) : false;
  const overrides = currentSiteId ? jobOverrides(companyId, currentSiteId) : [];
  const builderCrafts = currentSiteId ? resolvedCrafts(companyId, currentSiteId) : [];
  const jobs = currentSiteId ? jobsForRateSite(currentSiteId) : [];

  function refresh() {
    setTick((value) => value + 1);
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="font-display text-2xl text-[#163038]">Rate books</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          {builder
            ? "Company, then site, then the book. A job can override one craft. Archive hides a book you added."
            : "Look up wage rates for the company and site on this desk. Read-only."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              className={`rounded-full px-3 py-1.5 text-sm ${
                company.id === companyId ? "bg-steel text-white" : "border border-steel text-steel"
              }`}
              onClick={() => {
                setCompanyId(company.id);
                const next = visibleRateSites(scope, company.id, jobs, deskPacks)[0];
                setSiteId(next?.id || "");
              }}
            >
              {alias(company.name)}
            </button>
          ))}
        </div>
      </section>

      <section className={night ? "steel-plate paper-grain" : "plant-card"}>
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left ${
            night ? "hud-rail hud-rail-active" : "paper-rail paper-rail-active"
          }`}
          aria-expanded={sitesOpen}
          aria-controls={`rate-sites-${companyId}`}
          onClick={() => {
            const next = !sitesOpen;
            setSitesOpen(next);
            writeRateCompanyOpen(companyId, next, undefined, viewingAs ? seat : undefined);
          }}
        >
          <h3 className="font-display text-2xl tracking-[0.14em]">{alias(companyName(companyId)).toUpperCase()} SITES</h3>
          <span className="font-mono text-[11px] tracking-[0.2em] text-amber-label" aria-hidden="true">
            {sitesOpen ? "▴" : "▾"}
          </span>
        </button>
        {sitesOpen ? (
          <div id={`rate-sites-${companyId}`} className="px-5 pb-5">
            {sites.length === 0 ? (
              <p className="mt-3 text-sm text-[#5b6f73]">No sites on this company yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {sites.map((site) => {
                  const hasBook = hasSiteBook(companyId, site.id);
                  const active = site.id === currentSiteId;
                  return (
                    <li key={site.id}>
                      <button
                        type="button"
                        className={`w-full rounded-lg border px-3 py-3 text-left ${
                          active ? "border-steel bg-[#f4f1e8]" : "border-[#d5e0de]"
                        }`}
                        onClick={() => setSiteId(site.id)}
                      >
                        <p className="font-semibold text-[#163038]">{alias(site.name)}</p>
                        <p className="mt-1 text-sm text-[#5b6f73]">
                          {alias(site.client)} · {alias(site.city)}
                        </p>
                        <p className="mt-1 text-sm text-[#5b6f73]">
                          {site.id === WOOD_RIVER_SITE_ID && companyId === "madison"
                            ? alias(SHAHAN_BOOK_LABEL)
                            : hasBook
                              ? alias(siteBookFor(companyId, site.id)?.label || "Book")
                              : "No book yet"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {selectedSite && companyId === "madison" && currentSiteId === WOOD_RIVER_SITE_ID ? <RateBuilder /> : null}

      {selectedSite && loaded && builderCrafts.length ? (
        <section className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[#163038]">{alias(book?.source === "shahan" ? "Working crafts" : book?.label || "Working book")}</h3>
              <p className="mt-1 text-sm text-[#5b6f73]">{alias(selectedSite.name)}</p>
            </div>
            {builder && book && canArchiveRateBook(book) ? (
              <button
                type="button"
                className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
                onClick={() => {
                  archiveRateBook(book.id);
                  refresh();
                }}
              >
                Archive book
              </button>
            ) : null}
          </div>
          <ul className="mt-4 space-y-2">
            {builderCrafts.map((craft) => {
              const rates = compositeRates(craft);
              return (
                <li key={craft.id} className="rounded-lg border border-[#d5e0de] px-3 py-3">
                  <p className="font-semibold text-[#163038]">{craft.craft}</p>
                  {craft.local ? <p className="text-sm text-[#5b6f73]">{craft.local}</p> : null}
                  <p className="hud-readout mt-2 text-sm">
                    ST {formatDeskDollars(rates.st) || "$0.00"} · OT {formatDeskDollars(rates.ot) || "$0.00"} · DT{" "}
                    {formatDeskDollars(rates.dt) || "$0.00"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {selectedSite && !loaded ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">{alias(selectedSite.name)}</h3>
          <p className="mt-2 text-sm text-[#5b6f73]">No book yet.</p>
        </section>
      ) : null}

      {overrides.length ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Job overrides</h3>
          <ul className="mt-3 space-y-2">
            {overrides.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e0de] px-3 py-3">
                <p className="text-sm text-[#163038]">
                  {alias(row.jobTitle || row.jobId || "Job")} · {row.crafts.map((craft) => craft.craft).join(", ")}
                </p>
                {builder ? (
                <button
                  type="button"
                  className="text-sm text-steel underline"
                  onClick={() => {
                    if (row.jobId && currentSiteId) clearJobOverride(companyId, currentSiteId, row.jobId);
                    refresh();
                  }}
                >
                  Clear override
                </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canUseRateBuilder(lens) ? (
        <RateBuilderCard
          companyId={companyId}
          companyName={companyName(companyId)}
          siteId={currentSiteId}
          siteName={selectedSite ? `${selectedSite.name} — ${selectedSite.city}` : undefined}
          bookLabel={book?.label}
          jobs={jobs}
          initialJobId={initialJobId}
          initialJobTitle={initialJobTitle}
          user={lens}
          alias={alias}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}
