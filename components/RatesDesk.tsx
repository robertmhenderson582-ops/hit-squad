"use client";

import { useEffect, useMemo, useState } from "react";
import { RateBuilder } from "@/components/RateBuilder";
import { RateBuilderCard } from "@/components/RateBuilderCard";
import { useAlias, useLensUser } from "@/components/OwnerDeskContext";
import { catalogVisibleTo, companyName, companyScopeFor, type CompanyId } from "@/lib/companies";
import { canUseRateBuilder } from "@/lib/desk-role";
import {
  WOOD_RIVER_SITE_ID,
  archiveRateBook,
  canArchiveRateBook,
  clearJobOverride,
  companiesWithRateChrome,
  hasSiteBook,
  jobOverrides,
  jobsForRateSite,
  rateSitesForCompany,
  resolvedCrafts,
  siteBookFor,
} from "@/lib/rate-books";
import { formatDeskDollars, SHAHAN_BOOK_LABEL } from "@/lib/shahan-wood-river";
import { compositeRates } from "@/lib/rate-builder";

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
  const lens = useLensUser();
  const alias = useAlias();
  const scope = companyScopeFor(lens);
  const companies = companiesWithRateChrome(scope);
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
    const next = rateSitesForCompany(companyId);
    if (next.length && !next.some((row) => row.id === siteId)) {
      setSiteId(next[0].id);
    }
    if (!next.length) setSiteId("");
  }, [companyId, siteId]);

  const sites = useMemo(
    () =>
      rateSitesForCompany(companyId).filter((site) =>
        catalogVisibleTo(scope, site.client, site.name, site.family, site.city),
      ),
    [companyId, scope],
  );
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
          Company, then site, then the book. A job can override one craft. Archive hides a book you added.
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
                const next = rateSitesForCompany(company.id)[0];
                setSiteId(next?.id || "");
              }}
            >
              {alias(company.name)}
            </button>
          ))}
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <h3 className="text-lg font-semibold text-[#163038]">{alias(companyName(companyId))} sites</h3>
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
      </section>

      {selectedSite && companyId === "madison" && currentSiteId === WOOD_RIVER_SITE_ID ? <RateBuilder /> : null}

      {selectedSite && loaded && builderCrafts.length ? (
        <section className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[#163038]">{alias(book?.source === "shahan" ? "Working crafts" : book?.label || "Working book")}</h3>
              <p className="mt-1 text-sm text-[#5b6f73]">{alias(selectedSite.name)}</p>
            </div>
            {book && canArchiveRateBook(book) ? (
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
