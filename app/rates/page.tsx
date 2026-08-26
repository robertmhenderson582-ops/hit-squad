"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RateBuilder } from "@/components/RateBuilder";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canUseRateBuilder } from "@/lib/desk-role";

export default function RatesPage() {
  const lens = useLensUser();
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="RATES">
        {canUseRateBuilder(lens) ? (
          <RateBuilder />
        ) : (
          <section className="plant-card px-5 py-5 text-[#5b6f73]">Rate builder is not on this desk.</section>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
