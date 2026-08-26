"use client";

import { SettingsGate } from "@/components/SettingsGate";
import { ViewAsDesk } from "@/components/ViewAsDesk";

export default function SettingsViewAsPage() {
  return (
    <SettingsGate viewAs>
      <ViewAsDesk />
    </SettingsGate>
  );
}
