"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateBoard } from "@/components/EstimateBoard";

export default function DeskPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ESTIMATES">
        <EstimateBoard />
      </DeskChrome>
    </AuthGate>
  );
}
