"use client";

import { AuthGate } from "@/components/AuthGate";
import { CompanyModuleGate } from "@/components/CompanyModuleGate";
import { DeskChrome } from "@/components/DeskChrome";
import { QualityDesk } from "@/components/QualityDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function QualityPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="QUALITY">
        <CompanyModuleGate module="quality">
          <QualityDesk />
        </CompanyModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
