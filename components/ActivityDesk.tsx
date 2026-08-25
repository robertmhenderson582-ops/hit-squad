"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { GripToPan } from "@/components/GripToPan";
import type { ActivityKind, ActivityRow } from "@/lib/owner-desk";

const KIND: Record<ActivityKind, string> = {
  "sign-in": "SIGN-IN OK",
  failed: "SIGN-IN FAIL",
  session: "SESSION",
  feature: "FEATURE",
  error: "ERROR",
};

function when(at: number) {
  return new Date(at).toLocaleString("en-GB", { hour12: false });
}

export function ActivityDesk() {
  const confirmRemove = useConfirmRemove();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/desk/activity", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Activity stayed on this desk.");
      return;
    }
    setError(null);
    setRows(data.rows ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(body: { id?: string; olderThanDays?: number; clear?: boolean }, title: string, name: string) {
    if (!(await confirmRemove(name, { title, confirmLabel: "Delete" }))) return;
    const response = await fetch("/api/desk/activity", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) setRows(data.rows ?? []);
  }

  function download(kind: "csv" | "json") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      saveBlob(blob, `hit-squad-activity-${stamp}.json`);
      return;
    }
    const header = "when,kind,who,detail";
    const lines = rows.map((row) =>
      [when(row.at), row.kind, row.who, row.detail].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    );
    saveBlob(new Blob([[header, ...lines].join("\n")], { type: "text/csv" }), `hit-squad-activity-${stamp}.csv`);
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Activity</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Owner ledger only. Sign-in ok / fail (username they typed — password never stored),
          sessions (start → last screen → sign-out/idle), feature trail (Home, Crew, import, export,
          save rates, ticket — not every keystroke), and unhandled errors. Kept 30 days. Testers
          never see this page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
            Refresh
          </button>
          <button type="button" onClick={() => download("csv")} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
            Download CSV
          </button>
          <button type="button" onClick={() => download("json")} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
            Download JSON
          </button>
          <button
            type="button"
            onClick={() => void remove({ olderThanDays: 7 }, "Delete older than 7 days?", "Rows older than 7 days leave the ledger.")}
            className="rounded-lg border border-steel px-3 py-2 text-sm text-steel"
          >
            Delete older than 7 days
          </button>
          <button
            type="button"
            onClick={() => void remove({ clear: true }, "Clear log?", "The whole ledger clears. Tickets stay.")}
            className="rounded-lg border border-[#b74120] px-3 py-2 text-sm text-[#b74120]"
          >
            Clear log
          </button>
        </div>
      </section>
      <section className="plant-card overflow-hidden px-5 py-5">
        {error ? <p className="text-amber-flare">{error}</p> : null}
        <GripToPan>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
              <tr>
                {["WHEN", "KIND", "WHO", "DETAIL", ""].map((header) => (
                  <th key={header || "x"} className="whitespace-nowrap px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-sm text-[#5b6f73]">
                    Ledger is empty. Demo owner rows appear only on a fresh desk.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#d5e0de]">
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{when(row.at)}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] tracking-[0.12em] ${
                          row.kind === "failed" || row.kind === "error"
                            ? "bg-[#eadfc8] text-[#8a3d12]"
                            : "bg-[#dce6e4] text-steel"
                        }`}
                      >
                        {KIND[row.kind]}
                      </span>
                    </td>
                    <td className="px-2 py-2">{row.who}</td>
                    <td className="px-2 py-2">{row.detail}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void remove({ id: row.id }, "Remove this row?", row.detail)}
                        className="text-sm text-[#b74120]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </GripToPan>
      </section>
    </div>
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
