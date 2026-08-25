"use client";

import { ActivityDesk } from "@/components/ActivityDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsActivityPage() {
  return (
    <SettingsGate ownerOnly>
      <ActivityDesk />
    </SettingsGate>
  );
}
