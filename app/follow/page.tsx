"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ModuleGate } from "@/components/ModuleGate";

export default function FollowPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="FOLLOW">
        <ModuleGate need="follow">
          <p className="mt-4 max-w-3xl text-sm leading-6 text-paper-cream/80">
            Owner follow rail. Testers never see this.
          </p>
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
