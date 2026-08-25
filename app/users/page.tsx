"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { UsersAdmin } from "@/components/UsersAdmin";
import { useSession } from "@/components/SessionProvider";

export default function UsersPage() {
  const { user } = useSession();

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="USERS">
        {user?.role === "owner" ? (
          <UsersAdmin />
        ) : (
          <p className="mt-4 text-paper-cream/80">Owner desk only.</p>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
