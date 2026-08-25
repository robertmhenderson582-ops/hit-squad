"use client";

import { HowWeTalkDesk } from "@/components/HowWeTalkDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function HowWeTalkPage() {
  return (
    <SettingsGate>
      <HowWeTalkDesk />
    </SettingsGate>
  );
}
