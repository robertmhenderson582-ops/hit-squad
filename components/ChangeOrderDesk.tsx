"use client";

import { useState } from "react";

const SHELLS = ["Log", "Estimate", "SCR"] as const;

export function ChangeOrderDesk() {
  const [shell, setShell] = useState<(typeof SHELLS)[number]>("Log");

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Change-order chrome only. Empty log, estimate, and SCR shells. No FCR math and no mileage
        dollars.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm">
        {SHELLS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setShell(item)}
            className={`rounded px-3 py-1.5 ${shell === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {shell === "Log" ? (
        <section className="plant-card px-4 py-4">
          <h2 className="font-display text-xl tracking-wide">Change-order log</h2>
          <table className="mt-3 min-w-full text-left text-sm">
            <thead className="font-mono text-[10px] tracking-[0.16em] text-[#5b6f73]">
              <tr>
                {["NO.", "ESTIMATE", "SCOPE", "ORIGIN", "STATUS"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={5} className="px-2 py-5 text-sm text-[#5b6f73]">
                  No change orders on this desk.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {shell === "Estimate" ? (
        <section className="plant-card px-4 py-5">
          <h2 className="font-display text-xl tracking-wide">Estimate</h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Empty shell. Pick a package when one is open. Nothing is filed here.
          </p>
        </section>
      ) : null}

      {shell === "SCR" ? (
        <section className="plant-card space-y-3 px-4 py-5">
          <h2 className="font-display text-xl tracking-wide">Scope change request</h2>
          <p className="text-sm text-[#5b6f73]">Empty SCR chrome. Does not file dollars or wire a login.</p>
          <label className="block text-sm">
            Title
            <input className="paper-field mt-1" />
          </label>
          <label className="block text-sm">
            Note
            <textarea rows={4} className="paper-field mt-1" />
          </label>
          <p className="text-xs text-[#5b6f73]">Chrome only — not a filed ticket.</p>
        </section>
      ) : null}
    </div>
  );
}
