"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readFcrPacket } from "@/lib/change-order-packet";
import {
  ANALYTICS_STC_LINES,
  deriveEstimateAnalytics,
  yatesStcHint,
  type AnalyticsKind,
  type AnalyticsLineId,
  type EstimateAnalytics,
} from "@/lib/estimate-analytics";
import { fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { emptyAnalyticsStc, hydrateAnalyticsStcPct, type AnalyticsStcOverride } from "@/lib/estimate-money";
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

function stcRow(id: AnalyticsLineId) {
  return ANALYTICS_STC_LINES.find((row) => row.id === id);
}

function StcPctField({
  label,
  yatesKey,
  value,
  onCommit,
}: {
  label: string;
  yatesKey: "tool" | "consumables" | "ppe";
  value: number | null;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  return (
    <label className="inline-flex items-center gap-1 text-xs text-[#5b6f73]">
      <span className="sr-only">{label} percent</span>
      <input
        type="number"
        min={0}
        step={0.01}
        inputMode="decimal"
        className="paper-field w-[4.5rem] px-2 py-1 text-right text-sm text-[#163038]"
        placeholder="Yates"
        value={shown}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() === "" || (Number.isFinite(Number(raw)) && !raw.endsWith("."))) {
            onCommit(raw);
          }
        }}
        onBlur={() => {
          if (draft != null) onCommit(draft);
          setDraft(null);
        }}
        data-analytics-stc={yatesKey}
        aria-label={`${label} percent`}
      />
      <span>%</span>
    </label>
  );
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

  function setStcPct(key: keyof AnalyticsStcOverride, raw: string) {
    const next = hydrateAnalyticsStcPct(raw);
    pack.setJobMeta((current) => ({
      ...current,
      analyticsStc: { ...emptyAnalyticsStc(), ...current.analyticsStc, [key]: next },
    }));
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="plant-card px-5 py-5" aria-label="Analytics">
          <h2 className="text-2xl font-semibold text-[#163038]">Profit breakdown</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((line) => {
                  const stc = stcRow(line.id);
                  const override = stc ? (pack.jobMeta.analyticsStc ?? emptyAnalyticsStc())[stc.overrideKey] : null;
                  return (
                    <tr key={line.id} className="border-t border-[#d5e0de]" data-analytics-line={line.id}>
                      <td className="px-2 py-2">
                        {stc ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>{line.label}</span>
                            <StcPctField
                              label={line.label}
                              yatesKey={stc.yatesKey}
                              value={override}
                              onCommit={(raw) => setStcPct(stc.overrideKey, raw)}
                            />
                            <span className="text-[11px] text-[#5b6f73]">
                              {override == null ? yatesStcHint(stc.yatesKey) : "Override applies to craft and staff"}
                            </span>
                          </div>
                        ) : (
                          line.label
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-[#163038]">
                        {formatAmount(line.kind, line.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="plant-card px-5 py-5" aria-label="Tool / Con / PPE">
          <h3 className="text-lg font-semibold text-[#163038]">Tool / Con / PPE</h3>
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
