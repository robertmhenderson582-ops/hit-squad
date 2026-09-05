"use client";

import { SettingsGate } from "@/components/SettingsGate";
import { SitesRegularDesk } from "@/components/SitesRegularDesk";

export default function SettingsSitesPage() {
  return (
    <SettingsGate buildDesk>
      <SitesRegularDesk />
    </SettingsGate>
  );
}
