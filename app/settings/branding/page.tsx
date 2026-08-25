"use client";

import { BrandingDesk } from "@/components/BrandingDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsBrandingPage() {
  return (
    <SettingsGate buildDesk>
      <BrandingDesk />
    </SettingsGate>
  );
}
