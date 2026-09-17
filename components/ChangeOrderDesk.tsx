"use client";

import { useState } from "react";
import {
  CHANGE_ORDER_SHELLS,
  CHANGE_ORDER_SHELL_LABELS,
  DEFAULT_CHANGE_ORDER_SHELL,
  type ChangeOrderShell,
} from "@/lib/change-order-packet";

export function ChangeOrderDesk() {
  const [shell, setShell] = useState<ChangeOrderShell>(DEFAULT_CHANGE_ORDER_SHELL);

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Standalone Change Orders list is parked. The V1 packet lives on the estimate Change
        Orders tab — SCR Log plus Estimate workbook. Mileage Yes is a flat $2,500, not times
        headcount.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="SCR packet">
        {CHANGE_ORDER_SHELLS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setShell(item)}
            className={`rounded px-3 py-1.5 ${shell === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {CHANGE_ORDER_SHELL_LABELS[item]}
          </button>
        ))}
      </nav>

      {shell === "Log" ? (
        <section className="plant-card px-4 py-4">
          <h2 className="font-display text-xl tracking-wide">SCR Log</h2>
          <table className="mt-3 min-w-full text-left text-sm">
            <thead className="font-mono text-[10px] tracking-[0.16em] text-[#5b6f73]">
              <tr>
                {["SCR #", "REQUEST DATE", "REQUESTED BY", "STATUS", "SCOPE CHANGE DESCRIPTION"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={5} className="px-2 py-5 text-sm text-[#5b6f73]">
                  No submitted SCRs on this desk.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {shell === "Estimate" ? (
        <section className="plant-card px-4 py-5">
          <h2 className="font-display text-xl tracking-wide">Estimate workbook</h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Empty shell. Pick a package when one is open. Submit from the estimate Change Orders
            tab posts a row on the SCR Log.
          </p>
        </section>
      ) : null}
    </div>
  );
}
