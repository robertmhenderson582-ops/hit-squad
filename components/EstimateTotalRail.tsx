"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readFcrPacket } from "@/lib/change-order-packet";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { deskPackageBreakdown, fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";

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
    () =>
      sumSplits(
        crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8, "", pack.jobMeta.holidays ?? [])),
      ),
    [client, crewRows, pack.crew.otAfter8, pack.jobMeta.holidays, site],
  );

  const breakdown = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    return deskPackageBreakdown({
      crew: pack.crew,
      site,
      client,
      equipment,
      otherCost: other,
      subcontractor: readSubSheet(pack.estimateKey),
      jobMeta: pack.jobMeta,
      changeOrders: fcrChangeOrderTotal(readFcrPacket(pack.estimateKey)),
      hours: hours.hours,
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
