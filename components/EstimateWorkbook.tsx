"use client";

import { useState } from "react";
import { CraftByPhase } from "@/components/CraftByPhase";
import { CraftLaborGrid } from "@/components/CraftLaborGrid";
import { CrewManHours } from "@/components/CrewManHours";
import { LaborRollup } from "@/components/LaborRollup";
import { useAlias } from "@/components/OwnerDeskContext";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import type { CraftRow } from "@/lib/craft-labor";

export function EstimateWorkbook({
  client,
  site,
  name,
}: {
  client?: string;
  site?: string;
  name?: string;
}) {
  const alias = useAlias();
  const [rows, setRows] = useState<CraftRow[]>([]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5b6f73]">
        {alias(client || "Phillips 66")} · {alias(site || "Wood River — Roxana, IL")} · {name || "New T&M estimate"}. Look first,
        math later — hours stay stubbed.
      </p>
      <CraftLaborGrid rows={rows} onRows={setRows} />
      <CraftByPhase rows={rows} />
      <PhaseSchedule />
      <LaborRollup />
      <CrewManHours />
    </div>
  );
}
