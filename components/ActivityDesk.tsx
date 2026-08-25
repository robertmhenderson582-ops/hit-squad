"use client";

import { useEffect, useState } from "react";
import type { ActivityRow } from "@/lib/owner-desk";

const KIND: Record<ActivityRow["kind"], string> = {
  "sign-in": "SIGN-IN",
  failed: "FAILED PASSWORD",
  feature: "FEATURE",
};

export function ActivityDesk() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/desk/activity", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setRows(data.rows ?? []);
      })
      .catch(() => setError("Activity stayed on this desk."));
  }, []);

  return (
    <div className="mt-5 space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Activity</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Owner ledger only. Sign-in, failed passwords, and the feature trail. Joseph and testers
          never see this page.
        </p>
      </section>
      <section className="plant-card overflow-hidden px-5 py-5">
        {error ? <p className="text-amber-flare">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
              <tr>
                {["WHEN", "KIND", "WHO", "DETAIL"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${index}`} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2 font-mono text-xs">{row.at}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] tracking-[0.12em] ${
                        row.kind === "failed" ? "bg-[#eadfc8] text-[#8a3d12]" : "bg-[#dce6e4] text-steel"
                      }`}
                    >
                      {KIND[row.kind]}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.who}</td>
                  <td className="px-2 py-2">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
