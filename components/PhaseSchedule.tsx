"use client";

import { useState } from "react";
import { GripToPan } from "@/components/GripToPan";

type Phase = {
  id: string;
  name: string;
  note: string;
  on: boolean;
  start: string;
  stop: string;
  days: number;
  hours: number;
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
  },
];

export function PhaseSchedule() {
  const [rows, setRows] = useState(STARTER);

  function patch(id: string, next: Partial<Phase>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl font-semibold text-[#163038]">Phases & work schedule</h2>
      <GripToPan className="mt-4">
        <table className="min-w-max text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["PHASE", "ON", "START", "STOP", "DAYS / WK", "HRS / DAY"].map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#d5e0de]">
                <td className="whitespace-nowrap px-2 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-[#5b6f73]">{row.note}</p>
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <input
                    type="checkbox"
                    checked={row.on}
                    onChange={(event) => patch(row.id, { on: event.target.checked })}
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <input
                    type="date"
                    value={row.start}
                    onChange={(event) => patch(row.id, { start: event.target.value })}
                    className="paper-field"
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <input
                    type="date"
                    value={row.stop}
                    onChange={(event) => patch(row.id, { stop: event.target.value })}
                    className="paper-field"
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <input
                    type="number"
                    min={0}
                    max={7}
                    value={row.days}
                    onChange={(event) =>
                      patch(row.id, { days: Math.min(7, Math.max(0, Number(event.target.value) || 0)) })
                    }
                    className="paper-field w-20"
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <input
                    type="number"
                    min={0}
                    value={row.hours}
                    onChange={(event) => patch(row.id, { hours: Math.max(0, Number(event.target.value) || 0) })}
                    className="paper-field w-20"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GripToPan>
    </section>
  );
}
