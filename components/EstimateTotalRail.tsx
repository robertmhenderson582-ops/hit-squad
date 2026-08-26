"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { fcrSummary, readFcrPacket } from "@/lib/change-order-packet";
import {
  equipmentTotals,
  readEquipmentSheet,
  thirdPartyCost,
  thirdPartyMarkedUp,
} from "@/lib/equipment-sheet";
import { estimateTotalBreakdown, parseDeskDollars } from "@/lib/estimate-total";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { otherCostTotals, readOtherCost } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EstimateTotalRail({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [tick, setTick] = useState(0);

  useEffect(() => onEstimateSheets(() => setTick((n) => n + 1)), []);

  const crewRows = useMemo(
    () => [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct],
    [pack.crew],
  );
  const hours = useMemo(
    () => sumSplits(crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8))),
    [client, crewRows, pack.crew.otAfter8, site],
  );

  const breakdown = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = readOtherCost(pack.estimateKey);
    const fcr = readFcrPacket(pack.estimateKey);
    const thirdCost = equipment.thirdParty.reduce((sum, line) => sum + thirdPartyCost(line), 0);
    const thirdMarked = equipment.thirdParty.reduce((sum, line) => sum + thirdPartyMarkedUp(line), 0);
    const tools = equipmentTotals(equipment).largeTools;
    const pdRate = pack.jobMeta.perDiemRate || other.perDiemRate;
    return estimateTotalBreakdown({
      labor: crewRows.reduce((sum, row) => sum + parseDeskDollars(row.cost), 0),
      equipment: tools + thirdCost,
      markup: Math.round((thirdMarked - thirdCost) * 100) / 100,
      otherCost: otherCostTotals({ ...other, perDiemRate: pdRate }, hours.pd).total,
      changeOrders: fcrSummary(fcr, 0, pdRate).total,
      hours: hours.hours,
      client,
      site,
    });
  }, [client, crewRows, hours.hours, hours.pd, pack.estimateKey, pack.jobMeta.perDiemRate, site, tick]);

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
