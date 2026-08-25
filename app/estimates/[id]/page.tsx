"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateDetail } from "@/components/EstimateDetail";

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ESTIMATE PACKAGE">
        <EstimateDetail estimateId={id} />
      </DeskChrome>
    </AuthGate>
  );
}
