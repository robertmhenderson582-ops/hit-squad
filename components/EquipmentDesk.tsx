"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogPick } from "@/components/CatalogPick";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { DateField } from "@/components/DateField";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { B2_PERIODS, type B2Period } from "@/lib/b2-east-coast";
import {
  blankLargeTool,
  blankThirdParty,
  emptyEquipmentSheet,
  equipmentTotals,
  jobSetupWindow,
  largeToolAmount,
  readEquipmentSheet,
  removeEquipmentLine,
  seedEmptyEquipmentWindow,
  thirdPartyCost,
  thirdPartyMarkedUp,
  writeEquipmentSheet,
  type EquipmentSheet,
  type ThirdPartyPeriod,
} from "@/lib/equipment-sheet";
import {
  SHAHAN_BOOK_LABEL,
  SHAHAN_EQUIPMENT,
  isShahanCostPlus,
  lookupShahanEquipment,
  rematchShahanEquipmentId,
  shahanEquipmentId,
  shahanEquipmentRows,
  shahanPeriodRate,
} from "@/lib/shahan-wood-river";
import { deskFetch } from "@/lib/estimate-vault-client";
import { onEstimateSheets } from "@/lib/sheet-events";
import { commercialMarkupLabel } from "@/lib/estimate-total";
import {
  WOOD_RIVER_THIRD_PARTY_RENTAL,
  applyThirdPartyCatalogItem,
  applyThirdPartyCatalogPeriod,
  lookupThirdPartyRental,
  thirdPartyRentalDescriptions,
  thirdPartyRentalPeriodRate,
  type ThirdPartyRentalRow,
} from "@/lib/third-party-rental";

const LISTED_EQUIPMENT = shahanEquipmentRows(SHAHAN_EQUIPMENT).map((row, index) => ({
  row,
  id: shahanEquipmentId(row, index),
}));
const WET_ITEMS = LISTED_EQUIPMENT.filter((entry) => entry.row.wet);
const DRY_ITEMS = LISTED_EQUIPMENT.filter((entry) => !entry.row.wet);

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

const ADD_BTN = "rounded-lg bg-steel px-3 py-1.5 text-sm text-white";
const LARGE_HEADERS = [
  "P66 EQUIPMENT DESCRIPTION",
  "H",
  "D",
  "W",
  "M",
  "PERIOD",
  "QTY",
  "START",
  "END",
  "FREIGHT",
  "REPLACEMENT",
  "TOTAL",
];
const RENTAL_HEADERS = ["ITEM", "PERIOD", "RATE", "QTY", "START", "END", "FREIGHT", "TOTAL"];

