"use client";

import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { NewEstimateForm } from "@/components/NewEstimateForm";

export default function NewEstimatePage() {
  return (
    <AuthGate require="authenticated">
      <Suspense fallback={<p className="p-6 font-mono text-xs tracking-[0.2em] text-steel">OPENING PACKAGE</p>}>
        <NewEstimateForm />
      </Suspense>
    </AuthGate>
  );
}
