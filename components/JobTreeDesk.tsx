"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { JobHandoffMark } from "@/components/JobHandoffMark";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDisplay } from "@/components/DisplayProvider";
import { estimateForJob } from "@/lib/estimate-open";
import { packForJob } from "@/lib/jobs";
import { defaultOpenCompanyId, jobEstimateHref, type JobTreeCompany } from "@/lib/job-tree";
import type { EstimateRecord, JobRecord } from "@/lib/types";
import type { LocalPack } from "@/lib/local-estimates";

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
  const openId = openCompanyId || defaultOpenCompanyId(tree);

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
              onClick={() => onToggleCompany(company.id)}
            >
              <span className="font-display text-2xl tracking-[0.14em]">{alias(company.name).toUpperCase()}</span>
              <span className="font-mono text-[11px] tracking-[0.2em] text-amber-label" aria-hidden="true">
                {open ? "▴" : "▾"}
              </span>
            </button>
            {open ? (
              <div className="space-y-4 px-4 pb-5 pt-2">
                {company.sites.map((site) => (
                  <div key={`${company.id}-${site.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3
                        className={`font-display text-xl tracking-wide ${
                          site.assigned ? (night ? "text-paper-cream" : "text-[#163038]") : "text-steel-glow"
                        }`}
                      >
                        {site.assigned ? alias(site.name) : "Not assigned"}
                      </h3>
                      {site.assigned && site.city ? (
                        <p className="font-mono text-[10px] tracking-[0.16em] text-steel-glow">
                          {alias(site.client)} · {alias(site.city)}
                        </p>
                      ) : null}
                    </div>
                    {!site.assigned ? (
                      <p className="mt-1 font-mono text-[11px] tracking-[0.14em] text-steel-glow">
                        {site.id === "site-unassigned" ? alias(company.name) : alias(site.name)} · no jobs on this site
                      </p>
                    ) : null}
                    {site.jobs.map((job) => {
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
                              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING FIGURE</dt>
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
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
