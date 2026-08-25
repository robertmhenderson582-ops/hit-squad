"use client";

import { AuthGate } from "@/components/AuthGate";
import { ClosedModuleDesk } from "@/components/ClosedModuleDesk";
import { DeskChrome } from "@/components/DeskChrome";

export default function PayrollPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="PAYROLL">
        <ClosedModuleDesk title="Payroll" />
      </DeskChrome>
    </AuthGate>
  );
}
