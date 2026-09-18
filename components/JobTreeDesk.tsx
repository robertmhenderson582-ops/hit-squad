"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JobHandoffMark } from "@/components/JobHandoffMark";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { StatusStamp } from "@/components/StatusStamp";
import { useDisplay } from "@/components/DisplayProvider";
import { estimateForJob } from "@/lib/estimate-open";
import { jobCardFace } from "@/lib/job-card-face";
import { packForJob } from "@/lib/jobs";
import { findDeskPack } from "@/lib/lens-packs";
import {
  jobTreeExpandStore,
  readJobTreeExpand,
  writeJobTreeExpand,
} from "@/lib/job-tree-session";
import {
  clientIsCollapsible,
  divisionIsCollapsible,
  jobEstimateHref,
  resolveClientOpen,
  resolveDivisionOpen,
  resolveOpenCompanyId,
  resolveSiteOpen,
  siteIsCollapsible,
  toggleCollapsedClient,
  toggleCollapsedDivision,
  toggleCollapsedSite,
  type JobTreeClient,
  type JobTreeCompany,
} from "@/lib/job-tree";
import type { EstimateRecord, JobRecord } from "@/lib/types";
import type { LocalPack } from "@/lib/local-estimates";

function CollapseChip({ open, night }: { open: boolean; night: boolean }) {
  return (
    <span
      className={
        night
          ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#3ec6d4]/70 bg-[#0F5F6D]/55 text-xl leading-none text-paper-cream"
          : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#0F5F6D]/40 bg-white/80 text-xl leading-none text-[#0F5F6D]"
      }
      aria-hidden="true"
    >
      {open ? "▴" : "▾"}
    </span>
  );
}

