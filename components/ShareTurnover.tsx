"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HandoffDialog } from "@/components/HandoffDialog";
import { useDeskLens } from "@/components/OwnerDeskContext";
import {
  applyReturnLocally,
  applyTransferLocally,
  returnVaultPack,
  shareVaultPack,
  transferVaultPack,
} from "@/lib/estimate-vault-client";
import { canReturnPack, canSharePack, packSharedEmails } from "@/lib/estimate-scope";
import { findHandoffSeat, type HandoffSeat } from "@/lib/handoff";
import { findLocalPack, isLocalPackId } from "@/lib/local-estimates";

export function ShareTurnover({ title, packId }: { title?: string; packId?: string }) {
  const router = useRouter();
  const { lens } = useDeskLens();
  const [open, setOpen] = useState<"share" | "unshare" | "turnover" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pack = packId && isLocalPackId(packId) ? findLocalPack(packId) : null;
  const deskUser = lens ? { email: lens.email, role: lens.role } : null;
  const canShare = Boolean(packId && pack && deskUser && canSharePack(deskUser, pack));
  const canReturn = Boolean(packId && pack && deskUser && canReturnPack(deskUser, pack));
  const sharedWith = (pack ? packSharedEmails(pack) : [])
    .map((email) => findHandoffSeat(email))
    .filter(Boolean) as HandoffSeat[];
  const canHandoff = Boolean(packId && isLocalPackId(packId) && (canShare || !pack));

  return (
    <>
      <button
        type="button"
        title="Share this job. You stay the owner."
        disabled={!canHandoff}
        onClick={() => setOpen("share")}
        className="rounded border border-white/20 px-3 py-1.5 text-white/90 disabled:opacity-40"
      >
        Share
      </button>
      <button
        type="button"
        title="Turn this job over to another person on the desk."
        disabled={!canHandoff}
        onClick={() => setOpen("turnover")}
        className="rounded border border-white/20 px-3 py-1.5 text-white/90 disabled:opacity-40"
      >
        Turn over
      </button>
      {canShare && sharedWith.length ? (
        <button
          type="button"
          title="Stop sharing this job. You stay the owner."
          onClick={async () => {
            if (!packId) return;
            if (sharedWith.length === 1) {
              const person = sharedWith[0];
              const result = await shareVaultPack(packId, person.email, "unshare");
              if (!result.ok) {
                setNote(result.error);
                return;
              }
              setNote(`Stopped sharing with ${person.name}.`);
              return;
            }
            setOpen("unshare");
          }}
          className="rounded border border-white/20 px-3 py-1.5 text-white/90"
        >
          Unshare
        </button>
      ) : null}
      {canReturn ? (
        <button
          type="button"
          title="Send this job back to the previous owner."
          onClick={async () => {
            if (!packId) return;
            const result = await returnVaultPack(packId);
            if (!result.ok) {
              setNote(result.error);
              return;
            }
            applyReturnLocally(true, packId);
            setNote(result.to ? `Returned to ${result.to.name}.` : "Returned.");
            router.push("/jobs");
          }}
          className="rounded border border-white/20 px-3 py-1.5 text-white/90"
        >
          Return
        </button>
      ) : null}
      <HandoffDialog
        title={title || "This job"}
        open={open === "share"}
        heading="Share"
        body={`${title || "This job"} stays on your desk. They can open it and work on it. You stay the owner.`}
        confirmLabel="Share"
        busyLabel="Sharing…"
        onClose={() => setOpen(null)}
        onPick={async (person) => {
          if (!packId) return "That job cannot be shared.";
          const result = await shareVaultPack(packId, person.email);
          if (!result.ok) return result.error;
          setNote(`Shared with ${person.name}. You still own this job.`);
          return null;
        }}
      />
      <HandoffDialog
        title={title || "This job"}
        open={open === "unshare"}
        heading="Unshare"
        body={`${title || "This job"} stays on your desk. They will no longer see it.`}
        confirmLabel="Unshare"
        busyLabel="Unsharing…"
        people={sharedWith}
        onClose={() => setOpen(null)}
        onPick={async (person) => {
          if (!packId) return "That job cannot be unshared.";
          const result = await shareVaultPack(packId, person.email, "unshare");
          if (!result.ok) return result.error;
          setNote(`Stopped sharing with ${person.name}.`);
          return null;
        }}
      />
      <HandoffDialog
        title={title || "This job"}
        open={open === "turnover"}
        onClose={() => setOpen(null)}
        onPick={async (person) => {
          if (!packId) return "That job cannot be turned over.";
          const result = await transferVaultPack(packId, person.email);
          if (!result.ok) return result.error;
          applyTransferLocally(true, packId, { id: packId, title: title || "Working estimate", packId, toName: person.name });
          setNote(`Turned over to ${person.name}. This job is on their desk now.`);
          router.push("/jobs");
          return null;
        }}
      />
      {note ? <p className="max-w-xs text-[11px] text-white/70">{note}</p> : null}
    </>
  );
}
