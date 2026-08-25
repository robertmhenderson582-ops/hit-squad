"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { SitesDesk } from "@/components/SitesDesk";

export default function SitesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="SITES / PLANTS">
        <SitesDesk />
      </DeskChrome>
    </AuthGate>
  );
}
