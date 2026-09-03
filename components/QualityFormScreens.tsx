"use client";

import { FieldBlock, FieldMark } from "@/components/FieldMark";
import {
  QUALITY_FORM_FIELDS,
  QUALITY_FORM_ROW_FIELDS,
  QUALITY_FORM_ROW_HINT,
  QUALITY_PACKAGE_FORMS,
  addQualityFormRow,
  patchQualityFormFields,
  patchQualityFormRow,
  qualityFormRecord,
  removeQualityFormRow,
  type QualityDay1,
  type QualityFieldDef,
  type QualityFormId,
} from "@/lib/quality-day1";

function fieldInput(def: QualityFieldDef, value: string, onChange: (next: string) => void) {
  if (def.kind === "yesno") {
    return (
      <select className="paper-field mt-1" value={value === "yes" ? "yes" : value === "no" ? "no" : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Blank</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  return (
    <input
      className="paper-field mt-1"
      type={def.kind === "date" ? "date" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function QualityFormScreens({
  value,
  onChange,
}: {
  value: QualityDay1;
  onChange: (next: QualityDay1) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      {QUALITY_PACKAGE_FORMS.map((item) => {
        const record = qualityFormRecord(value, item.id);
        const headers = QUALITY_FORM_FIELDS[item.id];
        const rowFields = QUALITY_FORM_ROW_FIELDS[item.id];
        const hint = QUALITY_FORM_ROW_HINT[item.id];
        return (
          <section key={item.id} id={`quality-form-${item.id}`} className="rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-4 py-4">
            <h3 className="font-display text-lg text-[#163038]">{item.label}</h3>
            <p className="mt-1 text-sm text-[#163038]">Type this form. Files stay off this desk.</p>
            {headers.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {headers.map((field) => (
                  <FieldBlock key={field.id} label={field.label}>
                    {fieldInput(field, record.fields[field.id] || "", (next) => onChange(patchQualityFormFields(value, item.id, field.id, next)))}
                  </FieldBlock>
                ))}
              </div>
            ) : null}
            {rowFields.length ? (
              <FormRows
                formId={item.id}
                hint={hint}
                fields={rowFields}
                rows={record.rows}
                onAdd={() => onChange(addQualityFormRow(value, item.id))}
                onPatch={(rowId, field, next) => onChange(patchQualityFormRow(value, item.id, rowId, field, next))}
                onRemove={(rowId) => onChange(removeQualityFormRow(value, item.id, rowId))}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function FormRows({
  formId,
  hint,
  fields,
  rows,
  onAdd,
  onPatch,
  onRemove,
}: {
  formId: QualityFormId;
  hint?: string;
  fields: readonly QualityFieldDef[];
  rows: Array<{ id: string; cells: Record<string, string> }>;
  onAdd: () => void;
  onPatch: (rowId: string, field: string, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <div className="mt-4">
      {hint ? <p className="text-sm text-[#163038]">{hint}</p> : null}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onAdd} className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white">
          + Add row
        </button>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-[#163038]">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id} className="whitespace-nowrap px-2 py-2 font-semibold text-[#163038]">
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
              <tr className="border-t border-[#c5d4d4]">
                <td colSpan={fields.length + 1} className="px-2 py-4 text-sm text-[#163038]">
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
                        aria-label={`${formId} ${field.label}`}
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
    </div>
  );
}

export function QualityFormJump({ onPick }: { onPick?: (id: QualityFormId) => void }) {
  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Quality forms">
      {QUALITY_PACKAGE_FORMS.map((item) => (
        <a
          key={item.id}
          href={`#quality-form-${item.id}`}
          onClick={() => onPick?.(item.id)}
          className="rounded-sm border border-steel px-3 py-1.5 text-sm text-steel"
        >
          {item.id === "nde-req" ? "NDE request" : item.id}
        </a>
      ))}
    </nav>
  );
}

