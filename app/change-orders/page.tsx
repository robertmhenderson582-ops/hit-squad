"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ChangeOrderDesk } from "@/components/ChangeOrderDesk";
import { ModuleGate } from "@/components/ModuleGate";

export default function ChangeOrdersPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="CHANGE ORDERS">
        <ModuleGate need="changeOrders">
          <ChangeOrderDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
