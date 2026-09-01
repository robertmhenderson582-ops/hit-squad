"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { InboxDesk } from "@/components/InboxDesk";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canUseInbox } from "@/lib/inbox-circle";

export default function InboxPage() {
  const lens = useLensUser();
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="INBOX" hideTitle>
        {canUseInbox(lens) ? (
          <InboxDesk />
        ) : (
          <section className="plant-card px-5 py-5 text-[#5b6f73]">Inbox is those six only.</section>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
