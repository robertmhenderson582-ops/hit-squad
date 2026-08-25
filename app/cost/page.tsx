"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { CostDesk } from "@/components/CostDesk";
import { ModuleGate } from "@/components/ModuleGate";

export default function CostPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="COST / PPR">
        <ModuleGate need="cost">
          <CostDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
