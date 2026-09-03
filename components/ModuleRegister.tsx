"use client";

import { FieldMark } from "@/components/FieldMark";
import type { ModuleRegisterRow } from "@/lib/quality-hse-modules";

export type RegisterField = { id: string; label: string; kind: "text" | "date" };

export function ModuleRegister({
  id,
  title,
  note,
  fields,
  rows,
  onAdd,
  onPatch,
  onRemove,
}: {
  id: string;
  title: string;
  note?: string;
  fields: readonly RegisterField[];
  rows: ModuleRegisterRow[];
  onAdd: () => void;
  onPatch: (rowId: string, field: string, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <section id={id} className="plant-card scroll-mt-24 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-[#163038]">{title}</h3>
          {note ? <p className="mt-1 text-sm text-[#163038]">{note}</p> : null}
        </div>
        <button type="button" onClick={onAdd} className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white">
          + Add row
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-[#163038]">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id} className="whitespace-nowrap px-2 py-2">
                  <FieldMark>{field.label}</FieldMark>
                </th>
              ))}
              <th className="px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#c5d4d4]">
                <td colSpan={fields.length + 1} className="px-2 py-5 text-sm text-[#163038]">
                  Empty. Add a row to type.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[#c5d4d4]">
                  {fields.map((field) => (
                    <td key={field.id} className="px-2 py-2">
                      <input
                        className="paper-field"
                        type={field.kind === "date" ? "date" : "text"}
                        value={row.cells[field.id] || ""}
                        aria-label={field.label}
                        onChange={(event) => onPatch(row.id, field.id, event.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onRemove(row.id)} className="text-sm text-steel underline">
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
