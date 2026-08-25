"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ModuleGate } from "@/components/ModuleGate";

export default function ActivityPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ACTIVITY">
        <ModuleGate need="activity">
          <p className="mt-4 max-w-3xl text-sm leading-6 text-paper-cream/80">
            Owner activity rail. Testers never see this or each other.
          </p>
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
