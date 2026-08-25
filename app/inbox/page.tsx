"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { InboxDesk } from "@/components/InboxDesk";
import { useSession } from "@/components/SessionProvider";

export default function InboxPage() {
  const { user } = useSession();

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="INBOX" hideTitle>
        {user?.role === "owner" ? (
          <InboxDesk />
        ) : (
          <p className="mt-4 text-[#5b6f73]">Owner desk only. Testers do not see each other.</p>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
