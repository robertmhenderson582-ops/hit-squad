"use client";

import { useState } from "react";
import { DateField } from "@/components/DateField";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  CRAFT_SHIFTS,
  RANGE_DESCRIPTION_OTHER,
  RANGE_DESCRIPTION_REASONS,
  WEEKDAYS,
  clampExtraRangeDates,
  clampPerDiem,
  extraRangeEnvelope,
  extraRangeFromPhase,
  extraSharesFirstEnvelope,
  hoursFromShiftChoice,
  nextUnitId,
  parseShiftHours,
  SHIFT_HOUR_PRESETS,
  SHIFT_HOURS_CUSTOM,
  shiftHoursChoice,
  phaseIsOff,
  phaseRangesOverlap,
  nightPerDiemCap,
  perDiemCap,
  rangeDescriptionChoice,
  rangeDescriptionLabel,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
  type ExtraRangeEnvelope,
} from "@/lib/craft-labor";
import { computeRangeHours, computeRowHours } from "@/lib/hours-clock";
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
  onSetPhaseOff,
}: {
  row: CraftRow;
  site: string;
  client: string;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: (range: CalendarRange) => void;
  onRemoveRange: (rangeId: string) => void;
  onSetPhaseOff: (phaseId: string, off: boolean) => void;
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
              onSetPhaseOff={onSetPhaseOff}
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
  onSetPhaseOff,
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
  onSetPhaseOff: (phaseId: string, off: boolean) => void;
  units: JobUnit[];
}) {
  const confirmRemove = useConfirmRemove();
  const jobOff = ranges.length === 0 && !phase.on;
  const killed = phaseIsOff(ranges, phase.id);
  const off = jobOff || killed;
  const overlap = phaseRangesOverlap(ranges, phase.id);
  const first = ranges[0];
  const envelope = extraRangeEnvelope(first, phase);
  const phaseName = PHASE_NAMES[phase.id as PhaseId];

  async function turnOff() {
    const billed = computeRowHours({ ...row, ranges: ranges.filter((range) => !range.off) }, site, client);
    if (billed.hours > 0) {
      const ok = await confirmRemove(
        `${phaseName} hours leave this position only. Restore brings them back. Job setup stays on.`,
        { title: "Turn off this phase on this position?", confirmLabel: "Turn off" },
      );
      if (!ok) return;
    }
    onSetPhaseOff(phase.id, true);
  }

  function patchRange(range: CalendarRange, index: number, patch: Partial<CalendarRange>) {
    if (index === 0) {
      const next = { ...range, ...patch };
      onPatchRange(range.id, patch.start !== undefined || patch.end !== undefined ? clampExtraRangeDates(next, envelope) : patch);
      return;
    }
    if (first && extraSharesFirstEnvelope(range, first)) {
      onPatchRange(range.id, clampExtraRangeDates({ ...range, ...patch }, envelope));
      return;
    }
    onPatchRange(range.id, patch);
  }

  return (
    <article className={`crew-phase-card ${off ? "is-off" : ""}`}>
      <p className={`crew-phase-bar phase-name ${PHASE_TONES[phase.id as PhaseId]}`}>{phaseName}</p>
      <div className="space-y-3 px-3 py-3">
        {jobOff ? (
          <p className="text-xs text-[#5b6f73]">Off — dates stay locked. Turn it on in Job setup.</p>
        ) : killed ? (
          <div>
            <p className="text-xs text-[#5b6f73]">
              Off on this position. Hours stay saved and do not bill. Other positions and Job setup stay as they are.
            </p>
            <button
              type="button"
              onClick={() => onSetPhaseOff(phase.id, false)}
              className="mt-2 text-sm text-steel underline underline-offset-2"
            >
              Restore
            </button>
          </div>
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
                showDescription
                envelope={envelope}
                units={units}
                onPatch={(patch) => patchRange(range, index, patch)}
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
                  Overlapping dates on this phase bill twice. Move the new range so it does not cover
                  the first.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void turnOff()}
                title="Turn this phase off on this position only."
                className="mt-2 text-xs text-[#5b6f73] underline"
              >
                Off this position
              </button>
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
  showDescription,
  envelope,
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
  showDescription: boolean;
  envelope: ExtraRangeEnvelope | null;
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
    phaseId: range.phaseId,
    billedAs: "billedAs" in row ? String(row.billedAs || "") : undefined,
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

  const label = rangeDescriptionLabel(range.description);

  return (
    <div className="calendar-pattern space-y-2">
      {canRemove || label ? (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <span className="line-chip px-2 py-0.5 text-xs" title="Range description">
              {label}
            </span>
          ) : (
            <span />
          )}
          {canRemove ? (
            <button type="button" onClick={onRemove} className="text-xs text-[#5b6f73] underline">
              Remove range
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-[#163038]">
        Headcount × shift hours on each selected workday. Craft weekday ST to 8; Saturday all OT. Staff weekday ST to
        10. Not DT after 12 on East Coast.
      </p>
      {showDescription ? <RangeDescriptionField value={range.description} onChange={(description) => onPatch({ description })} /> : null}
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
            min={envelope?.minStart}
            max={envelope?.maxEnd}
            className="mt-1"
            aria-label="Start"
            onChange={(start) => onPatch({ start })}
          />
        </div>
        <div className="text-xs">
          End
          <DateField
            value={range.end}
            min={envelope?.minStart}
            max={envelope?.maxEnd}
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
        <HoursPerShiftField value={range.hoursPerShift} onChange={(hoursPerShift) => onPatch({ hoursPerShift })} />
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

function HoursPerShiftField({
  value,
  onChange,
}: {
  value: number;
  onChange: (hours: number) => void;
}) {
  const [wantCustom, setWantCustom] = useState(false);
  const choice = shiftHoursChoice(value, wantCustom);
  const custom = choice === SHIFT_HOURS_CUSTOM;

  return (
    <div className="space-y-1">
      <label className="text-xs">
        Hours / shift
        <select
          value={choice}
          aria-label="Hours / shift"
          onChange={(event) => {
            const next = event.target.value;
            if (next === SHIFT_HOURS_CUSTOM) {
              setWantCustom(true);
              return;
            }
            setWantCustom(false);
            onChange(hoursFromShiftChoice(next, value));
          }}
          className="paper-field mt-1"
        >
          {SHIFT_HOUR_PRESETS.map((hours) => (
            <option key={hours} value={String(hours)}>
              {hours}
            </option>
          ))}
          <option value={SHIFT_HOURS_CUSTOM}>{SHIFT_HOURS_CUSTOM}</option>
        </select>
      </label>
      {custom ? (
        <input
          type="number"
          min={0}
          value={value}
          onChange={(event) => onChange(parseShiftHours(event.target.value))}
          aria-label="Custom hours / shift"
          className="paper-field w-full"
        />
      ) : null}
    </div>
  );
}

function RangeDescriptionField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (description: string) => void;
}) {
  const [wantOther, setWantOther] = useState(false);
  const choice = rangeDescriptionChoice(value, wantOther);
  const custom = choice === RANGE_DESCRIPTION_OTHER;

  return (
    <div className="space-y-1">
      <label className="text-xs">
        Description
        <select
          value={choice}
          aria-label="Description"
          onChange={(event) => {
            const next = event.target.value;
            if (next === RANGE_DESCRIPTION_OTHER) {
              setWantOther(true);
              if (rangeDescriptionChoice(value) !== RANGE_DESCRIPTION_OTHER) onChange("");
              return;
            }
            setWantOther(false);
            onChange(next);
          }}
          className="paper-field mt-1"
        >
          <option value="">Select a reason</option>
          {RANGE_DESCRIPTION_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
          <option value={RANGE_DESCRIPTION_OTHER}>{RANGE_DESCRIPTION_OTHER}</option>
        </select>
      </label>
      {custom ? (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Your own words"
          aria-label="Custom description"
          className="paper-field w-full"
        />
      ) : null}
    </div>
  );
}
