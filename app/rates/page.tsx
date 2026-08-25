"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { RateBuilder } from "@/components/RateBuilder";
import { useSession } from "@/components/SessionProvider";
import { canUseRateBuilder } from "@/lib/desk-role";

export default function RatesPage() {
  const { user } = useSession();
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="RATES">
        {canUseRateBuilder(user) ? (
          <RateBuilder />
        ) : (
          <section className="plant-card px-5 py-5 text-[#5b6f73]">Rate builder is not on this desk.</section>
        )}
      </DeskChrome>
    </AuthGate>
  );
}
