"use client";

import { useEffect, useState } from "react";
import { DateField } from "@/components/DateField";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  B2_COAST,
  B2_PERIODS,
  B2_PLANT,
  billableB2Items,
  b2ItemById,
  periodRate,
  type B2Period,
} from "@/lib/b2-east-coast";
import {
  blankLargeTool,
  blankThirdParty,
  emptyEquipmentSheet,
  equipmentTotals,
  largeToolAmount,
  readEquipmentSheet,
  thirdPartyCost,
  thirdPartyMarkedUp,
  writeEquipmentSheet,
  type EquipmentSheet,
  type ThirdPartyPeriod,
} from "@/lib/equipment-sheet";

const ITEMS = billableB2Items();

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export function EquipmentDesk() {
  const pack = useEstimatePackage();
  const [sheet, setSheet] = useState<EquipmentSheet>(emptyEquipmentSheet);
  const totals = equipmentTotals(sheet);

  useEffect(() => {
    setSheet(readEquipmentSheet(pack.estimateKey));
  }, [pack.estimateKey]);

  function persist(next: EquipmentSheet) {
    setSheet(next);
    writeEquipmentSheet(pack.estimateKey, next);
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {B2_COAST} COMP {B2_PLANT} large tools (dry, w/o fuel). Wood River and Bayway share this book.
        8 hr = day, 3 days = week, 3 weeks = month. Only listed items bill. Replacement stays blank
        unless sourced — do not guess. Operator hours stay on Crew. B-3 small tools stay in B-1 misc
        burden, not here.
      </p>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Large tools</h2>
          <button
            type="button"
            onClick={() => persist({ ...sheet, largeTools: [...sheet.largeTools, blankLargeTool()] })}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            + Add large tool
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["P66 EQUIPMENT DESCRIPTION", "H", "D", "W", "M", "PERIOD", "QTY", "START", "END", "MOB/DEMOB", "REPLACEMENT", "TOTAL"].map(
                  (header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sheet.largeTools.length === 0 ? (
                    <tr>
                  <td colSpan={12} className="px-2 py-4 text-[#5b6f73]">
                    No large tools on this package.
                  </td>
                </tr>
              ) : (
                sheet.largeTools.map((line, index) => {
                  const item = b2ItemById(line.itemId);
                  return (
                    <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                      <td className="px-2 py-2">
                        <select
                          value={line.itemId}
                          onChange={(event) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, itemId: event.target.value };
                            persist({ ...sheet, largeTools: next });
                          }}
                          className="paper-field min-w-[16rem]"
                        >
                          <option value="">Pick a listed item</option>
                          {ITEMS.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.description}
                              {row.requiresOperator ? " · op on Crew" : ""}
                              {row.billing === "cost-plus" ? " · cost+6%" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(["hourly", "daily", "weekly", "monthly"] as const).map((period) => (
                        <td key={period} className="px-2 py-2 font-mono text-xs">
                          {item ? money(periodRate(item, period) ?? 0) : "—"}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <select
                          value={line.period}
                          onChange={(event) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, period: event.target.value as B2Period };
                            persist({ ...sheet, largeTools: next });
                          }}
                          className="paper-field"
                        >
                          {B2_PERIODS.map((period) => (
                            <option key={period.id} value={period.id}>
                              {period.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={line.qty}
                          onChange={(event) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, qty: Number(event.target.value) || 0 };
                            persist({ ...sheet, largeTools: next });
                          }}
                          className="paper-field w-20"
                        />
                      </td>
                      <td className="phase-date-cell px-2 py-2">
                        <DateField
                          value={line.start}
                          onChange={(start) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, start };
                            persist({ ...sheet, largeTools: next });
                          }}
                          aria-label="Large tool start"
                        />
                      </td>
                      <td className="phase-date-cell px-2 py-2">
                        <DateField
                          value={line.end}
                          onChange={(end) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, end };
                            persist({ ...sheet, largeTools: next });
                          }}
                          aria-label="Large tool end"
                        />
                      </td>
                      <td className="px-2 py-2 text-[#5b6f73]">{item?.mob != null ? money(item.mob) : "—"}</td>
                      <td className="px-2 py-2 text-[#5b6f73]">{item?.replacement != null ? money(item.replacement) : "—"}</td>
                      <td className="px-2 py-2 font-semibold">
                        {item?.billing === "cost-plus" && periodRate(item, line.period) == null ? (
                          <label className="block text-xs text-[#5b6f73]">
                            Cost
                            <input
                              type="number"
                              min={0}
                              value={line.enteredCost || ""}
                              onChange={(event) => {
                                const next = sheet.largeTools.slice();
                                next[index] = { ...line, enteredCost: Number(event.target.value) || 0 };
                                persist({ ...sheet, largeTools: next });
                              }}
                              className="paper-field mt-1 w-28"
                            />
                            <span className="mt-1 block">{money(largeToolAmount(line))} after 6%</span>
                          </label>
                        ) : (
                          money(largeToolAmount(line))
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[#163038]">Third-party rental</h2>
            <p className="mt-1 text-sm text-[#5b6f73]">
              No COMP rental book. Type the item and cost. Freight sits on the line. +6% is applied.
            </p>
          </div>
          <button
            type="button"
            onClick={() => persist({ ...sheet, thirdParty: [...sheet.thirdParty, blankThirdParty()] })}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            + Add rental
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {sheet.thirdParty.length === 0 ? (
            <p className="text-sm text-[#5b6f73]">No third-party rentals.</p>
          ) : (
            sheet.thirdParty.map((line, index) => (
              <article key={line.id} className="grid gap-3 rounded-lg border border-[#d5e0de] px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-sm sm:col-span-2">
                  Item
                  <input
                    className="paper-field mt-1"
                    value={line.item}
                    onChange={(event) => {
                      const next = sheet.thirdParty.slice();
                      next[index] = { ...line, item: event.target.value };
                      persist({ ...sheet, thirdParty: next });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Rate type
                  <select
                    className="paper-field mt-1"
                    value={line.period}
                    onChange={(event) => {
                      const next = sheet.thirdParty.slice();
                      next[index] = { ...line, period: event.target.value as ThirdPartyPeriod };
                      persist({ ...sheet, thirdParty: next });
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Rate
                  <input
                    type="number"
                    min={0}
                    className="paper-field mt-1"
                    value={line.rate || ""}
                    onChange={(event) => {
                      const next = sheet.thirdParty.slice();
                      next[index] = { ...line, rate: Number(event.target.value) || 0 };
                      persist({ ...sheet, thirdParty: next });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Freight
                  <input
                    type="number"
                    min={0}
                    className="paper-field mt-1"
                    value={line.freight || ""}
                    onChange={(event) => {
                      const next = sheet.thirdParty.slice();
                      next[index] = { ...line, freight: Number(event.target.value) || 0 };
                      persist({ ...sheet, thirdParty: next });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Qty
                  <input
                    type="number"
                    min={0}
                    className="paper-field mt-1"
                    value={line.qty}
                    onChange={(event) => {
                      const next = sheet.thirdParty.slice();
                      next[index] = { ...line, qty: Number(event.target.value) || 0 };
                      persist({ ...sheet, thirdParty: next });
                    }}
                  />
                </label>
                <div className="calendar-dates sm:col-span-2">
                  <div>
                    <span className="text-sm">Start</span>
                    <DateField
                      className="mt-1"
                      value={line.start}
                      onChange={(start) => {
                        const next = sheet.thirdParty.slice();
                        next[index] = { ...line, start };
                        persist({ ...sheet, thirdParty: next });
                      }}
                      aria-label="Rental start"
                    />
                  </div>
                  <div>
                    <span className="text-sm">End</span>
                    <DateField
                      className="mt-1"
                      value={line.end}
                      onChange={(end) => {
                        const next = sheet.thirdParty.slice();
                        next[index] = { ...line, end };
                        persist({ ...sheet, thirdParty: next });
                      }}
                      aria-label="Rental end"
                    />
                  </div>
                </div>
                <p className="text-sm text-[#5b6f73] sm:col-span-2">
                  Cost {money(thirdPartyCost(line))} · after 6% {money(thirdPartyMarkedUp(line))}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <p className="text-sm font-semibold text-[#163038]">
        Large tools {money(totals.largeTools)} · Third-party {money(totals.thirdParty)} · Equipment{" "}
        {money(totals.total)}
      </p>
    </div>
  );
}
