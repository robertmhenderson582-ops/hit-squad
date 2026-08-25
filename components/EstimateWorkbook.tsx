"use client";

import { useMemo, useState } from "react";
import { CraftByPhase } from "@/components/CraftByPhase";
import { CraftLaborGrid } from "@/components/CraftLaborGrid";
import { LaborRollup } from "@/components/LaborRollup";
import { SupportCrewCard, type SupportLine } from "@/components/SupportCrewCard";
import { useAlias } from "@/components/OwnerDeskContext";
import { CREW_LANES } from "@/lib/crew-lanes";
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
  const [staff, setStaff] = useState<CraftRow[]>([]);
  const [generalForeman, setGeneralForeman] = useState<CraftRow[]>([]);
  const [foreman, setForeman] = useState<CraftRow[]>([]);
  const [direct, setDirect] = useState<CraftRow[]>([]);
  const [support, setSupport] = useState<SupportLine[]>([]);
  const [otAfter8, setOtAfter8] = useState(false);
  const craftRows = useMemo(
    () => [...staff, ...generalForeman, ...foreman, ...direct],
    [direct, foreman, generalForeman, staff],
  );
  const labor = useMemo(
    () => sumSplits(craftRows.map((row) => computeRowHours(row, site, client, otAfter8))),
    [client, craftRows, otAfter8, site],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5b6f73]">
        {alias(client || "Phillips 66")} · {alias(site || "Wood River — Roxana, IL")} · {name || "New T&M estimate"}.
        Hours follow the position clock. Phases live on Job setup.
      </p>
      {CREW_LANES.filter((lane) => lane.id !== "support").map((lane) => {
        const binding =
          lane.id === "staff"
            ? { rows: staff, onRows: setStaff }
            : lane.id === "general-foreman"
              ? { rows: generalForeman, onRows: setGeneralForeman }
              : lane.id === "foreman"
                ? { rows: foreman, onRows: setForeman }
                : { rows: direct, onRows: setDirect };
        return (
          <CraftLaborGrid
            key={lane.id}
            title={lane.title}
            note={lane.note}
            positions={lane.positions}
            rows={binding.rows}
            onRows={binding.onRows}
            site={site}
            client={client}
            otAfter8={otAfter8}
            onOtAfter8={lane.id === "direct" ? setOtAfter8 : undefined}
          />
        );
      })}
      <SupportCrewCard rows={support} onRows={setSupport} />
      <CraftByPhase rows={direct} />
      <LaborRollup estHours={labor.hours} />
    </div>
  );
}
