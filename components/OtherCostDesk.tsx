"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import {
  blankMisc,
  emptyOtherCost,
  miscAmount,
  otherCostTotals,
  readOtherCost,
  syncOtherCostTravel,
  TRAVEL_LANE_LABEL,
  travelAmount,
  writeOtherCost,
  type OtherCostSheet,
  type TravelLine,
} from "@/lib/other-cost";

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

const TRAVEL_HEADERS = ["LANE", "POSITION", "HEADCOUNT", "TRAVELERS", "$ / MILE", "MILES", "TOTAL"];

export function OtherCostDesk({ client, site }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [sheet, setSheet] = useState<OtherCostSheet>(emptyOtherCost);
  const pdDays = useMemo(() => {
    const rows = [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct];
    return sumSplits(rows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8))).pd;
  }, [client, pack.crew, site]);

  useEffect(() => {
    const stored = readOtherCost(pack.estimateKey);
    const next = syncOtherCostTravel(stored, pack.crew, { perMile: pack.jobMeta.mileageRate });
    setSheet(next);
    if (JSON.stringify(stored.travel) !== JSON.stringify(next.travel)) {
      writeOtherCost(pack.estimateKey, next);
    }
  }, [pack.crew, pack.estimateKey, pack.jobMeta.mileageRate]);

  function persist(next: OtherCostSheet) {
    setSheet(next);
    writeOtherCost(pack.estimateKey, next);
  }

  function patchTravel(index: number, patch: Partial<TravelLine>) {
    const next = sheet.travel.slice();
    const line = next[index];
    if (!line) return;
    const travelers = patch.travelers != null ? Math.min(Math.max(0, patch.travelers), line.headcount) : line.travelers;
    next[index] = { ...line, ...patch, travelers };
    persist({ ...sheet, travel: next });
  }

  const pdRate = pack.jobMeta.perDiemRate || sheet.perDiemRate;
  const totals = otherCostTotals({ ...sheet, perDiemRate: pdRate }, pdDays);

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Other Cost. Per diem uses this job’s rate and Crew PD days. Travel queues every Crew position
        and bills travelers × miles × $ / mile. Headcount stays on Crew. Misc is CAT 2 reimbursables —
        not B-3 small tools.
      </p>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Per diem</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            Job PD $ / day
            <input
              type="number"
              min={0}
              className="paper-field mt-1"
              value={pdRate || ""}
              onChange={(event) => {
                const perDiemRate = Number(event.target.value) || 0;
                persist({ ...sheet, perDiemRate });
                pack.setJobMeta((current) => ({ ...current, perDiemRate }));
              }}
            />
          </label>
          <p className="text-sm text-[#5b6f73]">
            PD days from Crew: <span className="font-semibold text-[#163038]">{pdDays}</span>
          </p>
          <p className="text-sm font-semibold text-[#163038]">{money(totals.perDiem)}</p>
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Travel</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Rows come from Crew. Type who travels, $ / mile, and miles. Travelers cannot exceed that
          position’s headcount.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {TRAVEL_HEADERS.map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.travel.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-[#5b6f73]">
                    Add Crew positions to queue travel.
                  </td>
                </tr>
              ) : (
                sheet.travel.map((line, index) => (
                  <tr key={line.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2">{TRAVEL_LANE_LABEL[line.lane]}</td>
                    <td className="px-2 py-2 font-medium text-[#163038]">{line.name}</td>
                    <td className="px-2 py-2">{line.headcount}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={line.headcount}
                        className="paper-field w-20"
                        value={line.travelers || ""}
                        onChange={(event) =>
                          patchTravel(index, { travelers: Number(event.target.value) || 0 })
                        }
                        aria-label={`${line.name} travelers`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="paper-field w-24"
                        value={line.perMile || ""}
                        onChange={(event) =>
                          patchTravel(index, { perMile: Number(event.target.value) || 0 })
                        }
                        aria-label={`${line.name} dollars per mile`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={line.miles || ""}
                        onChange={(event) => patchTravel(index, { miles: Number(event.target.value) || 0 })}
                        aria-label={`${line.name} miles`}
                      />
                    </td>
                    <td className="px-2 py-2 font-semibold">{money(travelAmount(line))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Misc reimbursables</h2>
          <button
            type="button"
            onClick={() => persist({ ...sheet, misc: [...sheet.misc, blankMisc()] })}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            + Extra
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["ITEM", "QTY", "EACH", "TOTAL"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.misc.map((line, index) => (
                <tr key={line.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">
                    <input
                      className="paper-field"
                      value={line.item}
                      onChange={(event) => {
                        const next = sheet.misc.slice();
                        next[index] = { ...line, item: event.target.value };
                        persist({ ...sheet, misc: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      className="paper-field w-20"
                      value={line.qty}
                      onChange={(event) => {
                        const next = sheet.misc.slice();
                        next[index] = { ...line, qty: Number(event.target.value) || 0 };
                        persist({ ...sheet, misc: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      className="paper-field w-28"
                      value={line.each || ""}
                      onChange={(event) => {
                        const next = sheet.misc.slice();
                        next[index] = { ...line, each: Number(event.target.value) || 0 };
                        persist({ ...sheet, misc: next });
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 font-semibold">{money(miscAmount(line))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm font-semibold text-[#163038]">
        PD {money(totals.perDiem)} · Travel {money(totals.travel)} · Misc {money(totals.misc)} · Other Cost{" "}
        {money(totals.total)}
      </p>
    </div>
  );
}
