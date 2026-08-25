"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ModuleGate } from "@/components/ModuleGate";
import { SitesDesk } from "@/components/SitesDesk";

export default function SitesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="SITES / PLANTS">
        <ModuleGate need="sites">
          <SitesDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
