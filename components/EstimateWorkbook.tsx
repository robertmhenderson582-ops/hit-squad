"use client";

import { useMemo, useState } from "react";
import { CraftByPhase } from "@/components/CraftByPhase";
import { CraftLaborGrid } from "@/components/CraftLaborGrid";
import { CrewManHours } from "@/components/CrewManHours";
import { LaborRollup } from "@/components/LaborRollup";
import { useAlias } from "@/components/OwnerDeskContext";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import type { CraftRow } from "@/lib/craft-labor";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";

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
  const [otAfter8, setOtAfter8] = useState(false);
  const labor = useMemo(
    () => sumSplits(rows.map((row) => computeRowHours(row, site, client, otAfter8))),
    [rows, site, client, otAfter8],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5b6f73]">
        {alias(client || "Phillips 66")} · {alias(site || "Wood River — Roxana, IL")} · {name || "New T&M estimate"}.
        Hours follow the position clock.
      </p>
      <CraftLaborGrid
        rows={rows}
        onRows={setRows}
        site={site}
        client={client}
        otAfter8={otAfter8}
        onOtAfter8={setOtAfter8}
      />
      <CraftByPhase rows={rows} />
      <PhaseSchedule />
      <LaborRollup estHours={labor.hours} />
      <CrewManHours />
    </div>
  );
}
