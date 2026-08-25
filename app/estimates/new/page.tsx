"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { NewEstimateForm } from "@/components/NewEstimateForm";

export default function NewEstimatePage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="NEW ESTIMATE">
        <NewEstimateForm />
      </DeskChrome>
    </AuthGate>
  );
}
