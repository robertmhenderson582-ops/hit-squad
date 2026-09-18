"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { OnboardDesk } from "@/components/OnboardDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function OnboardPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="ONBOARD">
        <OnboardDesk />
      </DeskChrome>
    </AuthGate>
  );
}
