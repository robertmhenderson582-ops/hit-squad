"use client";

import { ChecksDesk } from "@/components/ChecksDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsChecksPage() {
  return (
    <SettingsGate ownerOnly>
      <ChecksDesk />
    </SettingsGate>
  );
}
