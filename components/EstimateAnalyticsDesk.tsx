"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readFcrPacket } from "@/lib/change-order-packet";
import {
  ANALYTICS_LIVE_NOTE,
  ANALYTICS_NOUN,
  ANALYTICS_PHASE2_NOTE,
  deriveEstimateAnalytics,
  type AnalyticsKind,
  type EstimateAnalytics,
} from "@/lib/estimate-analytics";
import { fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";

function formatAmount(kind: AnalyticsKind, amount: number | null) {
  if (amount == null) return "—";
  if (kind === "hours") {
    return amount ? amount.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
  }
  if (kind === "percent") {
    return `${(amount * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
  if (!amount && kind !== "per-hour") return "—";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EstimateAnalyticsDesk({ client = "", site = "" }: { client?: string; site?: string }) {
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

  const sheet: EstimateAnalytics = useMemo(() => {
    void tick;
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    return deriveEstimateAnalytics({
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
  }, [client, hours.hours, pack.crew, pack.estimateKey, pack.jobMeta, site, tick]);

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {ANALYTICS_NOUN} for this live estimate. {ANALYTICS_LIVE_NOTE} Base-wage OH / profit use COMP BW, not
        billed ST. {ANALYTICS_PHASE2_NOTE}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="plant-card px-5 py-5" aria-label="Analytics">
          <h2 className="text-2xl font-semibold text-[#163038]">Profit breakdown</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Yates Analytics lines. A dash means that workbook field is not available on this pack yet — no
            invented dollars.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[#d5e0de]" data-analytics-line={line.id}>
                    <td className="px-2 py-2">{line.label}</td>
                    <td className="px-2 py-2 text-right font-semibold text-[#163038]">
                      {formatAmount(line.kind, line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="plant-card px-5 py-5" aria-label="Tool / Con / PPE">
          <h3 className="text-lg font-semibold text-[#163038]">Tool / Con / PPE</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">Budget rollups from COMP BW × hours. Not Purchasing actuals.</p>
          <ul className="mt-4 space-y-3">
            {sheet.rollups.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3">
                <span className="text-xs tracking-[0.12em] text-[#5b6f73]">{row.label}</span>
                <span className="font-semibold text-[#163038]">{formatAmount("money", row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
