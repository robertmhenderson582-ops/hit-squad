"use client";

import { CatalogPick } from "@/components/CatalogPick";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { CRAFT_POSITIONS, SUPPORT_DUTIES } from "@/lib/craft-labor";

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

  function addPosition() {
    onRows((current) => [...current, { id: uid(), position: "", billedAs: "" }]);
  }

  function patch(id: string, patch: Partial<SupportLine>) {
    onRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-[#5b6f73]">No support positions yet.</p>
        ) : (
          <>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-3 text-xs tracking-[0.12em] text-[#5b6f73]">
            <p>POSITION</p>
            <p>BILLED AS</p>
            <p />
          </div>
          {rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[#d5e0de] px-3 py-3"
            >
              <CatalogPick
                label="Position"
                value={row.position}
                options={SUPPORT_DUTIES}
                placeholder="Select position"
                onChange={(position) => patch(row.id, { position })}
                allowCustom
              />
              <CatalogPick
                label="Billed as"
                value={row.billedAs}
                options={CRAFT_POSITIONS}
                placeholder="Select billed as"
                onChange={(billedAs) => patch(row.id, { billedAs })}
                allowCustom
              />
              <button type="button" onClick={() => void remove(row)} className="text-sm text-[#b74120]">
                Remove
              </button>
            </article>
          ))}
          </>
        )}
      </div>
    </section>
  );
}
