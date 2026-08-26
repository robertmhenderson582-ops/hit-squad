"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { DeskChrome } from "@/components/DeskChrome";

export default function SchedulingPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="SCHEDULING">
        <ClosedModuleDesk title="Scheduling" />
      </DeskChrome>
    </AuthGate>
  );
}
