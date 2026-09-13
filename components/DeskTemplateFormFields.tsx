"use client";

import type { QualityFieldDef } from "@/lib/quality-day1";

export function deskTemplateFieldClass(viewOnly: boolean, extra = "") {
  return ["paper-field", viewOnly ? "paper-field-view" : "", extra].filter(Boolean).join(" ");
}

export function DeskTemplateFieldInput({
  def,
  value,
  viewOnly,
  onChange,
  className = "mt-1",
}: {
  def: QualityFieldDef;
  value: string;
  viewOnly: boolean;
  onChange: (next: string) => void;
  className?: string;
}) {
  const fieldClass = deskTemplateFieldClass(viewOnly, className);
  if (def.kind === "yesno") {
    return (
      <select
        className={fieldClass}
        value={value === "yes" ? "yes" : value === "no" ? "no" : ""}
        disabled={viewOnly}
        aria-readonly={viewOnly || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{viewOnly ? "—" : "Blank"}</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  return (
    <input
      className={fieldClass}
      type={def.kind === "date" && (!viewOnly || value) ? "date" : "text"}
      value={value}
      placeholder={viewOnly ? "—" : undefined}
      readOnly={viewOnly}
      disabled={viewOnly}
      aria-readonly={viewOnly || undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function DeskTemplateFormRows({
  hint,
  fields,
  rows,
  viewOnly,
  onAdd,
  onPatch,
  onRemove,
}: {
  hint?: string;
  fields: readonly QualityFieldDef[];
  rows: Array<{ id: string; cells: Record<string, string> }>;
  viewOnly: boolean;
  onAdd: () => void;
  onPatch: (rowId: string, field: string, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <div className="mt-4">
      {hint && !viewOnly ? <p className="text-sm text-[#5b6f73]">{hint}</p> : null}
      {!viewOnly ? (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onAdd} className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white">
            + Add row
          </button>
        </div>
      ) : null}
      <div className="mt-2 overflow-x-auto">
        <table className="field-register-table min-w-full text-left">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id} className="whitespace-nowrap px-2 py-2">
                  {field.label}
                </th>
              ))}
              {!viewOnly ? (
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#c5d4d4]">
                <td colSpan={fields.length + (viewOnly ? 0 : 1)} className="px-2 py-4 text-sm text-[#5b6f73]">
                  {viewOnly ? "No rows on this form." : "Empty. Add a row to type."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[#c5d4d4]">
                  {fields.map((field) => (
                    <td key={field.id} className="px-2 py-2">
                      <DeskTemplateFieldInput
                        def={field}
                        value={row.cells[field.id] || ""}
                        viewOnly={viewOnly}
                        className=""
                        onChange={(next) => onPatch(row.id, field.id, next)}
                      />
                    </td>
                  ))}
                  {!viewOnly ? (
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => onRemove(row.id)} className="text-sm text-steel underline">
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
