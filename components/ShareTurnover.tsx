"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HandoffDialog } from "@/components/HandoffDialog";
import { applyTransferLocally, transferVaultPack } from "@/lib/estimate-vault-client";
import { isLocalPackId } from "@/lib/local-estimates";

export function ShareTurnover({ title, packId }: { title?: string; packId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<"share" | "turnover" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canTurnOver = Boolean(packId && isLocalPackId(packId));

  return (
    <>
      <button
        type="button"
        title="Share this estimate. Owner stays owner."
        onClick={() => setOpen("share")}
        className="rounded border border-white/20 px-3 py-1.5 text-white/90"
      >
        Share
      </button>
      <button
        type="button"
        title="Turn this job over to another person on the desk."
        disabled={!canTurnOver}
        onClick={() => setOpen("turnover")}
        className="rounded border border-white/20 px-3 py-1.5 text-white/90 disabled:opacity-40"
      >
        Turn over
      </button>
      {open === "share" ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="estimate-modal px-6 py-5">
            <h2 className="font-display text-2xl text-[#163038]">Share</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">
              Look only. Owner stays owner. {title || "This job"} stays on this desk.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNote("Shared. Owner stays owner.");
                  setOpen(null);
                }}
                className="rounded-lg bg-steel px-4 py-2 text-white"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
