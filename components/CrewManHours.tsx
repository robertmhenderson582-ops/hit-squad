"use client";

import { useState } from "react";
import { defaultLaborClass, type LaborClass } from "@/lib/labor-class";

const LINES = [
  {
    role: "Superintendent General PF 01",
    st: "$100.34",
    ot: "$150.51",
    dt: "$200.63",
    wage: "$67.50",
    cost: 0,
    hours: 0,
  },
  {
    role: "Coordinator QA-QC 01",
    st: "$83.98",
    ot: "$122.00",
    dt: "$160.01",
    wage: "$64.00",
    cost: 0,
    hours: 0,
  },
  {
    role: "Coordinator Safety 01",
    st: "$83.98",
    ot: "$122.00",
    dt: "$160.01",
    wage: "$64.00",
    cost: 0,
    hours: 0,
  },
];

export function CrewManHours() {
  const [overrides, setOverrides] = useState<Record<string, LaborClass>>({});
  const estimateTotal = LINES.reduce((sum, line) => sum + line.cost, 0);

  function toggleClass(role: string) {
    const natural = defaultLaborClass(role);
    const current = overrides[role] ?? natural;
    const next: LaborClass = current === "Merit" ? "Union" : "Merit";
    setOverrides((existing) => {
      const copy = { ...existing };
      if (next === natural) delete copy[role];
      else copy[role] = next;
      return copy;
    });
  }

  return (
    <section className="overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-baseline justify-between bg-[#122226] px-4 py-3 text-white">
        <h2 className="font-display text-xl font-semibold">Supervision</h2>
        {estimateTotal > 0 ? (
          <p className="text-sm text-white/80">Estimate total {estimateTotal.toLocaleString()}</p>
        ) : null}
      </div>
      <div className="space-y-2 bg-[#eef3f2] px-3 py-3">
        {LINES.map((line) => {
          const natural = defaultLaborClass(line.role);
          const current = overrides[line.role] ?? natural;
          const starred = current !== natural;
          return (
            <article key={line.role} className="rounded-xl bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="rounded-full border border-[#d5e0de] px-3 py-1 text-sm">{line.role}</p>
                <p className="font-semibold text-[#163038]">
                  {line.cost > 0 ? `$${line.cost.toLocaleString()}` : null}
                  {line.hours > 0 ? (
                    <span className="ml-2 text-sm font-normal text-[#5b6f73]">{line.hours} ST</span>
                  ) : null}
                </p>
              </div>
              <p className="mt-2 text-xs text-[#5b6f73]">
                ST {line.st} · OT {line.ot} · DT {line.dt} billable · Wage {line.wage}{" "}
                <button
                  type="button"
                  onClick={() => toggleClass(line.role)}
                  className="font-semibold text-[#163038] underline-offset-2 hover:underline"
                  title="Override Union / Merit. Does not change the OT clock."
                >
                  {current}
                  {starred ? "*" : ""}
                </button>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
