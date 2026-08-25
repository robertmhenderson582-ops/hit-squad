"use client";

import { GripToPan } from "@/components/GripToPan";
import { uniqueCraftNames, type CraftRow } from "@/lib/craft-labor";
import { computeRangeHours } from "@/lib/hours-clock";
import { PHASE_IDS, PHASE_NAMES, PHASE_TONES } from "@/lib/phase-schedule";

export function CraftByPhase({ rows }: { rows: CraftRow[] }) {
  const crafts = uniqueCraftNames(rows);

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl font-semibold text-[#163038]">Craft by phase</h2>
      <p className="mt-1 text-sm text-[#5b6f73]">Same craft left to right across the five locked windows.</p>
      <GripToPan className="mt-4">
        <table className="min-w-max text-left text-sm">
          <thead>
            <tr className="phase-bar">
              <th className="whitespace-nowrap px-3 py-2 text-xs tracking-[0.12em]">CRAFT</th>
              {PHASE_IDS.map((id) => (
                <th
                  key={id}
                  className={`phase-name whitespace-nowrap px-3 py-2 text-xs ${PHASE_TONES[id]}`}
                >
                  {PHASE_NAMES[id]}
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
              crafts.map((craft) => {
                const row = rows.find((item) => item.position === craft);
                return (
                  <tr key={craft} className="border-t border-[#d5e0de]">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{craft}</td>
                    {PHASE_IDS.map((id) => {
                      const range = row?.ranges.find((item) => item.phaseId === id);
                      const hours = range
                        ? computeRangeHours({
                            position: craft,
                            start: range.start,
                            end: range.end,
                            hoursPerShift: range.hoursPerShift,
                            headcount: range.headcount,
                            nightHeadcount: range.nightHeadcount,
                            shift: range.shift ?? row?.shift,
                            days: range.days,
                            skipDates: range.skipDates,
                          }).hours
                        : 0;
                      return (
                        <td key={id} className={`whitespace-nowrap px-3 py-3 ${PHASE_TONES[id]}`}>
                          {hours ? hours.toLocaleString() : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GripToPan>
    </section>
  );
}
