"use client";

import { PrivilegesDesk } from "@/components/PrivilegesDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsPrivilegesPage() {
  return (
    <SettingsGate ownerOnly>
      <PrivilegesDesk />
    </SettingsGate>
  );
}
