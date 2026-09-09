"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { SettingsShell } from "@/components/SettingsShell";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk, pageAllowedForSeat } from "@/lib/desk-role";
import type { PrivilegeId } from "@/lib/privileges";

export function SettingsGate({
  ownerOnly,
  buildDesk,
  viewAs,
  workingDesk,
  addUsers,
  privilege,
  children,
}: {
  ownerOnly?: boolean;
  buildDesk?: boolean;
  viewAs?: boolean;
  workingDesk?: boolean;
  addUsers?: boolean;
  privilege?: PrivilegeId;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  const lens = useLensUser();
  const desk = useOwnerDesk();
  const flags = { ownerOnly, buildDesk, viewAs, workingDesk, addUsers, privilege };
  const sessionOk = pageAllowedForSeat(user, flags);
  const lensOk = pageAllowedForSeat(lens, flags);
  const waiting = Boolean(
    hasBuildDesk(user) && desk && !desk.lensReady && (ownerOnly || buildDesk || viewAs || workingDesk || addUsers || privilege),
  );
  const allowed = sessionOk && lensOk && !waiting;

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
