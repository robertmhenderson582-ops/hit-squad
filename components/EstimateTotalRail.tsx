"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { fcrSummary, readFcrPacket } from "@/lib/change-order-packet";
import { equipmentTotals, readEquipmentSheet, thirdPartyCost } from "@/lib/equipment-sheet";
import { estimateMarkupDollars, estimateTotalBreakdown } from "@/lib/estimate-total";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { otherCostTotals, readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { laborDollarsFromCrew, perDiemDollarsFromCrew } from "@/lib/shahan-wood-river";
import { wageLookupOpts } from "@/lib/wage-lookup";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet, subcontractorMarkupBase, subcontractorTotal } from "@/lib/subcontractor";

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EstimateTotalRail({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [tick, setTick] = useState(0);

  useEffect(() => onEstimateSheets(() => setTick((n) => n + 1)), []);

  const crewRows = useMemo(
    () => [
      ...pack.crew.staff,
      ...pack.crew.generalForeman,
      ...pack.crew.foreman,
      ...pack.crew.direct,
      ...pack.crew.support,
    ],
    [pack.crew],
  );
  const hours = useMemo(
    () => sumSplits(crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8))),
    [client, crewRows, pack.crew.otAfter8, site],
  );

  const breakdown = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    const fcr = readFcrPacket(pack.estimateKey);
    const thirdCost = equipment.thirdParty.reduce((sum, line) => sum + thirdPartyCost(line), 0);
    const tools = equipmentTotals(equipment).largeTools;
    const rest = otherCostTotals({ ...other, perDiemRate: 0 }, 0);
    const perDiem = perDiemDollarsFromCrew(pack.crew, pack.jobMeta, site, client);
    const subCtx = {
      site,
      client,
      otAfter8: pack.crew.otAfter8,
    };
    const sheet = readSubSheet(pack.estimateKey);
    const subcontractor = subcontractorTotal(sheet, subCtx);
    return estimateTotalBreakdown({
      labor: laborDollarsFromCrew(pack.crew, site, client, wageLookupOpts(site)),
      equipment: tools + thirdCost,
      subcontractor,
      markup: estimateMarkupDollars({
        subcontractor: subcontractorMarkupBase(sheet, subCtx),
        thirdParty: thirdCost,
        misc: rest.misc,
      }),
      otherCost: rest.total + perDiem,
      changeOrders: fcrSummary(fcr, 0, 0).total,
      hours: hours.hours,
      client,
      site,
    });
  }, [
    client,
    hours.hours,
    pack.crew,
    pack.crew.otAfter8,
    pack.estimateKey,
    pack.jobMeta,
    site,
    tick,
  ]);

  return (
    <aside className="est-total-rail hud-tile print-hide" aria-label="Estimate total">
      <h2>Estimate total</h2>
      <p className="est-total-rail-grand hud-readout">{breakdown.total ? money(breakdown.total) : "—"}</p>
      {breakdown.lines.length ? (
        <ul>
          {breakdown.lines.map((line) => (
            <li key={line.id}>
              <span>{line.label}</span>
              <span className="hud-readout">{money(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="est-total-rail-empty">Lines appear when a worksheet has dollars.</p>
      )}
      <p className="est-total-rail-hours">
        Man-hours
        <span className="hud-readout">{breakdown.hours ? breakdown.hours.toLocaleString("en-US") : "—"}</span>
      </p>
    </aside>
  );
}
