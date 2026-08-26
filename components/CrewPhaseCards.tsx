"use client";

import { DateField } from "@/components/DateField";
import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  CRAFT_SHIFTS,
  WEEKDAYS,
  clampPerDiem,
  extraRangeFromPhase,
  nextUnitId,
  phaseRangesOverlap,
  nightPerDiemCap,
  perDiemCap,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
} from "@/lib/craft-labor";
import { computeRangeHours } from "@/lib/hours-clock";
import {
  PHASE_IDS,
  PHASE_NAMES,
  PHASE_TONES,
  sundaysInRange,
  type JobUnit,
  type PhaseId,
  type PhaseRow,
} from "@/lib/phase-schedule";

export function CrewPhaseCards({
  row,
  site,
  client,
  onPatchRange,
  onAddRange,
  onRemoveRange,
}: {
  row: CraftRow;
  site: string;
  client: string;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: (range: CalendarRange) => void;
  onRemoveRange: (rangeId: string) => void;
}) {
  const pack = useEstimatePackage();
  const multi = Boolean(pack.schedule.multiUnits);
  const units = pack.schedule.units ?? [];

  return (
    <GripToPan className="mt-3">
      <div className="flex min-w-max gap-3 pb-1" data-crew-position={row.id}>
        {PHASE_IDS.map((id) => {
          const phase = pack.schedule.phases.find((item) => item.id === id);
          const ranges = row.ranges.filter((item) => item.phaseId === id);
          const unitOn = multi && units.some((unit) => unit.phases.find((item) => item.id === id)?.on);
          if (!phase || (!phase.on && !unitOn)) return null;
          const nextId = multi ? nextUnitId(units, ranges) : undefined;
          const source =
            (nextId && units.find((unit) => unit.id === nextId)?.phases.find((item) => item.id === id)) || phase;
          return (
            <PhaseWindowCard
              key={id}
              phase={phase}
              ranges={ranges}
              row={row}
              site={site}
              client={client}
              units={multi ? units : []}
              onPatchRange={onPatchRange}
              onAddRange={() => onAddRange(extraRangeFromPhase(source, ranges[0], nextId))}
              onRemoveRange={onRemoveRange}
            />
          );
        })}
      </div>
    </GripToPan>
  );
}