export function JobTreeDesk({
  tree,
  estimates,
  packs,
  openCompanyId,
  onToggleCompany,
  onMenuChange,
}: {
  tree: JobTreeCompany[];
  estimates: EstimateRecord[];
  packs: LocalPack[];
  openCompanyId?: string;
  onToggleCompany: (id: string) => void;
  onMenuChange: () => void;
}) {
  const alias = useAlias();
  const { lens } = useDeskLens();
  const { user } = useSession();
  const router = useRouter();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const openId = resolveOpenCompanyId(openCompanyId, tree);
  const seatEmail = (user?.email || "").trim().toLowerCase();
  const [collapsedDivisions, setCollapsedDivisions] = useState<Set<string>>(() => new Set());
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(() => new Set());
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(() => new Set());
  const [expandReady, setExpandReady] = useState(false);

  useEffect(() => {
    if (!seatEmail) return;
    const saved = readJobTreeExpand(jobTreeExpandStore(), seatEmail);
    setCollapsedDivisions(new Set(saved.collapsedDivisions));
    setCollapsedClients(new Set(saved.collapsedClients));
    setCollapsedSites(new Set(saved.collapsedSites));
    setExpandReady(true);
  }, [seatEmail]);

  useEffect(() => {
    if (!seatEmail || !expandReady) return;
    writeJobTreeExpand(jobTreeExpandStore(), {
      email: seatEmail,
      collapsedDivisions: [...collapsedDivisions],
      collapsedClients: [...collapsedClients],
      collapsedSites: [...collapsedSites],
    });
  }, [seatEmail, expandReady, collapsedDivisions, collapsedClients, collapsedSites]);

  function renderClients(company: JobTreeCompany, clients: JobTreeClient[], keyPrefix: string) {
    return clients.map((client) => {
      const clientOpen = resolveClientOpen(collapsedClients, company.id, client);
      const clientTitle = alias(client.name);
      return (
        <div key={`${keyPrefix}-${client.id}`} className="space-y-3">
          {clientIsCollapsible() ? (
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={clientOpen}
              aria-label={clientOpen ? "Collapse" : "Expand"}
              onClick={() => setCollapsedClients((prev) => toggleCollapsedClient(prev, company.id, client))}
            >
              <h3
                className={`font-display text-xl tracking-[0.14em] ${
                  night ? "text-paper-cream" : "text-[#163038]"
                }`}
              >
                {clientTitle.toUpperCase()}
              </h3>
              <CollapseChip open={clientOpen} night={night} />
            </button>
          ) : (
            <h3
              className={`font-display text-xl tracking-[0.14em] ${
                night ? "text-paper-cream" : "text-[#163038]"
              }`}
            >
              {clientTitle.toUpperCase()}
            </h3>
          )}
          {clientOpen ? (
            <div className="space-y-4 pl-1">
              {client.sites.length === 0 ? (
                <p className="font-mono text-[11px] tracking-[0.14em] text-steel-glow">
                  No sites on this client yet
                </p>
              ) : null}
              {client.sites.map((site) => {
                const collapsible = siteIsCollapsible(site);
                const siteOpen = resolveSiteOpen(collapsedSites, company.id, site);
                const title = alias(site.name);
                const titleClass = `font-display text-lg tracking-wide ${
                  site.assigned ? (night ? "text-paper-cream" : "text-[#163038]") : "text-steel-glow"
                }`;
                return (
                  <div key={`${keyPrefix}-${client.id}-${site.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {collapsible ? (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                          aria-expanded={siteOpen}
                          aria-label={siteOpen ? "Collapse" : "Expand"}
                          onClick={() => setCollapsedSites((prev) => toggleCollapsedSite(prev, company.id, site))}
                        >
                          <h4 className={titleClass}>{title}</h4>
                          <CollapseChip open={siteOpen} night={night} />
                        </button>
                      ) : (
                        <h4 className={titleClass}>{title}</h4>
                      )}
                      {site.city ? (
                        <p className="font-mono text-[10px] tracking-[0.16em] text-steel-glow">
                          {alias(site.city)}
                        </p>
                      ) : null}
                    </div>
                    {siteOpen
                      ? site.jobs.map((job) => {
                          const estimate = estimateForJob(job, estimates);
                          const pack = packForJob(job, packs, estimate?.id);
                          const href = jobEstimateHref(job, estimates, packs);
                          const livePack =
                            (pack?.packId && findDeskPack(pack.packId, undefined, typeof window === "undefined" ? null : window.localStorage)) ||
                            pack;
                          const face = jobCardFace(
                            livePack,
                            typeof window === "undefined" ? null : window.localStorage,
                          );
                          const stamp = (face.statusLabel || livePack?.status || job.status || "").trim();
                          const jobCode = face.jobCode || job.code;
                          return (
                            <article
                              key={job.id}
                              className={`job-face-card site-plate plant-card estimate-card mt-3 ${href ? "cursor-pointer" : ""}`}
                              role={href ? "link" : undefined}
                              tabIndex={href ? 0 : undefined}
                              onClick={href ? () => openJob(job) : undefined}
                              onKeyDown={(event) => {
                                if (!href) return;
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openJob(job);
                                }
                              }}
                            >
                              <div className="job-face-head">
                                <p className="job-face-code">
                                  {jobCode}
                                  {face.jobNumber ? ` · JN ${face.jobNumber}` : ""}
                                  {face.clientPoNumber ? ` · PO ${face.clientPoNumber}` : ""}
                                </p>
                                {stamp ? <StatusStamp value={stamp.toUpperCase()} /> : null}
                              </div>
                              <h4 className="job-face-title">{alias(job.title)}</h4>
                              <JobHandoffMark pack={pack} email={lens?.email} />
                              <p className="job-face-meta">
                                {alias(job.client)} · {job.discipline} · {job.kind.toUpperCase()}
                              </p>
                              <dl className="job-face-stats">
                                <div className="job-face-stat job-face-stat-total">
                                  <dt>GRAND TOTAL</dt>
                                  <dd>{face.grandTotalLabel}</dd>
                                </div>
                                <div className="job-face-stat job-face-stat-phases">
                                  <dt>PHASE STARTS</dt>
                                  <dd>
                                    {face.phaseStarts.length ? (
                                      <ul className="job-face-phases">
                                        {face.phaseStarts.map((row) => (
                                          <li key={`${row.id}:${row.start}`}>
                                            <span>{row.name}</span>
                                            <span>{row.startLabel}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      face.phaseStartsLabel
                                    )}
                                  </dd>
                                </div>
                                <div className="job-face-stat">
                                  <dt>WINDOW</dt>
                                  <dd>{job.window}</dd>
                                </div>
                                <div className="job-face-stat">
                                  <dt>WORKING FIGURE</dt>
                                  <dd>
                                    {job.workingFigure ||
                                      (face.jobNumber || face.clientPoNumber
                                        ? [face.jobNumber ? `JN ${face.jobNumber}` : "", face.clientPoNumber ? `PO ${face.clientPoNumber}` : ""]
                                            .filter(Boolean)
                                            .join(" · ")
                                        : "—")}
                                  </dd>
                                </div>
                                <div className="job-face-stat">
                                  <dt>HSE</dt>
                                  <dd>{job.hseNote}</dd>
                                </div>
                              </dl>
                              <div className="job-face-menu relative z-20" onClick={(event) => event.stopPropagation()}>
                                <JobMenuActions
                                  id={job.id}
                                  title={job.title}
                                  packId={pack?.packId || estimate?.id}
                                  onChange={onMenuChange}
                                />
                              </div>
                              {href ? (
                                <Link href={href} className="sr-only" onClick={(event) => openJob(job, event)}>
                                  Open estimate
                                </Link>
                              ) : null}
                            </article>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    });
  }

  function openJob(job: JobRecord, event?: { preventDefault: () => void; stopPropagation: () => void }) {
    const href = jobEstimateHref(job, estimates, packs);
    if (!href) return;
    event?.preventDefault();
    event?.stopPropagation();
    router.push(href);
  }

  return (
    <div className="mt-6 space-y-3">
      {tree.map((company) => {
        const open = company.id === openId;
        return (
          <section key={company.id} className={night ? "steel-plate paper-grain" : "plant-card"}>
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left ${
                night ? "hud-rail hud-rail-active" : "paper-rail paper-rail-active"
              }`}
              aria-expanded={open}
              aria-label={open ? "Collapse" : "Expand"}
              onClick={() => onToggleCompany(company.id)}
            >
              <span className="font-display text-2xl tracking-[0.14em]">{alias(company.name).toUpperCase()}</span>
              <CollapseChip open={open} night={night} />
            </button>
            {open ? (
              <div className="space-y-5 px-4 pb-5 pt-2">
                {company.divisions.length === 0 && company.clients.length === 0 ? (
                  <p className="font-mono text-[11px] tracking-[0.14em] text-steel-glow">No client jobs on this desk yet</p>
                ) : null}
                {company.divisions.length
                  ? company.divisions.map((division) => {
                      const divisionOpen = resolveDivisionOpen(collapsedDivisions, company.id, division);
                      const divisionTitle = alias(division.name);
                      return (
                        <div key={`${company.id}-${division.id}`} className="space-y-3">
                          {divisionIsCollapsible() ? (
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 text-left"
                              aria-expanded={divisionOpen}
                              aria-label={divisionOpen ? "Collapse" : "Expand"}
                              onClick={() =>
                                setCollapsedDivisions((prev) => toggleCollapsedDivision(prev, company.id, division))
                              }
                            >
                              <div className="min-w-0">
                                <h3
                                  className={`font-display text-xl tracking-[0.14em] ${
                                    night ? "text-paper-cream" : "text-[#163038]"
                                  }`}
                                >
                                  {divisionTitle.toUpperCase()}
                                </h3>
                                {division.code ? (
                                  <p className="font-mono text-[10px] tracking-[0.16em] text-steel-glow">
                                    {division.code}
                                  </p>
                                ) : null}
                              </div>
                              <CollapseChip open={divisionOpen} night={night} />
                            </button>
                          ) : (
                            <h3
                              className={`font-display text-xl tracking-[0.14em] ${
                                night ? "text-paper-cream" : "text-[#163038]"
                              }`}
                            >
                              {divisionTitle.toUpperCase()}
                            </h3>
                          )}
                          {divisionOpen ? (
                            <div className="space-y-4 pl-1">
                              {division.clients.length === 0 ? (
                                <p className="font-mono text-[11px] tracking-[0.14em] text-steel-glow">
                                  No client sites on this division yet
                                </p>
                              ) : null}
                              {renderClients(company, division.clients, `${company.id}-${division.id}`)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : company.clients.map((client) => renderClients(company, [client], company.id))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
