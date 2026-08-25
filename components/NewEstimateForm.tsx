"use client";

import { useSearchParams } from "next/navigation";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { ShopRigSheet } from "@/components/ShopRigSheet";

export function NewEstimateForm() {
  const params = useSearchParams();
  const size = params.get("size");
  const client = params.get("client") || "Phillips 66";
  const site = params.get("site") || "Wood River — Roxana, IL";
  const name = params.get("name") || "New T&M estimate";

  if (size === "shop") {
    return <ShopRigSheet client={client} name={name} />;
  }

  return <EstimateWorkbook client={client} site={site} name={name} />;
}
