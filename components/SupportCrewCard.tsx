"use client";

import { useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";

export type SupportLine = {
  id: string;
  position: string;
  billedAs: string;
};

function uid() {
  return `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function SupportCrewCard({
  rows,
  onRows,
}: {
  rows: SupportLine[];
  onRows: (next: SupportLine[] | ((current: SupportLine[]) => SupportLine[])) => void;
}) {
  const confirmRemove = useConfirmRemove();
  const [draft, setDraft] = useState({ position: "", billedAs: "" });

  function addPosition() {
    onRows((current) => [
      ...current,
      { id: uid(), position: draft.position.trim(), billedAs: draft.billedAs.trim() },
    ]);
    setDraft({ position: "", billedAs: "" });
  }

  async function remove(row: SupportLine) {
    if (
      !(await confirmRemove(row.position || "this position", {
        title: "Remove this position?",
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    onRows((current) => current.filter((item) => item.id !== row.id));
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Support</h2>
          <p className="text-sm text-[#5b6f73]">
            Position is the duty. Billed as is the craft rate. Direct Craft stays on its own card.
          </p>
        </div>
        <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
          + Add position
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Position
          <input
            value={draft.position}
            onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))}
            className="paper-field mt-1"
            placeholder="Tool Room Attendant"
          />
        </label>
        <label className="text-xs">
          Billed as
          <input
            value={draft.billedAs}
            onChange={(event) => setDraft((current) => ({ ...current, billedAs: event.target.value }))}
            className="paper-field mt-1"
            placeholder="Boilermaker Journeyman"
          />
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-[#5b6f73]">No support positions yet.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d5e0de] px-3 py-2">
              <p className="text-sm text-[#163038]">
                <span className="font-semibold">{row.position || "Position"}</span>
                <span className="text-[#5b6f73]"> · billed as {row.billedAs || "—"}</span>
              </p>
              <button type="button" onClick={() => void remove(row)} className="text-sm text-[#b74120]">
                Remove
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
