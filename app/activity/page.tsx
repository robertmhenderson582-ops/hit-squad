"use client";

import { ActivityDesk } from "@/components/ActivityDesk";
import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { useSession } from "@/components/SessionProvider";

export default function ActivityPage() {
  const { user } = useSession();

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ACTIVITY">
        {user?.role === "owner" ? (
          <ActivityDesk />
        ) : (
          <p className="mt-4 text-[#5b6f73]">Owner desk only. Joseph and testers never see Activity.</p>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
