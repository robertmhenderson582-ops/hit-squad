"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RateVaultDesk } from "@/components/RateVaultDesk";
import { RateVaultGate } from "@/components/RateVaultGate";

export default function RateVaultPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="RATE VAULT">
        <RateVaultGate>
          <RateVaultDesk />
        </RateVaultGate>
      </DeskChrome>
    </AuthGate>
  );
}
