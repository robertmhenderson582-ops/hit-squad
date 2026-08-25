"use client";

import { GripToPan } from "@/components/GripToPan";
import { uniqueCraftNames, type CraftRow } from "@/lib/craft-labor";

const PHASES = [
  { id: "pre", name: "Pre-Turnaround", tone: "phase-moss" },
  { id: "oil-out", name: "Oil Out", tone: "phase-rust" },
  { id: "mech", name: "Mechanical Window", tone: "phase-steel" },
  { id: "oil-in", name: "Oil In", tone: "phase-amber" },
  { id: "post", name: "Post", tone: "phase-green" },
] as const;

export function CraftByPhase({ rows }: { rows: CraftRow[] }) {
  const crafts = uniqueCraftNames(rows);

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl font-semibold text-[#163038]">Craft by phase</h2>
      <p className="mt-1 text-sm text-[#5b6f73]">
        Same craft left to right. Hours stay empty — look only.
      </p>
      <GripToPan className="mt-4">
        <table className="min-w-max text-left text-sm">
          <thead>
            <tr className="phase-bar">
              <th className="whitespace-nowrap px-3 py-2 text-xs tracking-[0.12em]">CRAFT</th>
              {PHASES.map((phase) => (
                <th
                  key={phase.id}
                  className={`phase-name whitespace-nowrap px-3 py-2 text-xs ${phase.tone}`}
                >
                  {phase.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crafts.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={6} className="px-3 py-6 text-sm text-[#5b6f73]">
                  Add a Direct Craft position to see it across phases.
                </td>
              </tr>
            ) : (
              crafts.map((craft) => (
                <tr key={craft} className="border-t border-[#d5e0de]">
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{craft}</td>
                  {PHASES.map((phase) => (
                    <td key={phase.id} className={`whitespace-nowrap px-3 py-3 ${phase.tone}`}>
                      —
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GripToPan>
    </section>
  );
}