export function EquipmentDesk({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const confirmRemove = useConfirmRemove();
  const [sheet, setSheet] = useState<EquipmentSheet>(emptyEquipmentSheet);
  const [catalog, setCatalog] = useState<ThirdPartyRentalRow[]>(() => [...WOOD_RIVER_THIRD_PARTY_RENTAL]);
  const totals = equipmentTotals(sheet, client, site);
  const commercialFee = commercialMarkupLabel(client, site).replace(/ markup$/i, "");
  const window = useMemo(() => jobSetupWindow(pack.schedule.phases), [pack.schedule.phases]);
  const thirdPartyItems = useMemo(() => thirdPartyRentalDescriptions(catalog), [catalog]);

  useEffect(() => {
    let cancelled = false;
    deskFetch("/api/desk/rates/third-party")
      .then(async (response) => {
        const data = await response.json();
        if (cancelled || !response.ok || !Array.isArray(data.catalog)) return;
        setCatalog(data.catalog);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function load() {
      const stored = readEquipmentSheet(pack.estimateKey);
      const seeded = seedEmptyEquipmentWindow(stored, window);
      setSheet(seeded);
      if (JSON.stringify(stored) !== JSON.stringify(seeded)) {
        writeEquipmentSheet(pack.estimateKey, seeded);
      }
    }
    load();
    return onEstimateSheets(load);
  }, [pack.estimateKey, window.start, window.end]);

  function persist(next: EquipmentSheet) {
    setSheet(next);
    writeEquipmentSheet(pack.estimateKey, next);
  }

  function dropLine(kind: "largeTools" | "thirdParty", id: string) {
    setSheet((current) => {
      const next = removeEquipmentLine(current, kind, id);
      writeEquipmentSheet(pack.estimateKey, next);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {SHAHAN_BOOK_LABEL} large tools. With fuel (wet) and without fuel (dry) are different picks —
        same description can bill two different dollars. $0 / cost-plus stays selectable; do not
        invent a rate. Operator hours stay on Crew. Third-party rental uses the Wood River
        third-party table.
      </p>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Large tools</h2>
          <button
            type="button"
            onClick={() => persist({ ...sheet, largeTools: [...sheet.largeTools, blankLargeTool(window)] })}
            className={ADD_BTN}
          >
            + Add large tool
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {LARGE_HEADERS.map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.largeTools.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-2 py-4 text-[#5b6f73]">
                    No large tools on this package.
                  </td>
                </tr>
              ) : (
                sheet.largeTools.map((line, index) => {
                  const itemId = rematchShahanEquipmentId(line.itemId);
                  const item = lookupShahanEquipment(itemId);
                  const costPlus = item ? isShahanCostPlus(item) && !shahanPeriodRate(item, line.period) : false;
                  return (
                    <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                      <td className="px-2 py-2">
                        <select
                          value={itemId}
                          onChange={(event) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, itemId: event.target.value };
                            persist({ ...sheet, largeTools: next });
                          }}
                          className="paper-field min-w-[16rem]"
                        >
                          <option value="">Pick a listed item</option>
                          <optgroup label="With fuel (wet)">
                            {WET_ITEMS.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.row.description}
                                {/requires operator/i.test(entry.row.description) ? " · op on Crew" : ""}
                                {isShahanCostPlus(entry.row) ? " · cost+6%" : ""}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Without fuel (dry)">
                            {DRY_ITEMS.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.row.description}
                                {/requires operator/i.test(entry.row.description) ? " · op on Crew" : ""}
                                {isShahanCostPlus(entry.row) ? " · cost+6%" : ""}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      {(["hourly", "daily", "weekly", "monthly"] as const).map((period) => (
                        <td key={period} className="px-2 py-2 font-mono text-xs">
                          {item ? money(shahanPeriodRate(item, period) ?? 0) : "—"}
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
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={line.freight || ""}
                          onChange={(event) => {
                            const next = sheet.largeTools.slice();
                            next[index] = { ...line, freight: Number(event.target.value) || 0 };
                            persist({ ...sheet, largeTools: next });
                          }}
                          className="paper-field w-24"
                          aria-label="Freight"
                        />
                      </td>
                      <td className="px-2 py-2 text-[#5b6f73]">—</td>
                      <td className="px-2 py-2 font-semibold">
                        {costPlus ? (
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
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="trash-btn"
                          title="Remove large tool"
                          aria-label="Remove large tool"
                          onClick={() =>
                            void confirmRemove(item?.description || "this large tool", {
                              title: "Remove this large tool?",
                              confirmLabel: "Remove",
                            }).then((ok) => {
                              if (ok) dropLine("largeTools", line.id);
                            })
                          }
                        >
                          ⌫
                        </button>
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
              Third-party rental uses the Wood River third-party table. Large tools stay Shahan COMP
              wet/dry.
            </p>
          </div>
          <button
            type="button"
            onClick={() => persist({ ...sheet, thirdParty: [...sheet.thirdParty, blankThirdParty(window)] })}
            className={ADD_BTN}
          >
            + Add rental
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {RENTAL_HEADERS.map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.thirdParty.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-[#5b6f73]">
                    No third-party rentals.
                  </td>
                </tr>
              ) : (
                sheet.thirdParty.map((line, index) => {
                  const listed = lookupThirdPartyRental(line.item, catalog);
                  return (
                    <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                    <td className="px-2 py-2">
                      <CatalogPick
                        value={line.item}
                        options={thirdPartyItems}
                        placeholder="Pick a listed item"
                        allowCustom
                        onChange={(item) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = applyThirdPartyCatalogItem(line, item, catalog);
                          persist({ ...sheet, thirdParty: next });
                        }}
                      />
                      {listed ? (
                        <p className="mt-1 font-mono text-[11px] text-[#5b6f73]">
                          D {money(thirdPartyRentalPeriodRate(listed, "daily"))} · W{" "}
                          {money(thirdPartyRentalPeriodRate(listed, "weekly"))} · M{" "}
                          {money(thirdPartyRentalPeriodRate(listed, "monthly"))}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="paper-field"
                        value={line.period}
                        onChange={(event) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = applyThirdPartyCatalogPeriod(
                            line,
                            event.target.value as ThirdPartyPeriod,
                            catalog,
                          );
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Rate type"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={line.rate || ""}
                        onChange={(event) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = { ...line, rate: Number(event.target.value) || 0 };
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Rate"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-20"
                        value={line.qty}
                        onChange={(event) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = { ...line, qty: Number(event.target.value) || 0 };
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Qty"
                      />
                    </td>
                    <td className="phase-date-cell px-2 py-2">
                      <DateField
                        value={line.start}
                        onChange={(start) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = { ...line, start };
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Rental start"
                      />
                    </td>
                    <td className="phase-date-cell px-2 py-2">
                      <DateField
                        value={line.end}
                        onChange={(end) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = { ...line, end };
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Rental end"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={line.freight || ""}
                        onChange={(event) => {
                          const next = sheet.thirdParty.slice();
                          next[index] = { ...line, freight: Number(event.target.value) || 0 };
                          persist({ ...sheet, thirdParty: next });
                        }}
                        aria-label="Freight"
                      />
                    </td>
                    <td className="px-2 py-2 text-sm text-[#5b6f73]">
                      <span className="block font-semibold text-[#163038]">{money(thirdPartyMarkedUp(line, client, site))}</span>
                      <span className="block text-xs">Cost {money(thirdPartyCost(line))} · after {commercialFee}</span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="trash-btn"
                        title="Remove rental"
                        aria-label="Remove rental"
                        onClick={() =>
                          void confirmRemove(line.item || "this rental", {
                            title: "Remove this rental?",
                            confirmLabel: "Remove",
                          }).then((ok) => {
                            if (ok) dropLine("thirdParty", line.id);
                          })
                        }
                      >
                        ⌫
                      </button>
                    </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm font-semibold text-[#163038]">
        Large tools {money(totals.largeTools)} · Third-party {money(totals.thirdParty)} · Equipment{" "}
        {money(totals.total)}
      </p>
    </div>
  );
}
