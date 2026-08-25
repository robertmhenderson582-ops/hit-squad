"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { DeskChrome } from "@/components/DeskChrome";

export default function AccountingPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ACCOUNTING">
        <ClosedModuleDesk title="Accounting" />
      </DeskChrome>
    </AuthGate>
  );
}
