"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { EstimateCard } from "@/components/EstimateCard";
import { JobMenuActions } from "@/components/JobMenuActions";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { PresencePulse } from "@/components/PresencePulse";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useSession } from "@/components/SessionProvider";
import { readClosed, reopenPackage } from "@/lib/desk-closeout";
import { estimateHref } from "@/lib/estimate-open";
import { canSeeCompany, companyScopeFor } from "@/lib/companies";
import { isActiveMenuItem, menuForViewedDesk, menuStatus } from "@/lib/job-menu";

export function EstimateBoard() {
  const alias = useAlias();
  const { user } = useSession();
  const { lens, viewingAs } = useDeskLens();
  const { openNewEstimate } = useEstimateModal();
  const { board, error, companyId } = useDeskBoard();
  const scope = companyScopeFor(lens, companyId);
  const showMadison = canSeeCompany(scope, "madison");
  const [closed, setClosed] = useState<{ id: string; title: string }[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setClosed(readClosed().filter((item) => item.kind === "estimate"));
  }, [tick]);
  const menu = menuForViewedDesk(viewingAs);
  const rows = (board?.estimates ?? []).filter(
    (row) => !closed.some((item) => item.id === row.id) && isActiveMenuItem(row, menu),
  );
  const archivedRows = (board?.estimates ?? []).filter((row) => menuStatus(row, menu) === "archived");
  const closedRows = (board?.estimates ?? []).filter((row) => closed.some((item) => item.id === row.id));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
        const who = row.estimator || lens?.name || user?.name || "Owner";
    const list = groups.get(who) ?? [];
    list.push(row);
    groups.set(who, list);
  }

  return (
    <div className="mt-4 space-y-5">
      <PresencePulse />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openNewEstimate()}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          + New estimate
        </button>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Working estimates on this desk.
        {showMadison ? ` ${alias("Madison")} / ${alias("P66")} figures stay with this blotter.` : ""}
        The Yours chip marks the person on this desk — it is not a separate author list.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING / ISSUED</p>
          <p className="mt-1 font-display text-3xl text-amber-label">
            {rows.filter((row) => row.status === "WORKING" || row.status === "ISSUED").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">HOLD</p>
          <p className="mt-1 font-display text-3xl text-amber-label">
            {rows.filter((row) => row.status === "HOLD").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">SITES ON THIS DESK</p>
          <p className="mt-1 font-display text-3xl text-amber-label">{board?.sites.length || "—"}</p>
        </article>
      </div>
      {error ? <p className="text-amber-label">{error}</p> : null}
      {[...groups.entries()].map(([who, list]) => (
        <section key={who}>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-[#163038]">{who}</h2>
            <CreatedBy author={who} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((row) => (
              <EstimateCard key={row.id} estimate={row} onMenuChange={() => setTick((value) => value + 1)} />
            ))}
          </div>
        </section>
      ))}
      {archivedRows.length ? (
        <details className="plant-card px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Archived</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {archivedRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.code} · {row.title}
                </span>
                <JobMenuActions
                  id={row.id}
                  title={row.title}
                  packId={row.id}
                  archived
                  onChange={() => setTick((value) => value + 1)}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {menu.transferred.length ? (
        <details className="plant-card px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Transferred</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {menu.transferred.map((row) => (
              <li key={`${row.id}-${row.at}`}>
                {row.title} · turned over to {row.toName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {closedRows.length ? (
        <details className="plant-card px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Closed out</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {closedRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.code} · {row.title}
                </span>
                <span className="flex gap-2">
                  <Link href={estimateHref(row.id)} className="underline">
                    View
                  </Link>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      reopenPackage(row.id);
                      setClosed(readClosed().filter((item) => item.kind === "estimate"));
                    }}
                  >
                    Reopen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
