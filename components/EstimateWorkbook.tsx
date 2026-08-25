"use client";

import { useMemo } from "react";
import { CraftByPhase } from "@/components/CraftByPhase";
import { CraftLaborGrid } from "@/components/CraftLaborGrid";
import { LaborRollup } from "@/components/LaborRollup";
import { SupportCrewCard } from "@/components/SupportCrewCard";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useAlias } from "@/components/OwnerDeskContext";
import { CREW_LANES } from "@/lib/crew-lanes";
import type { CraftRow } from "@/lib/craft-labor";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";

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
  const { staff, generalForeman, foreman, direct, support, otAfter8 } = pack.crew;
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
        Hours follow the position clock. Calendars follow Phases & work schedule.
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
            otAfter8={otAfter8}
            onOtAfter8={(next) => pack.setCrew((current) => ({ ...current, otAfter8: next }))}
            newRow={pack.addCraftRow}
          />
        );
      })}
      <SupportCrewCard
        rows={support}
        onRows={(next) =>
          pack.setCrew((current) => ({
            ...current,
            support: typeof next === "function" ? next(current.support) : next,
          }))
        }
      />
      <CraftByPhase rows={direct} />
      <LaborRollup estHours={labor.hours} />
    </div>
  );
}
