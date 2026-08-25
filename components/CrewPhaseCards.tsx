"use client";

import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  CRAFT_SHIFTS,
  clampPerDiem,
  nightPerDiemCap,
  perDiemCap,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
} from "@/lib/craft-labor";
import { computeRangeHours } from "@/lib/hours-clock";
import { PHASE_IDS, PHASE_NAMES, PHASE_TONES, type PhaseId, type PhaseRow } from "@/lib/phase-schedule";

export function CrewPhaseCards({
  row,
  site,
  client,
  otAfter8,
  onPatchRange,
}: {
  row: CraftRow;
  site: string;
  client: string;
  otAfter8: boolean;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
}) {
  const pack = useEstimatePackage();

  return (
    <GripToPan className="mt-3">
      <div className="flex min-w-max gap-3 pb-1" data-crew-position={row.id}>
        {PHASE_IDS.map((id) => {
          const phase = pack.schedule.phases.find((item) => item.id === id);
          const range = row.ranges.find((item) => item.phaseId === id);
          if (!phase) return null;
          return (
            <PhaseWindowCard
              key={id}
              phase={phase}
              range={range}
              row={row}
              site={site}
              client={client}
              otAfter8={otAfter8}
              onPatch={(patch) => {
                if (range) onPatchRange(range.id, patch);
              }}
            />
          );
        })}
      </div>
    </GripToPan>
  );
}

function PhaseWindowCard({
  phase,
  range,
  row,
  site,
  client,
  otAfter8,
  onPatch,
}: {
  phase: PhaseRow;
  range?: CalendarRange;
  row: CraftRow;
  site: string;
  client: string;
  otAfter8: boolean;
  onPatch: (patch: Partial<CalendarRange>) => void;
}) {
  const off = !phase.on || !range;
  const shift = range?.shift ?? row.shift;
  const two = shift === "Days & nights";
  const split = range
    ? computeRangeHours({
        position: row.position,
        site,
        client,
        start: range.start,
        end: range.end,
        hoursPerShift: range.hoursPerShift,
        headcount: range.headcount,
        nightHeadcount: range.nightHeadcount,
        shift,
        days: range.days,
        perDiemPeople: range.perDiemPeople,
        nightPerDiemPeople: range.nightPerDiemPeople,
        otAfter8: range.otAfter8 ?? otAfter8,
        clockOverride: row.clockOverride,
        skipDates: range.skipDates,
      })
    : null;

  return (
    <article className={`crew-phase-card ${off ? "is-off" : ""}`}>
      <p className={`crew-phase-bar phase-name ${PHASE_TONES[phase.id as PhaseId]}`}>{PHASE_NAMES[phase.id]}</p>
      <div className="space-y-2 px-3 py-3">
        <p className="font-mono text-[11px] text-[#5b6f73]">
          {phase.start} → {phase.stop} · {phase.daysPerWeek} d/wk · {phase.hoursPerDay} h
        </p>
        {off ? (
          <p className="text-xs text-[#5b6f73]">Off — dates stay locked. Turn it on in Job setup.</p>
        ) : (
          <>
            <label className="block text-xs">
              Shift
              <select
                value={shift}
                onChange={(event) =>
                  onPatch(clampPerDiem({ ...range!, shift: event.target.value as CraftShift }, event.target.value as CraftShift))
                }
                className="paper-field mt-1"
              >
                {CRAFT_SHIFTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                {two ? "Days headcount" : "Headcount"}
                <input
                  type="number"
                  min={1}
                  value={range!.headcount}
                  onChange={(event) =>
                    onPatch(
                      clampPerDiem({ ...range!, headcount: Math.max(1, Number(event.target.value) || 1) }, shift),
                    )
                  }
                  className="paper-field mt-1"
                />
              </label>
              {two ? (
                <label className="text-xs">
                  Nights headcount
                  <input
                    type="number"
                    min={1}
                    value={range!.nightHeadcount}
                    onChange={(event) =>
                      onPatch(
                        clampPerDiem(
                          { ...range!, nightHeadcount: Math.max(1, Number(event.target.value) || 1) },
                          shift,
                        ),
                      )
                    }
                    className="paper-field mt-1"
                  />
                </label>
              ) : null}
              <label className="text-xs">
                {two ? "Days per-diem" : "Per-diem Headcount"}
                <input
                  type="number"
                  min={0}
                  max={perDiemCap(range!)}
                  value={range!.perDiemPeople}
                  onChange={(event) =>
                    onPatch({ perDiemPeople: Math.min(perDiemCap(range!), Math.max(0, Number(event.target.value) || 0)) })
                  }
                  className="paper-field mt-1"
                />
              </label>
              {two ? (
                <label className="text-xs">
                  Nights per-diem
                  <input
                    type="number"
                    min={0}
                    max={nightPerDiemCap(range!)}
                    value={range!.nightPerDiemPeople ?? 1}
                    onChange={(event) =>
                      onPatch({
                        nightPerDiemPeople: Math.min(
                          nightPerDiemCap(range!),
                          Math.max(0, Number(event.target.value) || 0),
                        ),
                      })
                    }
                    className="paper-field mt-1"
                  />
                </label>
              ) : null}
            </div>
            {split ? (
              <p className="text-[11px] text-[#5b6f73]">
                {split.st} ST · {split.ot} OT · {split.dt} DT · {split.pd} PD
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
