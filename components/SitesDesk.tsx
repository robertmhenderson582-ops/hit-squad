"use client";

import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

export function SitesDesk() {
  const { board, error } = useDeskBoard();

  return (
    <div className="mt-4 space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Plant and pad setup for this owner. Madison / P66 units are plugged in for estimating work
        only.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      {(board?.sites ?? []).map((site) => (
        <article key={site.id} className="steel-plate paper-grain px-4 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-xs text-amber-label">{site.code}</p>
            <StatusStamp value="OPEN" />
          </div>
          <h2 className="mt-1 font-display text-2xl tracking-wide">{site.name}</h2>
          <p className="mt-1 text-sm text-paper-cream/80">
            {site.client} · {site.plant} · {site.state}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">UNITS</dt>
              <dd className="mt-1">{site.units.join(" · ")}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">TURNAROUND</dt>
              <dd className="mt-1 font-mono text-xs">{site.turnaround}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">CONTRACT</dt>
              <dd className="mt-1">{site.contract}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">GATE</dt>
              <dd className="mt-1">{site.gate}</dd>
            </div>
          </dl>
          <p className="mt-4 font-mono text-xs text-steel-glow">{site.notes}</p>
        </article>
      ))}
    </div>
  );
}
