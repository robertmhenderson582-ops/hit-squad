"use client";

import { useSearchParams } from "next/navigation";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";

export function NewEstimateForm() {
  const params = useSearchParams();

  return (
    <EstimateWorkbook
      client={params.get("client") || "Phillips 66"}
      site={params.get("site") || "Wood River — Roxana, IL"}
      name={params.get("name") || "New T&M estimate"}
    />
  );
}
