"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { PurchasingModuleDesk } from "@/components/PurchasingModuleDesk";

export default function PurchasingPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="PURCHASING">
        <PurchasingModuleDesk />
      </DeskChrome>
    </AuthGate>
  );
}
