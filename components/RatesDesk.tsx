"use client";

import { useEffect, useMemo, useState } from "react";
import { RateBuilder } from "@/components/RateBuilder";
import { RateBuilderCard } from "@/components/RateBuilderCard";
import { ThirdPartyRentalDesk } from "@/components/ThirdPartyRentalDesk";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { companyName, companyScopeFor, type CompanyId } from "@/lib/companies";
import { canUseRateBuilder } from "@/lib/desk-role";
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
  preferredRateSiteId,
  resolvedCrafts,
  siteBookFor,
  visibleRateSites,
  writeRateCompanyOpen,
} from "@/lib/rate-books";
import { formatDeskDollars } from "@/lib/shahan-wood-river";
import { craftBillingRates, craftPdAmount, LABOR_SHEET_COLUMNS } from "@/lib/rate-builder";
import { bookForSiteId } from "@/lib/wage-lookup";

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
  const { lens, seat, viewingAs } = useDeskLens();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const builder = canUseRateBuilder(lens);
  const scope = companyScopeFor(lens);
  const companies = companiesWithRateChrome(scope);
  const [sitesOpen, setSitesOpen] = useState(true);
  const [companyId, setCompanyId] = useState<CompanyId>(
    initialCompanyId && companies.some((row) => row.id === initialCompanyId)
      ? initialCompanyId
      : companies.some((row) => row.id === "madison")
        ? "madison"
        : companies[0]?.id || "hitsquad",
  );
  const [siteId, setSiteId] = useState(initialSiteId || WOOD_RIVER_SITE_ID);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!companies.some((row) => row.id === companyId)) {
      setCompanyId(companies[0]?.id || "hitsquad");
    }
  }, [companies, companyId]);

  useEffect(() => {
    setSitesOpen(isRateCompanyOpen(companyId, undefined, viewingAs ? seat : undefined));
  }, [companyId, seat, viewingAs]);

  const sites = useMemo(() => visibleRateSites(scope, companyId), [companyId, scope]);

  function openCompanyLookup(id: CompanyId) {
    setCompanyId(id);
    const nextSites = visibleRateSites(scope, id);
    setSiteId(preferredRateSiteId(id, nextSites));
  }

  useEffect(() => {
    if (!sites.length) return;
    if (!sites.some((row) => row.id === siteId)) {
      setSiteId(preferredRateSiteId(companyId, sites));
    }
  }, [companyId, siteId, sites]);

  const selectedSite = sites.find((row) => row.id === siteId) ?? null;
  const currentSiteId = selectedSite?.id;
  const book = currentSiteId ? siteBookFor(companyId, currentSiteId) : null;
  const loaded = currentSiteId ? hasSiteBook(companyId, currentSiteId) : false;
  const overrides = currentSiteId ? jobOverrides(companyId, currentSiteId) : [];
  const builderCrafts = currentSiteId ? resolvedCrafts(companyId, currentSiteId) : [];
  const rateJobs = currentSiteId ? jobsForRateSite(currentSiteId) : [];
  const wageBook = currentSiteId && companyId === "madison" ? bookForSiteId(currentSiteId) : null;
  const woodRiverLookup = Boolean(wageBook && currentSiteId === WOOD_RIVER_SITE_ID);

  function refresh() {
    setTick((value) => value + 1);
  }

  return (
    <div className="space-y-5">
      <section className={night ? "steel-plate paper-grain" : "plant-card"}>
        {companies.length > 1 ? (
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {companies.map((company) => (
              <button
                key={company.id}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm ${
                  company.id === companyId ? "bg-steel text-white" : "border border-steel text-steel"
                }`}
                onClick={() => openCompanyLookup(company.id)}
              >
                {alias(company.name)}
              </button>
            ))}
          </div>
        ) : null}
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
                          {companyId === "madison" && bookForSiteId(site.id)
                            ? alias(bookForSiteId(site.id)!.bookLabel)
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

      {wageBook ? <RateBuilder siteId={wageBook.siteId} /> : null}
      {woodRiverLookup ? <ThirdPartyRentalDesk editable={builder} /> : null}

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
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  {LABOR_SHEET_COLUMNS.map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {builderCrafts.map((craft) => {
                  const rates = craftBillingRates(craft);
                  const pd = craftPdAmount(craft);
                  return (
                    <tr key={craft.id} className="border-t border-[#d5e0de]">
                      <td className="px-2 py-2">
                        <p className="font-semibold text-[#163038]">{craft.craft}</p>
                        {craft.local ? <p className="text-sm text-[#5b6f73]">{craft.local}</p> : null}
                      </td>
                      <td className="px-2 py-2 font-semibold">{formatDeskDollars(craft.baseSt) || "—"}</td>
                      <td className="px-2 py-2 font-semibold">{formatDeskDollars(rates.st) || "—"}</td>
                      <td className="px-2 py-2 font-semibold">{formatDeskDollars(rates.ot) || "—"}</td>
                      <td className="px-2 py-2 font-semibold">{formatDeskDollars(rates.dt) || "—"}</td>
                      <td className="px-2 py-2 font-semibold">{pd ? formatDeskDollars(pd) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          jobs={rateJobs}
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
