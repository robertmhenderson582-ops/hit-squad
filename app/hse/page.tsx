"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { HseDesk } from "@/components/HseDesk";
import { ModuleGate } from "@/components/ModuleGate";

export default function HsePage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="HSE">
        <ModuleGate need="hse">
          <HseDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
