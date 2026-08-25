"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { CostDesk } from "@/components/CostDesk";

export default function CostPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="COST / PPR">
        <CostDesk />
      </DeskChrome>
    </AuthGate>
  );
}
