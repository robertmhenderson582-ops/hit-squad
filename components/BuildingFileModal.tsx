"use client";

import { ModalPortal } from "@/components/ModalPortal";

export const BUILDING_FILE_TITLE = "Building file…";
export const BUILDING_FILE_STATUS =
  "Building the estimate Excel package — big jobs can take a minute";

/**
 * Non-dismissible while the estimate client Excel package is generating.
 * On failure the overlay stays until Close — success clears it from the caller.
 */
export function BuildingFileModal({
  error,
  onDismissError,
}: {
  error?: string;
  onDismissError?: () => void;
}) {
  const failed = Boolean(error);
  return (
    <ModalPortal>
      <div
        className="modal-scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="building-file-title"
        aria-describedby="building-file-status"
        aria-busy={!failed}
        aria-live="polite"
      >
        <div className="estimate-modal px-6 py-6">
          <div className="flex flex-col items-center text-center">
            {!failed ? (
              <span className="hs-hold-spin" aria-hidden="true" />
            ) : null}
            <h2
              id="building-file-title"
              className={`font-display text-2xl text-[#0F5F6D] ${failed ? "" : "mt-4"}`}
            >
              {failed ? "Could not export" : BUILDING_FILE_TITLE}
            </h2>
            <p id="building-file-status" className="mt-2 text-sm text-[#5b6f73]">
              {error || BUILDING_FILE_STATUS}
            </p>
            {failed && onDismissError ? (
              <button
                type="button"
                onClick={onDismissError}
                className="mt-5 rounded-lg bg-[#0F5F6D] px-4 py-2 text-white"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
