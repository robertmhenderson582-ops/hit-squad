"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { InboxDesk } from "@/components/InboxDesk";

export default function InboxPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="INBOX" hideTitle>
        <InboxDesk />
      </DeskChrome>
    </AuthGate>
  );
}
