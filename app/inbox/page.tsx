"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { HiddenInboxRedirect } from "@/components/HiddenInboxRedirect";
import { InboxDesk } from "@/components/InboxDesk";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { canSeeInboxUi } from "@/lib/inbox-circle";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function InboxPage() {
  const lens = useLensUser();
  const desk = useOwnerDesk();
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <HiddenInboxRedirect />
      <DeskChrome title="INBOX" hideTitle>
        {canSeeInboxUi(lens, desk?.showInboxSuggestionBox) ? (
          <InboxDesk />
        ) : (
          <section className="plant-card px-5 py-5 text-[#5b6f73]">Inbox is the Madison circle on this desk.</section>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
