"use client";

import { useMemo, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";

const POSITIONS = ["Tool Room Attendant", "General Foreman", "Safety attendant", "Hole watch", "Fire watch"];
const CHIPS = ["Add Job Set", "Shutdown", "Rear wall", "Superheater", "V bottom", "Hydro", "Demob"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type CraftRow = {
  id: string;
  position: string;
  shift: string;
  mode: "Calendar" | "Manual";
  st: number;
  ot: number;
  dt: number;
  pd: number;
  hours: number;
  cost: string;
  days: string[];
  start: string;
  end: string;
  headcount: number;
  shiftHours: number;
  pdPeople: number;
};

function blankRow(id: string): CraftRow {
  return {
    id,
    position: "",
    shift: "Day",
    mode: "Manual",
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "$0",
    days: [],
    start: "",
    end: "",
    headcount: 1,
    shiftHours: 0,
    pdPeople: 1,
  };
}

export function CraftLaborGrid() {
  const confirmRemove = useConfirmRemove();
  const [rows, setRows] = useState<CraftRow[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    const hours = rows.reduce((sum, row) => sum + row.hours, 0);
    return `${hours.toLocaleString()} hrs · $0`;
  }, [rows]);

  function addPosition() {
    const id = `cr-${Date.now()}`;
    setRows((current) => [...current, blankRow(id)]);
    setOpen((current) => ({ ...current, [id]: true }));
  }

  function toggleDay(id: string, day: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              days: row.days.includes(day) ? row.days.filter((item) => item !== day) : [...row.days, day],
            }
          : row,
      ),
    );
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Direct Craft</h2>
          <p className="text-sm text-[#5b6f73]">{totals}</p>
        </div>
        <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
          + Add position
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setChips((current) => (current.includes(chip) ? current : [...current, chip]))}
            className="line-chip"
          >
            {chip}
          </button>
        ))}
      </div>
      {chips.length ? (
        <p className="mt-2 text-xs text-[#5b6f73]">Lines staged: {chips.join(" · ")}. Workbook math stays stubbed.</p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["POSITION", "SHIFT", "MODE", "ST", "OT", "DT", "PD DAYS", "HOURS", "COST", ""].map((header) => (
                <th key={header || "x"} className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={10} className="px-2 py-6 text-sm text-[#5b6f73]">
                  No positions yet. Add a position to start — nothing is prefilled.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#d5e0de] align-top">
                <td className="px-2 py-2">
                  <select
                    value={row.position}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, position: event.target.value } : item)),
                      )
                    }
                    className="paper-field"
                  >
                    <option value="">Select position</option>
                    {POSITIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={row.shift}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, shift: event.target.value } : item)),
                      )
                    }
                    className="paper-field"
                  >
                    <option>Day</option>
                    <option>Night</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={row.mode}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, mode: event.target.value as CraftRow["mode"] } : item,
                        ),
                      )
                    }
                    className="paper-field"
                  >
                    <option>Calendar</option>
                    <option>Manual</option>
                  </select>
                </td>
                <td className="px-2 py-2">{row.st.toLocaleString()}</td>
                <td className="px-2 py-2">{row.ot.toLocaleString()}</td>
                <td className="px-2 py-2">{row.dt.toLocaleString()}</td>
                <td className="px-2 py-2">{row.pd}</td>
                <td className="px-2 py-2">{row.hours.toLocaleString()}</td>
                <td className="px-2 py-2 font-semibold">{row.cost}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirmRemove(row.position || "this position")) {
                        setRows((current) => current.filter((item) => item.id !== row.id));
                      }
                    }}
                    aria-label="Remove estimate row"
                    className="trash-btn"
                  >
                    ⌫
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows
        .filter((row) => row.mode === "Calendar")
        .map((row) => (
          <div key={`${row.id}-cal`} className="mt-4 rounded-xl bg-[#f4f1e8] px-4 py-4">
            <button
              type="button"
              onClick={() => setOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}
              className="flex w-full items-center justify-between text-left"
            >
              <p className="inline-block rounded-full bg-[#eadfc8] px-3 py-1 text-xs font-semibold tracking-[0.14em] text-[#163038]">
                CALENDAR PATTERN · {row.position || "Select position"}
              </p>
              <span className="text-sm text-[#5b6f73]">{open[row.id] ? "▾" : "▸ collapsed"}</span>
            </button>
            {open[row.id] ? (
              <>
                <p className="mt-2 text-xs text-[#5b6f73]">Headcount × shift hours on each selected weekday in the range.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  <label className="text-xs">
                    Start
                    <input
                      type="date"
                      value={row.start}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) => (item.id === row.id ? { ...item, start: event.target.value } : item)),
                        )
                      }
                      className="paper-field mt-1"
                    />
                  </label>
                  <label className="text-xs">
                    End
                    <input
                      type="date"
                      value={row.end}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) => (item.id === row.id ? { ...item, end: event.target.value } : item)),
                        )
                      }
                      className="paper-field mt-1"
                    />
                  </label>
                  <label className="text-xs">
                    Headcount
                    <input
                      type="number"
                      min={1}
                      value={row.headcount}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, headcount: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      className="paper-field mt-1"
                    />
                  </label>
                  <label className="text-xs">
                    Hours / shift
                    <input
                      type="number"
                      min={0}
                      value={row.shiftHours}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, shiftHours: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      className="paper-field mt-1"
                    />
                  </label>
                  <label className="text-xs">
                    Per-diem Headcount
                    <input
                      type="number"
                      min={1}
                      value={row.pdPeople}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, pdPeople: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      className="paper-field mt-1"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(row.id, day)}
                      className={`day-chip ${row.days.includes(day) ? "day-chip-on" : "day-chip-off"}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-right text-xs text-[#5b6f73]">
                  {row.st.toLocaleString()} ST · {row.ot} OT · {row.dt} DT · {row.pd} PD
                </p>
                <button type="button" className="mt-2 text-sm text-steel">
                  + Add date range
                </button>
              </>
            ) : null}
          </div>
        ))}
    </section>
  );
}
