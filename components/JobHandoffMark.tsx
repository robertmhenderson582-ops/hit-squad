"use client";

import { packSharedWithYou, packTransferredToYou, sharedWithNames, transferredFromLabel } from "@/lib/handoff";
import { packSharedEmails } from "@/lib/estimate-scope";

export type HandoffPack = {
  ownerEmail?: string;
  sharedWith?: string[];
  transferredFrom?: string;
  transferredTo?: string;
  transferredFromName?: string;
  transferredToName?: string;
};

export function JobHandoffMark({
  pack,
  email,
}: {
  pack?: HandoffPack | null;
  email?: string;
}) {
  if (!pack || !email) return null;
  if (packTransferredToYou(pack, email)) {
    return (
      <p className="mt-2 text-sm font-semibold text-amber-label">
        Transferred to you from {transferredFromLabel(pack)}.
      </p>
    );
  }
  if (packSharedWithYou(pack, email)) {
    return <p className="mt-2 text-sm font-semibold text-steel">Shared. You can work on this job.</p>;
  }
  const names = sharedWithNames(packSharedEmails(pack));
  if (names.length && pack.ownerEmail?.trim().toLowerCase() === email.trim().toLowerCase()) {
    return <p className="mt-2 text-sm font-semibold text-steel">Shared with {names.join(", ")}.</p>;
  }
  return null;
}
