"use client";

import { SecurityDesk } from "@/components/SecurityDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsSecurityPage() {
  return (
    <SettingsGate>
      <SecurityDesk />
    </SettingsGate>
  );
}
