"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { useLensUser } from "@/components/OwnerDeskContext";
import { SettingsShell } from "@/components/SettingsShell";
import { useSession } from "@/components/SessionProvider";
import { pageAllowedForSeat } from "@/lib/desk-role";

export function SettingsGate({
  ownerOnly,
  buildDesk,
  viewAs,
  children,
}: {
  ownerOnly?: boolean;
  buildDesk?: boolean;
  viewAs?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  const lens = useLensUser();
  const flags = { ownerOnly, buildDesk, viewAs };
  const sessionOk = pageAllowedForSeat(user, flags);
  const lensOk = pageAllowedForSeat(lens, flags);
  const allowed = sessionOk && lensOk;

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="SETTINGS">
        <SettingsShell>
          {allowed ? (
            children
          ) : (
            <section className="plant-card px-5 py-5 text-[#5b6f73]">
              That section is not on this desk.
            </section>
          )}
        </SettingsShell>
      </DeskChrome>
    </AuthGate>
  );
}
