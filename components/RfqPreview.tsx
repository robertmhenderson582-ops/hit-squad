"use client";

import { useEffect } from "react";
import type { StaffingLine } from "@/lib/types";

export function RfqPreview({
  client,
  name,
  total,
  staffing,
  onClose,
}: {
  client: string;
  name: string;
  total?: string;
  staffing?: StaffingLine[];
  onClose: () => void;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.print;
    root.dataset.print = "day";
    return () => {
      if (previous) root.dataset.print = previous;
      else delete root.dataset.print;
    };
  }, []);

  return (
    <div className="rfq-scrim print-hide">
      <div className="rfq-sheet">
        <div className="flex items-start justify-between gap-3 print-hide">
          <p className="text-xs tracking-[0.18em] text-[#5b6f73]">RFQ / PRINT PREVIEW — ALWAYS DAY</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-steel px-3 py-2 text-white">
              Print
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-steel px-3 py-2 text-steel">
              Close
            </button>
          </div>
        </div>
        <p className="mt-6 text-xs tracking-[0.2em] text-[#5b6f73]">HIT SQUAD PROJECT CONTROLS</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-[#163038]">{name}</h2>
        <p className="mt-2 text-[#5b6f73]">{client}</p>
        {total ? <p className="mt-6 text-2xl text-[#163038]">{total}</p> : null}
        {staffing?.length ? (
          <section className="mt-6">
            <p className="text-xs tracking-[0.18em] text-[#5b6f73]">SUPPORT / STAFFING</p>
            <table className="mt-2 min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="py-2 pr-4">DUTY</th>
                  <th className="py-2">BILLED AS</th>
                </tr>
              </thead>
              <tbody>
                {staffing.map((row) => (
                  <tr key={row.id} className="border-t border-[#d5e0de]">
                    <td className="py-2 pr-4">{row.position}</td>
                    <td className="py-2">{row.billedAs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        <p className="mt-6 text-sm text-[#5b6f73]">
          Paper white letter. Night desk does not change this sheet.
        </p>
      </div>
    </div>
  );
}
