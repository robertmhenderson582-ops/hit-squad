"use client";

import { ModalPortal } from "@/components/ModalPortal";

export function EstimateImportModal({
  title,
  lines,
  applyLabel,
  busy,
  error,
  onCancel,
  onApply,
}: {
  title: string;
  lines: string[];
  applyLabel: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <ModalPortal>
      <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="estimate-import-title">
        <div className="estimate-modal px-6 py-5">
          <h2 id="estimate-import-title" className="font-display text-2xl text-[#163038]">
            {title}
          </h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Preview the workbook, then apply. Excel writes the live estimate pack — never a parallel book.
          </p>
          <ul className="mt-4 max-h-64 space-y-1 overflow-auto text-sm text-[#163038]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {error ? (
            <p className="mt-3 text-sm text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="rounded-lg border border-steel px-4 py-2 text-steel" disabled={busy}>
              Cancel
            </button>
            <button type="button" onClick={onApply} className="rounded-lg bg-steel px-4 py-2 text-white" disabled={busy}>
              {applyLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
