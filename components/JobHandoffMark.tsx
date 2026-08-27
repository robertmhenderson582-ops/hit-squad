"use client";

import { handoffMarkText, packTransferredToYou } from "@/lib/handoff";

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
  const text = handoffMarkText(pack, email);
  if (!text) return null;
  return (
    <p className={`mt-2 text-sm font-semibold ${packTransferredToYou(pack, email) ? "text-amber-label" : "text-steel"}`}>
      {text}
    </p>
  );
}
