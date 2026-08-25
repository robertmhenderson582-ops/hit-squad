"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { SettingsShell } from "@/components/SettingsShell";
import { useSession } from "@/components/SessionProvider";

export function SettingsGate({
  ownerOnly,
  children,
}: {
  ownerOnly?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  const allowed = !ownerOnly || user?.role === "owner";

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="SETTINGS">
        <SettingsShell>
          {allowed ? (
            children
          ) : (
            <section className="plant-card px-5 py-5 text-[#5b6f73]">
              That section stays with the owner. Sign-in, Users, Follow, and Activity stay yours.
            </section>
          )}
        </SettingsShell>
      </DeskChrome>
    </AuthGate>
  );
}
