"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RatesDesk } from "@/components/RatesDesk";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canOpenRates, canUseRateBuilder } from "@/lib/desk-role";

export default function RatesPage() {
  const lens = useLensUser();
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="RATES">
        {canOpenRates(lens) ? (
          <RatesDesk />
        ) : (
          <section className="plant-card px-5 py-5 text-[#5b6f73]">
            {canUseRateBuilder(lens) ? "Rate builder is not on this desk." : "Wage-rate lookup is not on this desk."}
          </section>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
