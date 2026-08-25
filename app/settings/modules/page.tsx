"use client";

import { FutureModulesDesk } from "@/components/FutureModulesDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function FutureModulesPage() {
  return (
    <SettingsGate>
      <FutureModulesDesk />
    </SettingsGate>
  );
}
