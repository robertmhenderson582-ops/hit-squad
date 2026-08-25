"use client";

import { CopyDesk } from "@/components/CopyDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsCopyPage() {
  return (
    <SettingsGate>
      <CopyDesk />
    </SettingsGate>
  );
}
