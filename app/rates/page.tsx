"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RateBuilder } from "@/components/RateBuilder";

export default function RatesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="RATES">
        <RateBuilder />
      </DeskChrome>
    </AuthGate>
  );
}
