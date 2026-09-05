"use client";

import { useMemo } from "react";
import { CraftLaborGrid } from "@/components/CraftLaborGrid";
import { LaborRollup } from "@/components/LaborRollup";
import { SupportCrewCard } from "@/components/SupportCrewCard";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useAlias } from "@/components/OwnerDeskContext";
import { CREW_LANES } from "@/lib/crew-lanes";
import type { CraftRow } from "@/lib/craft-labor";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { defaultEstimateName } from "@/lib/job-event";

type CraftSetter = (next: CraftRow[] | ((current: CraftRow[]) => CraftRow[])) => void;

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
  const pack = useEstimatePackage();
  const { staff, generalForeman, foreman, direct, support } = pack.crew;
  const craftRows = useMemo(
    () => [...staff, ...generalForeman, ...foreman, ...direct],
    [direct, foreman, generalForeman, staff],
  );
  const labor = useMemo(
    () => sumSplits(craftRows.map((row) => computeRowHours(row, site, client, false, "", pack.jobMeta.holidays ?? []))),
    [client, craftRows, pack.jobMeta.holidays, site],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5b6f73]">
        {alias(client || "Phillips 66")} · {alias(site || "Wood River — Roxana, IL")} ·{" "}
        {name || defaultEstimateName(client, site)}.
        Hours follow the position clock and Job setup. Calendars follow Phases & work schedule.
      </p>
      {CREW_LANES.filter((lane) => lane.id !== "support").map((lane) => {
        const key =
          lane.id === "staff"
            ? "staff"
            : lane.id === "general-foreman"
              ? "generalForeman"
              : lane.id === "foreman"
                ? "foreman"
                : "direct";
        const onRows: CraftSetter = (next) =>
          pack.setCrew((current) => ({
            ...current,
            [key]: typeof next === "function" ? next(current[key]) : next,
          }));
        const binding = { rows: pack.crew[key], onRows };
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
            newRow={pack.addCraftRow}
            laneId={lane.id}
          />
        );
      })}
      <SupportCrewCard
        rows={support}
        site={site}
        client={client}
        onRows={(next) =>
          pack.setCrew((current) => ({
            ...current,
            support: typeof next === "function" ? next(current.support) : next,
          }))
        }
      />
      <LaborRollup estHours={labor.hours} />
    </div>
  );
}
