"use client";

import { CompanySetupDesk } from "@/components/CompanySetupDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsCompaniesPage() {
  return (
    <SettingsGate ownerOnly>
      <CompanySetupDesk />
    </SettingsGate>
  );
}
