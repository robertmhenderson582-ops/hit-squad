"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { CompanyModuleGate } from "@/components/CompanyModuleGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function AccountingPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="ACCOUNTING">
        <CompanyModuleGate module="accounting">
          <ClosedModuleDesk title="Accounting" />
        </CompanyModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
