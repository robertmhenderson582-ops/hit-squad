"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ModuleTable } from "@/components/ModuleTable";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

const TABS = ["Setup", "Crew / staffing", "Activities / WBS"] as const;

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const { board, error } = useDeskBoard();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Setup");
  const estimate = board?.estimates.find((row) => row.id === estimateId);
  const site = board?.sites.find((row) => row.id === estimate?.siteId);
  const crews = useMemo(
    () => board?.crews.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );
  const activities = useMemo(
    () => board?.activities.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );

  if (error) return <p className="mt-4 text-amber-label">{error}</p>;
  if (!board) return <p className="mt-4 font-mono text-xs tracking-[0.2em] text-steel-glow">LOADING PACKAGE</p>;
  if (!estimate) {
    return (
      <p className="mt-4 text-paper-cream/80">
        That package is not on this desk.{" "}
        <Link href="/estimates" className="text-amber-label underline">
          Back to estimates
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        {estimate.code} · {estimate.client} · {estimate.unit}. Job setup, crew, and WBS stay with the
        signed-in owner.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">LABOR</p>
          <p className="font-mono text-lg text-amber-label">{estimate.labor}</p>
        </article>
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">MATERIAL</p>
          <p className="font-mono text-lg text-amber-label">{estimate.material}</p>
        </article>
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">TOTAL</p>
          <p className="font-mono text-lg text-amber-label">{estimate.total}</p>
        </article>
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">STATUS</p>
          <div className="mt-1">
            <StatusStamp value={estimate.status} />
          </div>
        </article>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`border px-3 py-2 font-mono text-[11px] tracking-[0.16em] ${
              tab === item ? "border-amber-label text-amber-label" : "border-steel-rim/40 text-paper-cream/80"
            }`}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === "Setup" ? (
        <section className="steel-plate paper-grain grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">SITE / PLANT</p>
            <p className="mt-1">{site?.name ?? "—"}</p>
            <p className="font-mono text-xs text-paper-cream/70">{site?.plant}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">CONTRACT</p>
            <p className="mt-1">{estimate.type}</p>
            <p className="font-mono text-xs text-paper-cream/70">{site?.contract}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WINDOW</p>
            <p className="mt-1">{estimate.window}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">GATE / ACCESS</p>
            <p className="mt-1">{site?.gate ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">UNITS ON SITE</p>
            <p className="mt-1">{site?.units.join(" · ")}</p>
          </div>
        </section>
      ) : null}

      {tab === "Crew / staffing" ? (
        <ModuleTable
          caption="CREW SHEET — BURDENED IL RATES"
          headers={["CRAFT", "HEADCOUNT", "SHIFT", "HRS", "BASE", "BURDENED"]}
        >
          {crews.map((row) => (
            <tr key={row.id} className="border-t border-steel-rim/20">
              <td className="px-4 py-3">{row.craft}</td>
              <td className="px-4 py-3 font-mono">{row.headcount}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.shift}</td>
              <td className="px-4 py-3 font-mono">{row.hours}</td>
              <td className="px-4 py-3 font-mono text-xs">${row.baseRate.toFixed(2)}</td>
              <td className="px-4 py-3 font-mono text-xs text-amber-label">${row.burdenedRate.toFixed(2)}</td>
            </tr>
          ))}
        </ModuleTable>
      ) : null}

      {tab === "Activities / WBS" ? (
        <ModuleTable caption="WBS / ACTIVITIES" headers={["WBS", "ACTIVITY", "CRAFT", "MH", "DOLLARS", "STATUS"]}>
          {activities.map((row) => (
            <tr key={row.id} className="border-t border-steel-rim/20">
              <td className="px-4 py-3 font-mono text-amber-label">{row.wbs}</td>
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.craft}</td>
              <td className="px-4 py-3 font-mono">{row.mh.toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.dollars}</td>
              <td className="px-4 py-3">
                <StatusStamp value={row.status} />
              </td>
            </tr>
          ))}
        </ModuleTable>
      ) : null}
    </div>
  );
}
