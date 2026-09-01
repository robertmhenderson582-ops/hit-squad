"use client";

import { DateField } from "@/components/DateField";
import { GripToPan } from "@/components/GripToPan";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  otPicksForPhase,
  phaseOtPick,
  sundaysInRange,
  workedDays,
  type JobUnit,
  type PhaseId,
  type PhaseOtPick,
  type PhaseRow,
} from "@/lib/phase-schedule";

const HEADERS = ["PHASE", "ON", "START", "STOP", "DAYS / WK", "HRS / DAY", "Total days"];

export function PhaseSchedule() {
  const pack = useEstimatePackage();
  const confirmRemove = useConfirmRemove();
  const multi = Boolean(pack.schedule.multiUnits);

  async function removeUnit(unit: JobUnit) {
    if (pack.schedule.units.length <= 1) return;
    const ok = await confirmRemove(unit.name || "this unit", {
      title: "Remove this unit?",
      confirmLabel: "Remove",
    });
    if (ok) pack.removeJobUnit(unit.id);
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-[#163038]">Phases & work schedule</h2>
        <label className="multi-units-toggle">
          <input
            type="checkbox"
            checked={multi}
            onChange={(event) => pack.setMultiUnitsOn(event.target.checked)}
          />
          Multiple units
        </label>
      </div>
      <p className="mt-2 text-xs text-[#5b6f73]">
        {multi
          ? "On: each unit has the same five locked phases with its own dates. Crew stays one position and five cards."
          : "Off keeps one timeline. Turn on Multiple units only when this job has more than one unit."}
      </p>
      {multi ? (
        <div className="mt-4 space-y-5">
          {pack.schedule.units.map((unit) => (
            <article key={unit.id} className="rounded-lg border border-[#d5e0de] px-3 py-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input
                  value={unit.name}
                  onChange={(event) => pack.renameJobUnit(unit.id, event.target.value)}
                  aria-label="Unit name"
                  className="paper-field max-w-xs"
                />
                {pack.schedule.units.length > 1 ? (
                  <button type="button" onClick={() => void removeUnit(unit)} className="text-sm text-[#b74120]">
                    Remove unit
                  </button>
                ) : null}
              </div>
              <PhaseRowsTable
                phases={unit.phases}
                onPatch={(id, next) => pack.patchUnit(unit.id, id, next)}
                onPickOt={(id, pick) => pack.pickUnitOt(unit.id, id, pick)}
              />
            </article>
          ))}
          <button type="button" onClick={() => pack.addJobUnit()} className="text-sm text-steel underline underline-offset-2">
            + Add unit
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <PhaseRowsTable phases={pack.schedule.phases} onPatch={pack.patch} onPickOt={pack.pickOt} />
        </div>
      )}
    </section>
  );
}

function PhaseRowsTable({
  phases,
  onPatch,
  onPickOt,
}: {
  phases: PhaseRow[];
  onPatch: (id: PhaseId, next: Partial<PhaseRow>) => void;
  onPickOt: (id: PhaseId, pick: PhaseOtPick) => void;
}) {
  return (
    <GripToPan>
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
          {phases.map((row) => {
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
                      onChange={(event) => onPickOt(row.id as PhaseId, event.target.value as PhaseOtPick)}
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
                      <p className="w-full text-[11px] text-[#5b6f73]">Tap a Sunday to skip it.</p>
                      {sundays.map((iso) => {
                        const off = row.sundaysOff.includes(iso);
                        return (
                          <button
                            key={iso}
                            type="button"
                            disabled={!row.on}
                            onClick={() =>
                              onPatch(row.id, {
                                sundaysOff: off
                                  ? row.sundaysOff.filter((item) => item !== iso)
                                  : [...row.sundaysOff, iso],
                              })
                            }
                            title={`Sunday ${iso.slice(5)}. On = worked. Off = skip that Sunday.`}
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
                    onChange={(event) => onPatch(row.id, { on: event.target.checked })}
                    aria-label={`${row.name} on`}
                  />
                </td>
                <td className="phase-date-cell whitespace-nowrap px-2 py-3 align-top">
                  <DateField
                    value={row.start}
                    disabled={!row.on}
                    aria-label={`${row.name} start`}
                    onChange={(start) => onPatch(row.id, { start })}
                  />
                </td>
                <td className="phase-date-cell whitespace-nowrap px-2 py-3 align-top">
                  <DateField
                    value={row.stop}
                    disabled={!row.on}
                    aria-label={`${row.name} stop`}
                    onChange={(stop) => onPatch(row.id, { stop })}
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
                      onPatch(row.id, {
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
                    onChange={(event) => onPatch(row.id, { hoursPerDay: Math.max(0, Number(event.target.value) || 0) })}
                    className="paper-field w-20"
                  />
                </td>
                <td className="phase-total-days whitespace-nowrap px-2 py-3 align-top font-semibold">{workedDays(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GripToPan>
  );
}
