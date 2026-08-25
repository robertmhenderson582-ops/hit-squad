"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ChangeOrderDesk } from "@/components/ChangeOrderDesk";

export default function ChangeOrdersPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="CHANGE ORDERS">
        <ChangeOrderDesk />
      </DeskChrome>
    </AuthGate>
  );
}
