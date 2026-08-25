"use client";

import { useMemo, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { GripToPan } from "@/components/GripToPan";
import {
  CRAFT_POSITIONS,
  CRAFT_SHIFTS,
  LISTED_POSITIONS,
  STAFF_POSITIONS,
  WEEKDAYS,
  blankCraftRow,
  blankRange,
  clampPerDiem,
  cloneCraftRow,
  daysPerWeekFromMask,
  maskForDaysPerWeek,
  perDiemCap,
  type CalendarRange,
  type CraftRow,
  type CraftShift,
} from "@/lib/craft-labor";
import {
  clockNote,
  computeRangeHours,
  computeRowHours,
  seatKind,
  sumSplits,
} from "@/lib/hours-clock";
import { defaultLaborClass, type LaborClass } from "@/lib/labor-class";

const HEADERS = ["POSITION", "SHIFT", "MODE", "ST", "OT", "DT", "PD DAYS", "HOURS", "COST"];
const CUSTOM = "__custom__";

export function CraftLaborGrid({
  rows,
  onRows,
  site = "",
  client = "",
  otAfter8 = false,
  onOtAfter8,
}: {
  rows: CraftRow[];
  onRows: (next: CraftRow[] | ((current: CraftRow[]) => CraftRow[])) => void;
  site?: string;
  client?: string;
  otAfter8?: boolean;
  onOtAfter8?: (next: boolean) => void;
}) {
  const confirmRemove = useConfirmRemove();
  const [openId, setOpenId] = useState<string | null>(null);

  const computed = useMemo(
    () =>
      rows.map((row) => {
        const hours = computeRowHours(row, site, client, otAfter8);
        return { ...row, ...hours, cost: "" };
      }),
    [rows, site, client, otAfter8],
  );

  const totals = useMemo(() => sumSplits(computed), [computed]);

  function patchRow(id: string, patch: Partial<CraftRow>) {
    onRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function patchRange(rowId: string, rangeId: string, patch: Partial<CalendarRange>) {
    onRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          ranges: row.ranges.map((range) => {
            if (range.id !== rangeId) return range;
            return clampPerDiem({ ...range, ...patch }, row.shift);
          }),
        };
      }),
    );
  }

  function addPosition() {
    const next = blankCraftRow();
    onRows((current) => [...current, next]);
  }

  async function removePosition(row: CraftRow) {
    const ok = await confirmRemove(row.position || "this position", {
      title: "Remove this position?",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    onRows((current) => current.filter((item) => item.id !== row.id));
    setOpenId((current) => (current === row.id ? null : current));
  }

  function duplicatePosition(row: CraftRow) {
    const copy = cloneCraftRow(row);
    onRows((current) => {
      const index = current.findIndex((item) => item.id === row.id);
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Direct Craft</h2>
          <p className="text-sm text-[#5b6f73]">
            {totals.hours.toLocaleString()} hrs · {totals.st.toLocaleString()} ST · {totals.ot.toLocaleString()} OT ·{" "}
            {totals.dt.toLocaleString()} DT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#163038]">
            <input
              type="checkbox"
              checked={otAfter8}
              onChange={(event) => onOtAfter8?.(event.target.checked)}
            />
            OT after 8
          </label>
          <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
            + Add position
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#5b6f73]">
        Hours follow the position. OT after 8 is optional — weekly 40 still sits on top. Default is ST to 10
        on East Coast / staff.
      </p>
      <GripToPan className="mt-4">
        <table className="min-w-[960px] text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {HEADERS.map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2">
                  {header}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {computed.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={10} className="px-2 py-6 text-sm text-[#5b6f73]">
                  No positions yet. Add a position to start — nothing is prefilled.
                </td>
              </tr>
            ) : null}
            {computed.map((row) => {
              const open = openId === row.id;
              return (
                <CraftAccordionRow
                  key={row.id}
                  row={row}
                  site={site}
                  client={client}
                  otAfter8={otAfter8}
                  open={open}
                  onToggle={() => setOpenId(open ? null : row.id)}
                  onPatch={(patch) => patchRow(row.id, patch)}
                  onPatchRange={(rangeId, patch) => patchRange(row.id, rangeId, patch)}
                  onAddRange={() => patchRow(row.id, { ranges: [...row.ranges, blankRange()] })}
                  onRemoveRange={(rangeId) => {
                    if (row.ranges.length <= 1) return;
                    patchRow(row.id, { ranges: row.ranges.filter((range) => range.id !== rangeId) });
                  }}
                  onDuplicate={() => duplicatePosition(row)}
                  onRemove={() => void removePosition(row)}
                />
              );
            })}
          </tbody>
        </table>
      </GripToPan>
    </section>
  );
}

function CraftAccordionRow({
  row,
  site,
  client,
  otAfter8,
  open,
  onToggle,
  onPatch,
  onPatchRange,
  onAddRange,
  onRemoveRange,
  onDuplicate,
  onRemove,
}: {
  row: CraftRow;
  site: string;
  client: string;
  otAfter8: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<CraftRow>) => void;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: () => void;
  onRemoveRange: (rangeId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const listed = (LISTED_POSITIONS as readonly string[]).includes(row.position);
  const selectValue = listed ? row.position : row.position ? CUSTOM : "";
  const naturalClass = defaultLaborClass(row.position);
  const laborClass = row.laborClassOverride ?? naturalClass;
  const starred = Boolean(row.laborClassOverride && row.laborClassOverride !== naturalClass);
  const staff = seatKind(row.position) === "staff";
  const clockChecked = staff ? row.clockOverride === "comp" : row.clockOverride === "staff";

  function toggleClass() {
    const next: LaborClass = laborClass === "Merit" ? "Union" : "Merit";
    onPatch({ laborClassOverride: next === naturalClass ? null : next });
  }

  return (
    <>
      <tr className="border-t border-[#d5e0de] align-top">
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              title={open ? "Collapse" : "Expand"}
              aria-label={open ? "Collapse" : "Expand"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#5b6f73]"
            >
              {open ? "▾" : "▸"}
            </button>
            <div className="min-w-[14rem]">
              <select
                value={selectValue}
                onChange={(event) => {
                  const value = event.target.value;
                  onPatch({ position: value === CUSTOM ? "" : value });
                }}
                className="paper-field w-full"
              >
                <option value="">Select position</option>
                <optgroup label="Supervision / staff">
                  {STAFF_POSITIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="GF / craft">
                  {CRAFT_POSITIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </optgroup>
                <option value={CUSTOM}>Type a title…</option>
              </select>
              {!listed ? (
                <input
                  value={row.position}
                  onChange={(event) => onPatch({ position: event.target.value })}
                  placeholder="Position title"
                  className="paper-field mt-1 w-full"
                />
              ) : null}
              {row.position ? (
                <button
                  type="button"
                  onClick={toggleClass}
                  className="mt-1 text-xs font-semibold text-[#163038] underline-offset-2 hover:underline"
                  title="Override Union / Merit. Does not change the OT clock."
                >
                  {laborClass}
                  {starred ? "*" : ""}
                </button>
              ) : null}
            </div>
          </div>
        </td>
        <td className="px-2 py-2">
          <select
            value={row.shift}
            onChange={(event) => {
              const shift = event.target.value as CraftShift;
              onPatch({
                shift,
                ranges: row.ranges.map((range) => clampPerDiem(range, shift)),
              });
            }}
            className="paper-field"
          >
            {CRAFT_SHIFTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2">
          <span className="paper-field inline-flex min-h-[2.6rem] items-center">Calendar</span>
        </td>
        <td className="hud-readout px-2 py-2">{row.st.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.ot.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.dt.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.pd}</td>
        <td className="hud-readout px-2 py-2">{row.hours.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2 font-semibold">{row.cost || null}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate"
              aria-label="Duplicate position"
              className="grid h-10 w-10 place-items-center rounded-lg text-[#5b6f73]"
            >
              ⧉
            </button>
            <button type="button" onClick={onRemove} aria-label="Remove this position" className="trash-btn">
              ⌫
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={10} className="bg-[#f4f1e8] px-4 py-4">
            <p className="inline-block rounded-full bg-[#eadfc8] px-3 py-1 text-xs font-semibold tracking-[0.14em] text-[#163038]">
              CALENDAR PATTERN
            </p>
            <p className="mt-2 text-xs text-[#163038]">{clockNote(row.position, site, client, row.clockOverride ?? "auto")}</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-[#163038]">
              <input
                type="checkbox"
                checked={clockChecked}
                onChange={(event) =>
                  onPatch({
                    clockOverride: event.target.checked ? (staff ? "comp" : "staff") : "auto",
                  })
                }
              />
              {staff ? "Use COMP clock" : "Use staff clock"}
            </label>
            <p className="mt-1 text-xs text-[#5b6f73]">
              Uncheck returns to auto. Union/Merit is a label only — a union superintendent still uses the
              staff split unless Use COMP clock is on.
            </p>
            <div className="mt-3 space-y-4">
              {row.ranges.map((range) => (
                <CalendarRangeFields
                  key={range.id}
                  range={range}
                  shift={row.shift}
                  position={row.position}
                  site={site}
                  client={client}
                  clockOverride={row.clockOverride}
                  otAfter8={otAfter8}
                  canRemove={row.ranges.length > 1}
                  onPatch={(patch) => onPatchRange(range.id, patch)}
                  onRemove={() => onRemoveRange(range.id)}
                />
              ))}
            </div>
            <button type="button" onClick={onAddRange} className="mt-3 text-sm text-steel">
              + Add date range
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CalendarRangeFields({
  range,
  shift,
  position,
  site,
  client,
  clockOverride,
  otAfter8,
  canRemove,
  onPatch,
  onRemove,
}: {
  range: CalendarRange;
  shift: CraftShift;
  position: string;
  site: string;
  client: string;
  clockOverride: CraftRow["clockOverride"];
  otAfter8: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<CalendarRange>) => void;
  onRemove: () => void;
}) {
  const twoCounts = shift === "Days & nights";
  const cap = perDiemCap(range, shift);
  const split = computeRangeHours({
    position,
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
    otAfter8: range.otAfter8 ?? otAfter8,
    clockOverride,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Start
          <input
            type="date"
            value={range.start}
            onChange={(event) => onPatch({ start: event.target.value })}
            className="paper-field mt-1"
          />
        </label>
        <label className="text-xs">
          End
          <input
            type="date"
            value={range.end}
            onChange={(event) => onPatch({ end: event.target.value })}
            className="paper-field mt-1"
          />
        </label>
        <label className="text-xs">
          {twoCounts ? "Headcount (days)" : "Headcount"}
          <input
            type="number"
            min={1}
            value={range.headcount}
            onChange={(event) => onPatch({ headcount: Math.max(1, Number(event.target.value) || 1) })}
            className="paper-field mt-1 w-24"
          />
        </label>
        {twoCounts ? (
          <label className="text-xs">
            Headcount (nights)
            <input
              type="number"
              min={1}
              value={range.nightHeadcount}
              onChange={(event) =>
                onPatch({ nightHeadcount: Math.max(1, Number(event.target.value) || 1) })
              }
              className="paper-field mt-1 w-24"
            />
          </label>
        ) : null}
        <label className="text-xs">
          Hours / shift
          <input
            type="number"
            min={0}
            value={range.hoursPerShift}
            onChange={(event) => onPatch({ hoursPerShift: Math.max(0, Number(event.target.value) || 0) })}
            className="paper-field mt-1 w-24"
          />
        </label>
        <label className="text-xs">
          Per-diem people
          <input
            type="number"
            min={0}
            max={cap}
            value={range.perDiemPeople}
            onChange={(event) => onPatch({ perDiemPeople: Number(event.target.value) || 0 })}
            className="paper-field mt-1 w-24"
          />
        </label>
        <label className="text-xs">
          Days / wk
          <input
            type="number"
            min={0}
            max={7}
            value={daysPerWeekFromMask(range.days)}
            onChange={(event) =>
              onPatch({ days: maskForDaysPerWeek(Math.min(7, Math.max(0, Number(event.target.value) || 0))) })
            }
            className="paper-field mt-1 w-20"
          />
        </label>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-sm text-[#5b6f73]">
            Remove range
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {WEEKDAYS.map((day, index) => (
          <button
            key={day}
            type="button"
            onClick={() => {
              const days = range.days.slice();
              days[index] = !days[index];
              onPatch({ days });
            }}
            className={`day-chip ${range.days[index] ? "day-chip-on" : "day-chip-off"}`}
          >
            {day}
          </button>
        ))}
        <p className="ml-auto text-xs text-[#5b6f73]">
          {split.st} ST · {split.ot} OT · {split.dt} DT · {split.pd} PD · {split.workedDays} days
        </p>
      </div>
    </div>
  );
}
