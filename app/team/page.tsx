"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { DeskChrome } from "@/components/DeskChrome";

export default function TeamPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="TEAM">
        <ClosedModuleDesk title="Team" />
      </DeskChrome>
    </AuthGate>
  );
}
