"use client";

import { SettingsGate } from "@/components/SettingsGate";
import { VaultDesk } from "@/components/VaultDesk";

export default function SettingsVaultPage() {
  return (
    <SettingsGate ownerOnly>
      <VaultDesk />
    </SettingsGate>
  );
}
