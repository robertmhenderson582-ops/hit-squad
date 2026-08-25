"use client";

import { ManageUsersDesk } from "@/components/ManageUsersDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsUsersPage() {
  return (
    <SettingsGate buildDesk>
      <ManageUsersDesk />
    </SettingsGate>
  );
}
