"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { OnboardDesk } from "@/components/OnboardDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";
import { CONTROL_CENTER_CHROME } from "@/lib/onboard-pipeline";

export default function OnboardPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title={CONTROL_CENTER_CHROME}>
        <OnboardDesk />
      </DeskChrome>
    </AuthGate>
  );
}
