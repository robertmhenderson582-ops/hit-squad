"use client";

import { useState } from "react";
import { HandoffDialog } from "@/components/HandoffDialog";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { useHandoffPeople } from "@/components/useDeskPeople";
import {
  applyReturnLocally,
  applyTransferLocally,
  archiveVaultPack,
  deleteVaultPack,
  returnVaultPack,
  shareVaultPack,
  transferVaultPack,
} from "@/lib/estimate-vault-client";
import { canReturnPack, canSharePack, packSharedEmails } from "@/lib/estimate-scope";
import { findHandoffSeat, type HandoffSeat } from "@/lib/handoff";
import { findDeskPack } from "@/lib/lens-packs";
import { isLocalPackId, deleteLocalPack } from "@/lib/local-estimates";
import { archiveMenuItem, deleteMenuItem, unarchiveMenuItem } from "@/lib/job-menu";

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
  const { lens, seat } = useDeskLens();
  const extras = useHandoffPeople();
  const [handoff, setHandoff] = useState<"share" | "unshare" | "turnover" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const vaultId = vaultPackIdOf(id, packId);
  const item = { id, title, packId: vaultId || packId };
  const pack = vaultId ? findDeskPack(vaultId, seat) : null;
  const deskUser = lens ? { email: lens.email, role: lens.role } : null;
  const sharedEmails = pack ? packSharedEmails(pack) : [];
  const canShare = Boolean(deskUser && pack && canSharePack(deskUser, pack));
  const canReturn = Boolean(deskUser && pack && canReturnPack(deskUser, pack));
  const sharedWith = sharedEmails.map((email) => findHandoffSeat(email, extras) ?? { name: email, email }) as HandoffSeat[];

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
          {vaultId && canShare ? (
            <button
              type="button"
              className="job-action"
              title="Share this job. You stay the owner."
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setHandoff("share");
              }}
            >
              SHARE
            </button>
          ) : null}
          {vaultId && canShare && sharedWith.length ? (
            <button
              type="button"
              className="job-action"
              title="Stop sharing this job. You stay the owner."
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!vaultId) return;
                if (sharedWith.length === 1) {
                  const person = sharedWith[0];
                  const result = await shareVaultPack(vaultId, person.email, "unshare");
                  if (!result.ok) {
                    setNote(result.error);
                    return;
                  }
                  setNote(`Stopped sharing with ${person.name}.`);
                  await refresh();
                  return;
                }
                setHandoff("unshare");
              }}
            >
              UNSHARE
            </button>
          ) : null}
          {vaultId && canShare ? (
            <button
              type="button"
              className="job-action"
              title="Turn this job over to another person on the desk."
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setHandoff("turnover");
              }}
            >
              TURN OVER
            </button>
          ) : null}
          {vaultId && canReturn ? (
            <button
              type="button"
              className="job-action"
              title="Send this job back to the previous owner."
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!vaultId) return;
                const result = await returnVaultPack(vaultId);
                if (!result.ok) {
                  setNote(result.error);
                  return;
                }
                applyReturnLocally(true, vaultId);
                setNote(result.to ? `Returned to ${result.to.name}.` : "Returned.");
                await refresh();
              }}
            >
              RETURN
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
        open={handoff === "share"}
        heading="Share"
        body={`${title} stays on your desk. They can open it and work on it. You stay the owner.`}
        confirmLabel="Share"
        busyLabel="Sharing…"
        onClose={() => setHandoff(null)}
        onPick={async (person: HandoffSeat) => {
          if (!vaultId) return "That job cannot be shared.";
          const result = await shareVaultPack(vaultId, person.email);
          if (!result.ok) return result.error;
          setNote(`Shared with ${person.name}. You still own this job.`);
          await refresh();
          return null;
        }}
      />
      <HandoffDialog
        title={title}
        open={handoff === "unshare"}
        heading="Unshare"
        body={`${title} stays on your desk. They will no longer see it.`}
        confirmLabel="Unshare"
        busyLabel="Unsharing…"
        people={sharedWith}
        onClose={() => setHandoff(null)}
        onPick={async (person: HandoffSeat) => {
          if (!vaultId) return "That job cannot be unshared.";
          const result = await shareVaultPack(vaultId, person.email, "unshare");
          if (!result.ok) return result.error;
          setNote(`Stopped sharing with ${person.name}.`);
          await refresh();
          return null;
        }}
      />
      <HandoffDialog
        title={title}
        open={handoff === "turnover"}
        onClose={() => setHandoff(null)}
        onPick={async (person: HandoffSeat) => {
          if (!vaultId) return "That job cannot be turned over.";
          const result = await transferVaultPack(vaultId, person.email);
          if (!result.ok) return result.error;
          applyTransferLocally(true, vaultId, { ...item, toName: person.name });
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
