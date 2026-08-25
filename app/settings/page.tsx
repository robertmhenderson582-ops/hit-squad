"use client";

import { DisplayDesk } from "@/components/DisplayDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsPage() {
  return (
    <SettingsGate>
      <DisplayDesk />
    </SettingsGate>
  );
}
