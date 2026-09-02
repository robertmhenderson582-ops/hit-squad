"use client";

import { useMemo, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias } from "@/components/OwnerDeskContext";
import { formatWageRate, lookupWageRate, wageLookupBook } from "@/lib/wage-lookup";

export function WageLookupDesk({ client, site }: { client?: string; site?: string }) {
  const alias = useAlias();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const book = useMemo(() => wageLookupBook(site || "", client || ""), [client, site]);
  const [positionId, setPositionId] = useState("");
  const selected = book ? lookupWageRate(site || "", client || "", positionId) : null;

  return (
    <section className={night ? "steel-plate paper-grain" : "plant-card"}>
      <div className={`flex items-center justify-between gap-3 px-5 py-4 ${night ? "hud-rail hud-rail-active" : "paper-rail paper-rail-active"}`}>
        <h2 className="font-display text-2xl tracking-[0.14em]">{alias("Wage lookup").toUpperCase()}</h2>
        <span className="font-mono text-[11px] tracking-[0.2em] text-amber-label">READ-ONLY</span>
      </div>
      <div className="space-y-4 px-5 pb-5">
        {book ? (
          <>
            <p className="mt-3 text-sm text-[#5b6f73]">
              {alias(book.label)} · {alias(book.siteName)}. Pick a position to see the book wage. This does not
              change Crew.
            </p>
            <label className="block">
              <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">POSITION</span>
              <select
                value={positionId}
                onChange={(event) => setPositionId(event.target.value)}
                className={`${night ? "steel-field" : "paper-field"} mt-2 w-full rounded-lg px-3 py-2`}
                aria-label="Position"
              >
                <option value="">Select a position</option>
                {book.positions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <p className="hud-readout text-sm">{formatWageRate(selected)}</p>
            ) : (
              <p className="text-sm text-[#5b6f73]">Select a position to see ST / OT / DT.</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-[#5b6f73]">No book yet</p>
        )}
      </div>
    </section>
  );
}
