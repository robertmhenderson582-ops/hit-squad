"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import {
  blankMisc,
  blankTravel,
  emptyOtherCost,
  miscAmount,
  otherCostTotals,
  readOtherCost,
  showCraftTravelRow,
  travelAmount,
  writeOtherCost,
  type OtherCostSheet,
} from "@/lib/other-cost";

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export function OtherCostDesk({ client, site }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [sheet, setSheet] = useState<OtherCostSheet>(emptyOtherCost);
  const pdDays = useMemo(() => {
    const rows = [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct];
    return sumSplits(rows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8))).pd;
  }, [client, pack.crew, site]);

  useEffect(() => {
    setSheet(readOtherCost(pack.estimateKey));
  }, [pack.estimateKey]);

  function persist(next: OtherCostSheet) {
    setSheet(next);
    writeOtherCost(pack.estimateKey, next);
  }

  const pdRate = pack.jobMeta.perDiemRate || sheet.perDiemRate;
  const totals = otherCostTotals({ ...sheet, perDiemRate: pdRate }, pdDays);
  const showMileage = showCraftTravelRow(pack.jobMeta.mileageRate) || sheet.travel.some((line) => line.mileageRate > 0);

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Other Cost. Per diem uses this job’s rate and Crew PD days. Travel is Yes/No traveler, Mileage
        Rate, and travel $. Misc is CAT 2 reimbursables — not B-3 small tools.
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Travel</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                persist({ ...sheet, travel: [...sheet.travel, blankTravel("staff", pack.jobMeta.mileageRate)] })
              }
              className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
            >
              + Staff traveler
            </button>
            <button
              type="button"
              onClick={() =>
                persist({ ...sheet, travel: [...sheet.travel, blankTravel("craft", pack.jobMeta.mileageRate)] })
              }
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            >
              + Craft travel
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["KIND", "NAME", "TRAVELER", ...(showMileage ? ["MILEAGE RATE"] : []), "TRAVEL $", "TOTAL"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.travel.length === 0 ? (
                <tr>
                  <td colSpan={showMileage ? 6 : 5} className="px-2 py-4 text-[#5b6f73]">
                    No travelers.
                  </td>
                </tr>
              ) : (
                sheet.travel.map((line, index) => (
                  <tr key={line.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2">{line.kind === "staff" ? "Staff" : "Craft"}</td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field"
                        value={line.name}
                        onChange={(event) => {
                          const next = sheet.travel.slice();
                          next[index] = { ...line, name: event.target.value };
                          persist({ ...sheet, travel: next });
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="paper-field"
                        value={line.traveler ? "yes" : "no"}
                        onChange={(event) => {
                          const next = sheet.travel.slice();
                          next[index] = { ...line, traveler: event.target.value === "yes" };
                          persist({ ...sheet, travel: next });
                        }}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </td>
                    {showMileage ? (
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="paper-field w-28"
                          value={line.mileageRate || pack.jobMeta.mileageRate || ""}
                          onChange={(event) => {
                            const next = sheet.travel.slice();
                            next[index] = { ...line, mileageRate: Number(event.target.value) || 0 };
                            persist({ ...sheet, travel: next });
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-28"
                        value={line.travelDollars || ""}
                        onChange={(event) => {
                          const next = sheet.travel.slice();
                          next[index] = { ...line, travelDollars: Number(event.target.value) || 0 };
                          persist({ ...sheet, travel: next });
                        }}
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
