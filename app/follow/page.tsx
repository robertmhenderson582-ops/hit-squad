"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { FollowDesk } from "@/components/FollowDesk";
import { useSession } from "@/components/SessionProvider";

export default function FollowPage() {
  const { user } = useSession();

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="FOLLOW">
        {user?.role === "owner" ? (
          <FollowDesk />
        ) : (
          <p className="mt-4 text-[#5b6f73]">Owner desk only. Joseph cannot use Follow.</p>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
