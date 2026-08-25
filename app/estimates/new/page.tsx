"use client";

import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { NewEstimateForm } from "@/components/NewEstimateForm";

export default function NewEstimatePage() {
  return (
    <AuthGate require="authenticated">
      <Suspense fallback={<p className="p-6 text-sm text-[#5b6f73]">Opening package</p>}>
        <NewEstimateForm />
      </Suspense>
    </AuthGate>
  );
}
