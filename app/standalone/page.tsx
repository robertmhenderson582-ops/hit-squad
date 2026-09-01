"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { StandaloneDesk } from "@/components/StandaloneDesk";

export default function StandalonePage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="STANDALONE">
        <StandaloneDesk />
      </DeskChrome>
    </AuthGate>
  );
}
