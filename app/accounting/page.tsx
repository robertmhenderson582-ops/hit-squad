"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { DeskChrome } from "@/components/DeskChrome";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function AccountingPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="ACCOUNTING">
        <ClosedModuleDesk title="Accounting" />
      </DeskChrome>
    </AuthGate>
  );
}
