"use client";

import { AuthGate } from "@/components/AuthGate";
import { CompanyModuleGate } from "@/components/CompanyModuleGate";
import { DeskChrome } from "@/components/DeskChrome";
import { HseDesk } from "@/components/HseDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function HsePage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="HSE">
        <CompanyModuleGate module="hse">
          <HseDesk />
        </CompanyModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
