"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { SettingsShell } from "@/components/SettingsShell";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { VIEW_AS_HIDDEN_SETTINGS } from "@/lib/owner-desk";

const HIDE_WHILE_VIEWING = new Set<string>(VIEW_AS_HIDDEN_SETTINGS);

export function SettingsGate({
  ownerOnly,
  buildDesk,
  children,
}: {
  ownerOnly?: boolean;
  buildDesk?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  const pathname = usePathname();
  const desk = useOwnerDesk();
  const viewingAs = Boolean(desk?.viewAs && desk.viewAs !== "owner");
  const hidden = viewingAs && HIDE_WHILE_VIEWING.has(pathname);
  const roleOk = ownerOnly ? isOwner(user) : buildDesk ? hasBuildDesk(user) : true;
  const allowed = roleOk && !hidden;

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
