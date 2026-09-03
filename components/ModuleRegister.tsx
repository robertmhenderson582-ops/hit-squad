"use client";

import type { ModuleRegisterRow } from "@/lib/quality-hse-modules";

export type RegisterField = { id: string; label: string; kind: "text" | "date" };

export function ModuleRegister({
  id,
  title,
  fields,
  rows,
  onAdd,
  onPatch,
  onRemove,
}: {
  id: string;
  title: string;
  fields: readonly RegisterField[];
  rows: ModuleRegisterRow[];
  onAdd: () => void;
  onPatch: (rowId: string, field: string, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <section id={id} className="plant-card scroll-mt-24 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display text-lg tracking-wide">{title}</h3>
        <button type="button" onClick={onAdd} className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white">
          + Add row
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="font-mono text-[10px] tracking-[0.16em] text-[#5b6f73]">
            <tr>
              {fields.map((field) => (
                <th key={field.id} className="whitespace-nowrap px-2 py-2">
                  {field.label}
                </th>
              ))}
              <th className="px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={fields.length + 1} className="px-2 py-5 text-sm text-[#5b6f73]">
                  Empty. Add a row to type a date or count.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  {fields.map((field) => (
                    <td key={field.id} className="px-2 py-2">
                      <input
                        className="paper-field"
                        type={field.kind === "date" ? "date" : "text"}
                        value={row.cells[field.id] || ""}
                        onChange={(event) => onPatch(row.id, field.id, event.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="text-sm text-[#5b6f73] underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
