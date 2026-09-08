"use client";

import { DivisionsDesk } from "@/components/DivisionsDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsDivisionsPage() {
  return (
    <SettingsGate workingDesk>
      <DivisionsDesk />
    </SettingsGate>
  );
}
