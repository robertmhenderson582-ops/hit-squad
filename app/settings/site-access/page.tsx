"use client";

import { SettingsGate } from "@/components/SettingsGate";
import { SiteAccessQueueDesk } from "@/components/SiteAccessQueueDesk";

export default function SettingsSiteAccessPage() {
  return (
    <SettingsGate buildDesk>
      <SiteAccessQueueDesk />
    </SettingsGate>
  );
}
