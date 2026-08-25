"use client";

import { useState } from "react";

type Phase = {
  id: string;
  name: string;
  note: string;
  on: boolean;
  start: string;
  stop: string;
  days: number;
  hours: number;
  focus: string;
  preset: string;
};

const STARTER: Phase[] = [
  {
    id: "pre",
    name: "Pre-Turnaround",
    note: "4x10 or 5x8",
    on: true,
    start: "2026-08-21",
    stop: "2026-09-03",
    days: 4,
    hours: 10,
    focus: "",
    preset: "4x10",
  },
  {
    id: "oil-out",
    name: "Oil Out",
    note: "12-hour shifts",
    on: true,
    start: "2026-09-04",
    stop: "2026-09-06",
    days: 7,
    hours: 12,
    focus: "",
    preset: "5x10",
  },
  {
    id: "mech",
    name: "Mechanical Window",
    note: "6x10 boilermakers",
    on: true,
    start: "2026-09-07",
    stop: "2026-09-20",
    days: 6,
    hours: 10,
    focus: "Boilermakers",
    preset: "5x10",
  },
  {
    id: "oil-in",
    name: "Oil In",
    note: "12-hour shifts",
    on: true,
    start: "2026-09-21",
    stop: "2026-09-27",
    days: 7,
    hours: 12,
    focus: "",
    preset: "5x8",
  },
  {
    id: "post",
    name: "Post",
    note: "5x8 back-in",
    on: true,
    start: "2026-09-28",
    stop: "2026-10-05",
    days: 5,
    hours: 8,
    focus: "",
    preset: "5x8",
  },
];

export function PhaseSchedule() {
  const [rows, setRows] = useState(STARTER);

  function applyPreset(id: string, preset: string) {
    const next =
      preset === "4x10" ? { days: 4, hours: 10 } : preset === "5x10" ? { days: 5, hours: 10 } : { days: 5, hours: 8 };
    setRows((current) => current.map((row) => (row.id === id ? { ...row, preset, ...next } : row)));
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl font-semibold text-[#163038]">Phases & work schedules</h2>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#5b6f73]">
        All straight time: 4x10 / 5x8 / 5x10
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["PHASE", "ON", "START", "STOP", "DAYS / WK", "HRS / DAY", "CRAFT FOCUS", "SHIFT"].map((header) => (
                <th key={header} className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#d5e0de]">
                <td className="px-2 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-[#5b6f73]">{row.note}</p>
                </td>
                <td className="px-2 py-3">
                  <input
                    type="checkbox"
                    checked={row.on}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, on: event.target.checked } : item)),
                      )
                    }
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="date"
                    value={row.start}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, start: event.target.value } : item)),
                      )
                    }
                    className="paper-field"
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="date"
                    value={row.stop}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, stop: event.target.value } : item)),
                      )
                    }
                    className="paper-field"
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="number"
                    value={row.days}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, days: Number(event.target.value) } : item)),
                      )
                    }
                    className="paper-field w-20"
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="number"
                    value={row.hours}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, hours: Number(event.target.value) } : item,
                        ),
                      )
                    }
                    className="paper-field w-20"
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    value={row.focus}
                    placeholder="All crafts"
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, focus: event.target.value } : item)),
                      )
                    }
                    className="paper-field"
                  />
                </td>
                <td className="px-2 py-3">
                  <select
                    value={row.preset}
                    onChange={(event) => applyPreset(row.id, event.target.value)}
                    className="paper-field"
                  >
                    <option value="4x10">4x10</option>
                    <option value="5x8">5x8</option>
                    <option value="5x10">5x10</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
