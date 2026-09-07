"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobHandoffMark } from "@/components/JobHandoffMark";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDisplay } from "@/components/DisplayProvider";
import { estimateForJob } from "@/lib/estimate-open";
import { packForJob } from "@/lib/jobs";
import {
  clientIsCollapsible,
  jobEstimateHref,
  resolveClientOpen,
  resolveOpenCompanyId,
  resolveSiteOpen,
  siteIsCollapsible,
  toggleCollapsedClient,
  toggleCollapsedSite,
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
  const router = useRouter();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const openId = resolveOpenCompanyId(openCompanyId, tree);
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(() => new Set());
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(() => new Set());

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
                {company.clients.length === 0 ? (
                  <p className="font-mono text-[11px] tracking-[0.14em] text-steel-glow">No client jobs on this desk yet</p>
                ) : null}
                {company.clients.map((client) => {
                  const clientOpen = resolveClientOpen(collapsedClients, company.id, client);
                  const clientTitle = alias(client.name);
                  return (
                    <div key={`${company.id}-${client.id}`} className="space-y-3">
                      {clientIsCollapsible() ? (
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          aria-expanded={clientOpen}
                          aria-label={clientOpen ? "Collapse" : "Expand"}
                          onClick={() =>
                            setCollapsedClients((prev) => toggleCollapsedClient(prev, company.id, client))
                          }
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
                              site.assigned
                                ? night
                                  ? "text-paper-cream"
                                  : "text-[#163038]"
                                : "text-steel-glow"
                            }`;
                            return (
                              <div key={`${company.id}-${client.id}-${site.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  {collapsible ? (
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                      aria-expanded={siteOpen}
                                      aria-label={siteOpen ? "Collapse" : "Expand"}
                                      onClick={() =>
                                        setCollapsedSites((prev) => toggleCollapsedSite(prev, company.id, site))
                                      }
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
                                      return (
                                        <article
                                          key={job.id}
                                          className={`site-plate plant-card estimate-card mt-3 px-4 py-5 ${href ? "cursor-pointer" : ""}`}
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
                                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <p className="font-mono text-xs text-steel">{job.code}</p>
                                            <StatusStamp value={job.status} />
                                          </div>
                                          <h4 className="mt-1 font-display text-2xl tracking-wide">{alias(job.title)}</h4>
                                          <JobHandoffMark pack={pack} email={lens?.email} />
                                          <p className="mt-2 text-sm text-[#5b6f73]">
                                            {alias(job.client)} · {job.discipline} · {job.kind.toUpperCase()}
                                          </p>
                                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                                            <div>
                                              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WINDOW</dt>
                                              <dd className="mt-1 font-mono text-xs">{job.window}</dd>
                                            </div>
                                            <div>
                                              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">
                                                WORKING FIGURE
                                              </dt>
                                              <dd className="mt-1 font-mono text-xs text-amber-label">{job.workingFigure}</dd>
                                            </div>
                                            <div>
                                              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">HSE</dt>
                                              <dd className="mt-1 font-mono text-xs">{job.hseNote}</dd>
                                            </div>
                                          </dl>
                                          <div className="relative z-20 mt-3" onClick={(event) => event.stopPropagation()}>
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
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
