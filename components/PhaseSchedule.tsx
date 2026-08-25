"use client";

import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  otPicksForPhase,
  phaseOtPick,
  sundaysInRange,
  workedDays,
  type PhaseId,
  type PhaseOtPick,
} from "@/lib/phase-schedule";

const HEADERS = ["PHASE", "ON", "START", "STOP", "DAYS / WK", "HRS / DAY", "Total days"];

export function PhaseSchedule() {
  const pack = useEstimatePackage();

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl font-semibold text-[#163038]">Phases & work schedule</h2>
      <GripToPan className="mt-4">
        <table className="phase-setup-table min-w-max text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {HEADERS.map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pack.schedule.phases.map((row) => {
              const firstOn = pack.schedule.phases.find((item) => item.on)?.id;
              const startLocked = !row.on || row.id !== firstOn;
              const picks = otPicksForPhase(row.id);
              const currentPick = phaseOtPick(row);
              const sundays = row.daysPerWeek === 7 ? sundaysInRange(row.start, row.stop) : [];
              return (
                <tr key={row.id} className={`border-t border-[#d5e0de] ${row.on ? "" : "opacity-50"}`}>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <p className="font-semibold">{row.name}</p>
                    {picks ? (
                      <select
                        aria-label={`${row.name} overtime`}
                        value={currentPick ?? (row.id === "post" ? "5x8-st" : "4x10-st")}
                        onChange={(event) => pack.pickOt(row.id as PhaseId, event.target.value as PhaseOtPick)}
                        className="paper-field mt-2 min-w-[14rem]"
                      >
                        {picks.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {sundays.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {sundays.map((iso) => {
                          const off = row.sundaysOff.includes(iso);
                          return (
                            <button
                              key={iso}
                              type="button"
                              disabled={!row.on}
                              onClick={() =>
                                pack.patch(row.id, {
                                  sundaysOff: off
                                    ? row.sundaysOff.filter((item) => item !== iso)
                                    : [...row.sundaysOff, iso],
                                })
                              }
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                off ? "border border-[#c5d4d4] text-[#5b6f73]" : "bg-steel text-white"
                              }`}
                            >
                              Su {iso.slice(5)}
                              {off ? " off" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={row.on}
                      onChange={(event) => pack.patch(row.id, { on: event.target.checked })}
                      aria-label={`${row.name} on`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <input
                      type="date"
                      value={row.start}
                      disabled={startLocked}
                      onChange={(event) => pack.patch(row.id, { start: event.target.value })}
                      className="paper-field"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <input
                      type="date"
                      value={row.stop}
                      disabled={!row.on}
                      onChange={(event) => pack.patch(row.id, { stop: event.target.value })}
                      className="paper-field"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <input
                      type="number"
                      min={0}
                      max={7}
                      disabled={!row.on}
                      value={row.daysPerWeek}
                      onChange={(event) =>
                        pack.patch(row.id, {
                          daysPerWeek: Math.min(7, Math.max(0, Number(event.target.value) || 0)),
                        })
                      }
                      className="paper-field w-20"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top">
                    <input
                      type="number"
                      min={0}
                      disabled={!row.on}
                      value={row.hoursPerDay}
                      onChange={(event) =>
                        pack.patch(row.id, { hoursPerDay: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className="paper-field w-20"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 align-top font-semibold">{workedDays(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GripToPan>
    </section>
  );
}
