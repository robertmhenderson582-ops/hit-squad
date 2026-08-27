"use client";

import { useState } from "react";
import { HandoffDialog } from "@/components/HandoffDialog";
import { archiveVaultPack, deleteVaultPack, transferVaultPack } from "@/lib/estimate-vault-client";
import { isLocalPackId, deleteLocalPack } from "@/lib/local-estimates";
import { archiveMenuItem, deleteMenuItem, recordTransferredMenuItem, unarchiveMenuItem } from "@/lib/job-menu";
import type { HandoffSeat } from "@/lib/handoff";

export function vaultPackIdOf(id: string, packId?: string) {
  if (packId && isLocalPackId(packId)) return packId;
  if (isLocalPackId(id)) return id;
  if (id.startsWith("job-") && isLocalPackId(id.slice(4))) return id.slice(4);
  return null;
}

export function JobMenuActions({
  id,
  title,
  packId,
  archived = false,
  onChange,
}: {
  id: string;
  title: string;
  packId?: string;
  archived?: boolean;
  onChange?: () => void;
}) {
  const [handoff, setHandoff] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const vaultId = vaultPackIdOf(id, packId);
  const item = { id, title, packId: vaultId || packId };

  async function refresh() {
    onChange?.();
  }

  return (
    <div className="relative z-20 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      {archived ? (
        <button
          type="button"
          className="job-action"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            unarchiveMenuItem(item);
            if (vaultId) void archiveVaultPack(vaultId, false);
            void refresh();
          }}
        >
          RESTORE
        </button>
      ) : (
        <>
          <button
            type="button"
            className="job-action"
            title="Hide this job from the active list. You can find it under Archived."
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              archiveMenuItem(item);
              if (vaultId) void archiveVaultPack(vaultId, true);
              void refresh();
            }}
          >
            ARCHIVE
          </button>
          {vaultId ? (
            <button
              type="button"
              className="job-action"
              title="Turn this job over to another person on the desk."
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setHandoff(true);
              }}
            >
              TURN OVER
            </button>
          ) : null}
        </>
      )}
      <button
        type="button"
        className="job-action"
        title="Remove this job from your list. Confirm first."
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setConfirmDelete(true);
        }}
      >
        DELETE
      </button>
      {note ? <p className="w-full text-[11px] text-[#5b6f73]">{note}</p> : null}
      <HandoffDialog
        title={title}
        open={handoff}
        onClose={() => setHandoff(false)}
        onPick={async (person: HandoffSeat) => {
          if (!vaultId) return "That job cannot be turned over.";
          const result = await transferVaultPack(vaultId, person.email);
          if (!result.ok) return result.error;
          recordTransferredMenuItem({ ...item, toName: person.name });
          deleteLocalPack(vaultId);
          setNote(`Turned over to ${person.name}.`);
          await refresh();
          return null;
        }}
      />
      {confirmDelete ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="estimate-modal px-6 py-5">
            <h2 className="font-display text-2xl text-[#163038]">Delete this job?</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">
              {title} leaves your Jobs list. This only removes your copy. It does not take anyone
              else&apos;s work.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-steel px-4 py-2 text-steel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMenuItem(item);
                  if (vaultId) {
                    void deleteVaultPack(vaultId);
                    deleteLocalPack(vaultId);
                  }
                  setConfirmDelete(false);
                  void refresh();
                }}
                className="rounded-lg bg-steel px-4 py-2 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
