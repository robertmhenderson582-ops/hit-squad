"use client";

import { useMemo, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { GripToPan } from "@/components/GripToPan";
import {
  CRAFT_POSITIONS,
  LISTED_POSITIONS,
  STAFF_POSITIONS,
  blankCraftRow,
  clampPerDiem,
  cloneCraftRow,
  type CalendarRange,
  type CraftRow,
} from "@/lib/craft-labor";
import {
  clockNote,
  computeRowHours,
  seatKind,
  sumSplits,
} from "@/lib/hours-clock";
import { CrewPhaseCards } from "@/components/CrewPhaseCards";
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
  title = "Direct Craft",
  note,
  positions,
  newRow,
}: {
  rows: CraftRow[];
  onRows: (next: CraftRow[] | ((current: CraftRow[]) => CraftRow[])) => void;
  site?: string;
  client?: string;
  otAfter8?: boolean;
  onOtAfter8?: (next: boolean) => void;
  title?: string;
  note?: string;
  positions?: readonly string[];
  newRow?: () => CraftRow;
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
            const next = { ...range, ...patch };
            return clampPerDiem(next, next.shift ?? row.shift);
          }),
        };
      }),
    );
  }

  function addPosition() {
    const next = newRow ? newRow() : blankCraftRow();
    onRows((current) => [...current, next]);
    setOpenId(next.id);
  }

  function assignPosition(rowId: string, position: string) {
    onRows((current) => {
      if (position && current.some((row) => row.id !== rowId && row.position === position)) {
        setOpenId((open) => (open === rowId ? current.find((row) => row.position === position)?.id ?? null : open));
        return current.filter((row) => row.id !== rowId);
      }
      return current.map((row) => (row.id === rowId ? { ...row, position } : row));
    });
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
          <h2 className="font-display text-2xl font-semibold text-[#163038]">{title}</h2>
          <p className="text-sm text-[#5b6f73]">
            {totals.hours.toLocaleString()} hrs · {totals.st.toLocaleString()} ST · {totals.ot.toLocaleString()} OT ·{" "}
            {totals.dt.toLocaleString()} DT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onOtAfter8 ? (
            <label className="flex items-center gap-2 text-sm text-[#163038]">
              <input
                type="checkbox"
                checked={otAfter8}
                onChange={(event) => onOtAfter8(event.target.checked)}
              />
              OT after 8
            </label>
          ) : null}
          <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
            + Add position
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#5b6f73]">
        {note ||
          "Hours follow the position. OT after 8 is optional — weekly 40 still sits on top. Default is ST to 10 on East Coast / staff."}
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
                  onAssignPosition={(position) => assignPosition(row.id, position)}
                  onPatchRange={(rangeId, patch) => patchRange(row.id, rangeId, patch)}
                  onDuplicate={() => duplicatePosition(row)}
                  onRemove={() => void removePosition(row)}
                  catalog={positions}
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
  onAssignPosition,
  onPatchRange,
  onDuplicate,
  onRemove,
  catalog,
}: {
  row: CraftRow;
  site: string;
  client: string;
  otAfter8: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<CraftRow>) => void;
  onAssignPosition: (position: string) => void;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  catalog?: readonly string[];
}) {
  const options = catalog && catalog.length > 0 ? catalog : LISTED_POSITIONS;
  const listed = (options as readonly string[]).includes(row.position);
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
              className="crew-chevron"
            >
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              <span className="crew-chevron-label">{open ? "Collapse" : "Expand"}</span>
            </button>
            <div className="min-w-[14rem]">
              <select
                value={selectValue}
                onChange={(event) => {
                  const value = event.target.value === CUSTOM ? "" : event.target.value;
                  onAssignPosition(value);
                }}
                className="paper-field w-full"
              >
                <option value="">Select position</option>
                {catalog && catalog.length > 0 ? (
                  catalog.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))
                ) : (
                  <>
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
                  </>
                )}
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
          <span className="text-sm text-[#5b6f73]">Per phase</span>
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
            <CrewPhaseCards
              row={row}
              site={site}
              client={client}
              otAfter8={otAfter8}
              onPatchRange={onPatchRange}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
