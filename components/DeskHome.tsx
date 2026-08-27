"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DeskHero } from "@/components/DeskHero";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { EstimateCard } from "@/components/EstimateCard";
import { SitesDesk } from "@/components/SitesDesk";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";
import { jobLooksClosed, readClosed } from "@/lib/desk-closeout";
import { estimateForJob, estimateHref } from "@/lib/estimate-open";
import { localPacksForUser } from "@/lib/estimate-scope";
import { deskFetch, hydrateFromVault } from "@/lib/estimate-vault-client";
import { isActiveMenuItem, menuForViewedDesk } from "@/lib/job-menu";
import { listLocalPacks, mergeLocalJobs } from "@/lib/local-estimates";
import type { DeskBoard } from "@/lib/types";

// Home must stay these four tiles. Do not replace / with an Estimates-only blotter.
const TILES = [
  { href: "/jobs", key: "jobs", label: "Jobs", note: "Open outage board" },
  { href: "/estimates", key: "estimates", label: "Estimates", note: "Working figures" },
  { href: "/cost", key: "cost", label: "Cost", note: "T&M / earned value" },
  { href: "/hse", key: "hse", label: "HSE", note: "Permits & actions" },
] as const;

export function DeskHome() {
  const alias = useAlias();
  const { lens, seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const router = useRouter();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const [desk, setDesk] = useState<DeskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closedPacks, setClosedPacks] = useState<ReturnType<typeof readClosed>>([]);
  const { board } = useDeskBoard();
  const estimates = board?.estimates ?? [];

  useEffect(() => {
    if (!lensReady || !lens) return;
    let cancelled = false;
    (async () => {
      await hydrateFromVault(undefined, { viewAs: seat });
      const response = await deskFetch("/api/desk/jobs");
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Desk records could not be loaded.");
        return;
      }
      const next = data.desk as DeskBoard;
      const packs = localPacksForUser(lens, listLocalPacks()).filter((pack) => !viewingAs || !pack.archived);
      setDesk({
        ...next,
        jobs: mergeLocalJobs(next.jobs ?? [], packs),
        estimatesOpen: Math.max(next.estimatesOpen, packs.length + next.estimatesOpen),
      });
      setClosedPacks(readClosed());
    })();
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, viewingAs]);

  const menu = menuForViewedDesk(viewingAs);
  const openJobs = (desk?.jobs ?? []).filter(
    (job) => job.status === "OPEN" && !jobLooksClosed(job, closedPacks) && isActiveMenuItem(job, menu),
  );
  const closedJobs = (desk?.jobs ?? []).filter((job) => jobLooksClosed(job, closedPacks));
  const openEstimates = estimates.filter(
    (row) => !closedPacks.some((item) => item.id === row.id) && isActiveMenuItem(row, menu),
  );

  const counts = {
    jobs: openJobs.length || "—",
    estimates: openEstimates.length || "—",
    cost: desk?.costTickets ?? "—",
    hse: desk?.hseOpen ?? "—",
  };

  return (
    <div className="space-y-6">
      <DeskHero />
      <p className={`max-w-3xl text-sm leading-6 ${night ? "text-paper-cream/80" : "text-[#5b6f73]"}`}>
        Owner blotter for {alias("Madison")} / {alias("P66")} outage, T&amp;M, cost, and HSE. Records stay with this
        desk. Field trial — not a release.
      </p>
      <div className="desk-grid">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={night ? "hud-tile block px-4 py-5" : "plant-card block px-4 py-5"}
          >
            <p className={`font-mono text-[10px] tracking-[0.28em] ${night ? "text-steel-glow" : "text-steel"}`}>
              {tile.note.toUpperCase()}
            </p>
            <p className={`mt-2 font-display text-3xl tracking-[0.16em] ${night ? "text-paper-cream" : "text-[#163038]"}`}>
              {tile.label.toUpperCase()}
            </p>
            <p className={`hud-readout mt-3 font-mono text-2xl ${night ? "text-amber-label" : "text-steel"}`}>
              {counts[tile.key]}
            </p>
          </Link>
        ))}
      </div>

      <section className={`${night ? "steel-plate paper-grain" : "plant-card"} overflow-hidden`}>
        <div
          className={`border-b px-4 py-3 font-mono text-[11px] tracking-[0.22em] ${
            night ? "border-steel-rim/30 text-steel-glow" : "border-[#d5e0de] text-steel"
          }`}
        >
          OPEN JOBS — THIS DESK ONLY
        </div>
        {error ? <p className="px-4 py-4 text-amber-label">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className={`font-mono text-[10px] tracking-[0.18em] ${night ? "text-paper-cream/60" : "text-[#5b6f73]"}`}>
              <tr>
                <th className="px-4 py-3">CODE</th>
                <th className="px-4 py-3">JOB</th>
                <th className="px-4 py-3">CLIENT</th>
                <th className="px-4 py-3">WINDOW</th>
                <th className="px-4 py-3">FIGURE</th>
                <th className="px-4 py-3">HSE</th>
                <th className="px-4 py-3">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {openJobs.map((job) => {
                const estimate = estimateForJob(job, estimates);
                const href = estimate ? estimateHref(estimate.id) : undefined;
                return (
                  <tr
                    key={job.id}
                    className={`border-t border-steel-rim/20 ${href ? "cursor-pointer" : ""}`}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    <td className="hud-readout px-4 py-3 font-mono text-amber-label">{job.code}</td>
                    <td className="px-4 py-3">{alias(job.title)}</td>
                    <td className="px-4 py-3">{alias(job.client)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{job.window}</td>
                    <td className="px-4 py-3 font-mono text-xs">{job.workingFigure}</td>
                    <td className="px-4 py-3 font-mono text-xs text-steel-glow">{job.hseNote}</td>
                    <td className="px-4 py-3">
                      <StatusStamp value={job.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {closedJobs.length ? (
        <details className={night ? "steel-plate paper-grain px-4 py-4" : "plant-card px-4 py-4"}>
          <summary className="cursor-pointer font-display text-xl">Closed out</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {closedJobs.map((job) => (
              <li key={job.id}>
                {job.code} · {alias(job.title)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {openEstimates.length ? (
        <section>
          <h2 className={`font-display text-2xl ${night ? "text-paper-cream" : "text-[#163038]"}`}>Estimates</h2>
          <p className={`mt-1 text-sm ${night ? "text-paper-cream/70" : "text-[#5b6f73]"}`}>
            Click a card to open that estimate.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {openEstimates.map((row) => (
              <EstimateCard key={row.id} estimate={row} />
            ))}
          </div>
        </section>
      ) : null}
      <SitesDesk />
    </div>
  );
}
