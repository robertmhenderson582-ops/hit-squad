"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { EstimateDetail } from "@/components/EstimateDetail";

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  return (
    <AuthGate require="authenticated">
      <EstimateDetail estimateId={id} />
    </AuthGate>
  );
}
