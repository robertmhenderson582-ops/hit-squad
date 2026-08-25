"use client";

import { AliasesDesk } from "@/components/AliasesDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsAliasesPage() {
  return (
    <SettingsGate ownerOnly>
      <AliasesDesk />
    </SettingsGate>
  );
}
