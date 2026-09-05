"use client";

import { useState, type KeyboardEvent } from "react";
import { FieldBlock } from "@/components/FieldMark";
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

function formHasContent(value: QualityDay1, id: QualityFormId) {
  const record = qualityFormRecord(value, id);
  return (
    Object.values(record.fields).some((cell) => cell.trim()) ||
    record.rows.some((row) => Object.values(row.cells).some((cell) => cell.trim()))
  );
}

export function QualityFormScreens({
  value,
  onChange,
  openForm,
}: {
  value: QualityDay1;
  onChange: (next: QualityDay1) => void;
  openForm?: QualityFormId | "";
  onOpenForm?: (id: QualityFormId | "") => void;
}) {
  const firstWithWork = QUALITY_PACKAGE_FORMS.find((item) => formHasContent(value, item.id))?.id ?? QUALITY_PACKAGE_FORMS[0].id;
  const [localOpen] = useState<QualityFormId | "">(firstWithWork);
  const openId = openForm ?? localOpen;
  const shownId = openId || firstWithWork;
  const item = QUALITY_PACKAGE_FORMS.find((form) => form.id === shownId) ?? QUALITY_PACKAGE_FORMS[0];
  const record = qualityFormRecord(value, item.id);
  const headers = QUALITY_FORM_FIELDS[item.id];
  const rowFields = QUALITY_FORM_ROW_FIELDS[item.id];
  const hint = QUALITY_FORM_ROW_HINT[item.id];
  const filled = formHasContent(value, item.id);

  return (
    <section id={`quality-form-${item.id}`} className="plant-card mt-4 px-4 py-4">
      <h3 className="font-display text-lg">{item.label}</h3>
      <p className="mt-1 text-base">{filled ? "Has typed entries" : "Empty — open and type like the 2.7.x workbook."}</p>
      <div className="mt-4">
        {headers.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
    </section>
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
      {hint ? <p className="text-base">{hint}</p> : null}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onAdd} className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white">
          + Add row
        </button>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="field-register-table min-w-full text-left">
          <thead>
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
              <tr className="border-t border-[#c5d4d4]">
                <td colSpan={fields.length + 1} className="px-2 py-4 text-base">
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

export function QualityFormJump({
  onPick,
  activeId,
}: {
  onPick?: (id: QualityFormId) => void;
  activeId?: QualityFormId | "";
}) {
  function onKey(event: KeyboardEvent<HTMLElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key) || !onPick) return;
    event.preventDefault();
    const index = QUALITY_PACKAGE_FORMS.findIndex((item) => item.id === activeId);
    if (event.key === "Home") return onPick(QUALITY_PACKAGE_FORMS[0].id);
    if (event.key === "End") return onPick(QUALITY_PACKAGE_FORMS[QUALITY_PACKAGE_FORMS.length - 1].id);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + QUALITY_PACKAGE_FORMS.length) % QUALITY_PACKAGE_FORMS.length;
    onPick(QUALITY_PACKAGE_FORMS[next].id);
  }

  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Quality forms" role="tablist" onKeyDown={onKey}>
      {QUALITY_PACKAGE_FORMS.map((item) => {
        const selected = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`quality-form-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`quality-form-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onPick?.(item.id)}
            className={`rounded-sm border px-3 py-1.5 text-sm ${
              selected ? "border-steel bg-steel text-white" : "border-steel text-steel"
            }`}
          >
            {item.id === "nde-req" ? "NDE request" : item.id}
          </button>
        );
      })}
    </nav>
  );
}