function shortDate(iso: string) {
  const parts = iso.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function PhaseWindowCard({
  phase,
  ranges,
  row,
  site,
  client,
  onPatchRange,
  onAddRange,
  onRemoveRange,
  units,
}: {
  phase: PhaseRow;
  ranges: CalendarRange[];
  row: CraftRow;
  site: string;
  client: string;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: () => void;
  onRemoveRange: (rangeId: string) => void;
  units: JobUnit[];
}) {
  const off = ranges.length === 0 && !phase.on;
  const overlap = phaseRangesOverlap(ranges, phase.id);

  return (
    <article className={`crew-phase-card ${off ? "is-off" : ""}`}>
      <p className={`crew-phase-bar phase-name ${PHASE_TONES[phase.id as PhaseId]}`}>{PHASE_NAMES[phase.id]}</p>
      <div className="space-y-3 px-3 py-3">
        {off ? (
          <p className="text-xs text-[#5b6f73]">Off — dates stay locked. Turn it on in Job setup.</p>
        ) : (
          <>
            {ranges.map((range, index) => (
              <CalendarPattern
                key={range.id}
                range={range}
                row={row}
                site={site}
                client={client}
                phaseOtAfter8={phase.otAfter8}
                canRemove={index > 0}
                units={units}
                onPatch={(patch) => onPatchRange(range.id, patch)}
                onRemove={() => onRemoveRange(range.id)}
              />
            ))}
            <div>
              <button
                type="button"
                onClick={onAddRange}
                title="Second date range on this phase."
                className="text-sm text-steel underline underline-offset-2"
              >
                + Add date range
              </button>
              <p className="text-xs text-[#5b6f73]">
                Adds another stretch on this same phase — work, sit out, then come back. New dates start empty so hours do not double-count.
              </p>
              {overlap ? (
                <p className="text-xs text-[#e38b2a]">
                  These date ranges overlap on this phase. Hours will bill twice for the overlap.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function CalendarPattern({
  range,
  row,
  site,
  client,
  phaseOtAfter8,
  canRemove,
  units,
  onPatch,
  onRemove,
}: {
  range: CalendarRange;
  row: CraftRow;
  site: string;
  client: string;
  phaseOtAfter8: boolean;
  canRemove: boolean;
  units: JobUnit[];
  onPatch: (patch: Partial<CalendarRange>) => void;
  onRemove: () => void;
}) {
  const shift = range.shift ?? row.shift;
  const two = shift === "Days & nights";
  const sundays = range.days[0] ? sundaysInRange(range.start, range.end) : [];
  const skipped = new Set(range.skipDates ?? []);
  const split = computeRangeHours({
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
    otAfter8: range.otAfter8 ?? phaseOtAfter8,
    clockOverride: row.clockOverride,
    skipDates: range.skipDates,
  });

  function toggleDay(index: number) {
    const days = [...range.days];
    days[index] = !days[index];
    onPatch({ days });
  }

  function toggleSunday(iso: string) {
    const current = range.skipDates ?? [];
    onPatch({
      skipDates: current.includes(iso) ? current.filter((item) => item !== iso) : [...current, iso],
    });
  }

  return (
    <div className="calendar-pattern space-y-2">
      {canRemove ? (
        <div className="flex justify-end">
          <button type="button" onClick={onRemove} className="text-xs text-[#5b6f73] underline">
            Remove range
          </button>
        </div>
      ) : null}
      <p className="text-xs text-[#163038]">Headcount × shift hours on each selected weekday in the range.</p>
      {units.length > 0 ? (
        <label className="text-xs">
          Unit
          <select
            value={range.unitId ?? ""}
            aria-label="Unit"
            onChange={(event) => {
              const unitId = event.target.value || undefined;
              const tagged = units.find((unit) => unit.id === unitId)?.phases.find((item) => item.id === range.phaseId);
              onPatch(tagged ? { unitId, start: tagged.start, end: tagged.stop } : { unitId });
            }}
            className="paper-field mt-1"
          >
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="calendar-dates">
        <div className="text-xs">
          Start
          <DateField
            value={range.start}
            className="mt-1"
            aria-label="Start"
            onChange={(start) => onPatch({ start })}
          />
        </div>
        <div className="text-xs">
          End
          <DateField
            value={range.end}
            className="mt-1"
            aria-label="End"
            onChange={(end) => onPatch({ end: end < range.start ? range.start : end })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          Shift
          <select
            value={shift}
            onChange={(event) =>
              onPatch(clampPerDiem({ ...range, shift: event.target.value as CraftShift }, event.target.value as CraftShift))
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
        <label className="text-xs">
          Hours / shift
          <input
            type="number"
            min={0}
            value={range.hoursPerShift}
            onChange={(event) => onPatch({ hoursPerShift: Math.max(0, Number(event.target.value) || 0) })}
            className="paper-field mt-1"
          />
        </label>
        <label className="text-xs">
          {two ? "Days headcount" : "Headcount"}
          <input
            type="number"
            min={1}
            value={range.headcount}
            onChange={(event) =>
              onPatch(clampPerDiem({ ...range, headcount: Math.max(1, Number(event.target.value) || 1) }, shift))
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
              value={range.nightHeadcount}
              onChange={(event) =>
                onPatch(clampPerDiem({ ...range, nightHeadcount: Math.max(1, Number(event.target.value) || 1) }, shift))
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
            max={perDiemCap(range)}
            value={range.perDiemPeople}
            onChange={(event) =>
              onPatch({ perDiemPeople: Math.min(perDiemCap(range), Math.max(0, Number(event.target.value) || 0)) })
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
              max={nightPerDiemCap(range)}
              value={range.nightPerDiemPeople ?? 1}
              onChange={(event) =>
                onPatch({
                  nightPerDiemPeople: Math.min(nightPerDiemCap(range), Math.max(0, Number(event.target.value) || 0)),
                })
              }
              className="paper-field mt-1"
            />
          </label>
        ) : null}
      </div>
      <p className="text-xs font-semibold tracking-[0.12em] text-[#5b6f73]">WORK DAYS</p>
      <div className="flex flex-wrap gap-1">
        {WEEKDAYS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(index)}
            className={`day-chip ${range.days[index] ? "day-chip-on" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {sundays.length ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-[#5b6f73]">SUNDAYS — tap to skip that Sunday</p>
            <button type="button" onClick={() => onPatch({ skipDates: [] })} className="text-xs text-steel underline">
              All
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {sundays.map((iso) => {
              const off = skipped.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleSunday(iso)}
                  title={`Sunday ${shortDate(iso)}. On = worked. Off = skip that Sunday.`}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    off ? "border border-[#c5d4d4] text-[#5b6f73]" : "bg-steel text-white"
                  }`}
                >
                  Su {shortDate(iso)}
                  {off ? " off" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-[#5b6f73]">
        {split.st} ST · {split.ot} OT · {split.dt} DT · {split.pd} PD
      </p>
    </div>
  );
}
