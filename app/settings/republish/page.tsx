"use client";

import { RepublishDesk } from "@/components/RepublishDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsRepublishPage() {
  return (
    <SettingsGate ownerOnly>
      <RepublishDesk />
    </SettingsGate>
  );
}
