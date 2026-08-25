"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateBoard } from "@/components/EstimateBoard";
import { ModuleGate } from "@/components/ModuleGate";

export default function EstimatesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ESTIMATES">
        <ModuleGate need="estimates">
          <EstimateBoard />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
