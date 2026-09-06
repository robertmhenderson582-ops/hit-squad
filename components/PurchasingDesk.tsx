"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { readOtherCost } from "@/lib/other-cost";
import {
  addPurchaseLine,
  applyPurchaseTie,
  livePurchaseTieOptions,
  miscBudgetFromSheet,
  openPurchasingSnapshot,
  patchPurchaseLine,
  purchaseTieOptions,
  PURCHASE_CATEGORIES,
  PURCHASE_STATUSES,
  PURCHASING_INTERNAL_NOTE,
  PURCHASING_LIVE_NOTE,
  PURCHASING_NOUN,
  PURCHASING_PARKED,
  purchasingCostSlice,
  purchasingSnapshotList,
  purchasingTotals,
  readPurchasing,
  removePurchaseLine,
  savePurchasingSnapshot,
  writePurchasing,
  type PurchaseLine,
  type PurchasingBook,
} from "@/lib/purchasing";
import { parseLooseDate, todayYmd } from "@/lib/cost-report";
import { onEstimateSheets } from "@/lib/sheet-events";

function money(value: number) {
  return value
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-4 py-3">
      <p className="text-xs tracking-[0.12em] text-[#5b6f73]">{label}</p>
      <p className="mt-1 font-display text-2xl text-[#163038]">{value}</p>
      {note ? <p className="mt-1 text-xs text-[#5b6f73]">{note}</p> : null}
    </div>
  );
}

export function PurchasingDesk({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [book, setBook] = useState<PurchasingBook>(() => readPurchasing(""));
  const [otherCost, setOtherCost] = useState(() => (pack.estimateKey ? readOtherCost(pack.estimateKey) : null));
  const [equipment, setEquipment] = useState(() => (pack.estimateKey ? readEquipmentSheet(pack.estimateKey) : null));

  useEffect(() => {
    function load() {
      if (!pack.estimateKey) {
        setBook(readPurchasing(""));
        setOtherCost(null);
        setEquipment(null);
        return;
      }
      setBook(readPurchasing(pack.estimateKey));
      setOtherCost(readOtherCost(pack.estimateKey));
      setEquipment(readEquipmentSheet(pack.estimateKey));
    }
    load();
    return onEstimateSheets(load);
  }, [pack.estimateKey, pack.ready]);
  const misc = useMemo(() => miscBudgetFromSheet(otherCost ?? undefined), [otherCost]);
  const totals = useMemo(() => purchasingTotals(book.lines), [book.lines]);
  const slice = useMemo(() => purchasingCostSlice(book, misc), [book, misc]);
  const ties = useMemo(
    () => (pack.estimateKey ? livePurchaseTieOptions(pack.estimateKey) : purchaseTieOptions(otherCost, equipment)),
    [equipment, otherCost, pack.estimateKey],
  );
  const history = purchasingSnapshotList(book);
  void client;
  void site;

  function persist(next: PurchasingBook) {
    setBook(next);
    if (pack.estimateKey) writePurchasing(pack.estimateKey, next);
  }

  function patchLine(lineId: string, patch: Partial<PurchaseLine>) {
    persist(patchPurchaseLine(book, lineId, patch));
  }

  function setTie(line: PurchaseLine, value: string) {
    if (!value) {
      persist(patchPurchaseLine(book, line.id, applyPurchaseTie(line, null)));
      return;
    }
    const [kind, id] = value.split(":");
    const option = ties.find((row) => row.kind === kind && row.id === id) ?? null;
    persist(patchPurchaseLine(book, line.id, applyPurchaseTie(line, option)));
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {PURCHASING_NOUN} for this live estimate. {PURCHASING_LIVE_NOTE} {PURCHASING_INTERNAL_NOTE}{" "}
        Same pack store as Cost report / ECR — not a second AP book.
      </p>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block text-sm">
            Status date
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder="YYYY-MM-DD or 9/6/2026"
              value={book.statusDate}
              onChange={(event) => persist({ ...book, statusDate: event.target.value })}
              onBlur={(event) =>
                persist({
                  ...book,
                  statusDate: parseLooseDate(event.target.value) || todayYmd(),
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={() => persist(savePurchasingSnapshot(book, misc))}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            Save dated totals
          </button>
        </div>
        <label className="mt-4 block text-sm">
          Notes
          <textarea
            rows={2}
            className="paper-field mt-1"
            value={book.notes}
            onChange={(event) => persist({ ...book, notes: event.target.value })}
          />
        </label>
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Job rollup</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Category totals from the lines below. Vs-budget uses live Other Cost Misc when that
          sheet has dollars — no invented budget.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PURCHASE_CATEGORIES.map((row) => (
            <Stat key={row.id} label={row.label} value={money(totals.byCategory[row.id])} />
          ))}
          <Stat label="Grand total" value={money(totals.grand)} note={`${totals.lineCount} buy line${totals.lineCount === 1 ? "" : "s"}`} />
        </div>
        <div className="mt-4 rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-4 py-3">
          <p className="text-xs tracking-[0.12em] text-[#5b6f73]">VS ESTIMATE MISC</p>
          {slice.vsBudget.hasMiscBudget ? (
            <p className="mt-2 text-sm text-[#163038]">
              Small tools + Consumables {money(slice.vsBudget.toolsConsumables)} vs Misc budget{" "}
              {money(slice.vsBudget.miscBudget)}. Variance {money(slice.vsBudget.variance)}
              {slice.vsBudget.variance < 0 ? " over" : slice.vsBudget.variance > 0 ? " under" : ""}.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#5b6f73]">
              No Misc dollars on this pack yet. Type Other Cost Misc to compare — this tab will
              not invent a budget.
            </p>
          )}
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[#163038]">PO / buy lines</h2>
            <p className="mt-1 text-sm text-[#5b6f73]">
              Optional PO#. Optional estimate tie (free label or a live Misc / Equipment / Other
              Cost line). Attachment is a filename only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => persist(addPurchaseLine(book))}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            Add buy
          </button>
        </div>
        {book.lines.length === 0 ? (
          <p className="mt-4 text-sm text-[#5b6f73]">No buys yet. Add a line for this job.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {[
                    "Date",
                    "Vendor",
                    "PO#",
                    "Description",
                    "Category",
                    "Amount",
                    "Status",
                    "Estimate tie",
                    "Label",
                    "File",
                    "",
                  ].map((header) => (
                    <th key={header || "remove"} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-28"
                        value={line.date}
                        onChange={(event) => patchLine(line.id, { date: event.target.value })}
                        onBlur={(event) =>
                          patchLine(line.id, { date: parseLooseDate(event.target.value) || line.date })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-36"
                        value={line.vendor}
                        onChange={(event) => patchLine(line.id, { vendor: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-24"
                        value={line.poNumber}
                        onChange={(event) => patchLine(line.id, { poNumber: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-44"
                        value={line.description}
                        onChange={(event) => patchLine(line.id, { description: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="paper-field w-36"
                        value={line.category}
                        onChange={(event) =>
                          patchLine(line.id, { category: event.target.value as PurchaseLine["category"] })
                        }
                      >
                        {PURCHASE_CATEGORIES.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-24 font-mono"
                        inputMode="decimal"
                        value={line.amount ? String(line.amount) : ""}
                        onChange={(event) =>
                          patchLine(line.id, {
                            amount: Number(event.target.value.replace(/[^0-9.-]/g, "")) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="paper-field w-28"
                        value={line.status}
                        onChange={(event) =>
                          patchLine(line.id, { status: event.target.value as PurchaseLine["status"] })
                        }
                      >
                        {PURCHASE_STATUSES.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="paper-field w-48"
                        value={line.estimateTieKind && line.estimateTieId ? `${line.estimateTieKind}:${line.estimateTieId}` : ""}
                        onChange={(event) => setTie(line, event.target.value)}
                      >
                        <option value="">Free label only</option>
                        {ties.map((row) => (
                          <option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-36"
                        placeholder="or type a label"
                        value={line.estimateTieLabel}
                        onChange={(event) => patchLine(line.id, { estimateTieLabel: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="paper-field w-36"
                        placeholder="filename.pdf"
                        value={line.attachmentName}
                        onChange={(event) => patchLine(line.id, { attachmentName: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => persist(removePurchaseLine(book, line.id))}
                        className="text-steel underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Dated totals log</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Same dated-history pattern as Cost report — saves category + grand totals, not a second
          invoice vault.
        </p>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-[#5b6f73]">No saved days yet. Set the status date and save.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {["Status date", "Grand", "Tools + cons.", "Misc budget", "Variance", "Lines", "Notes", ""].map(
                    (header) => (
                      <th key={header || "open"} className="px-2 py-2">
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {history.map((shot) => (
                  <tr key={shot.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2 font-mono">{shot.statusDate}</td>
                    <td className="px-2 py-2 font-mono">{money(shot.totals.grand)}</td>
                    <td className="px-2 py-2 font-mono">{money(shot.totals.toolsConsumables)}</td>
                    <td className="px-2 py-2 font-mono">
                      {shot.vsBudget.hasMiscBudget ? money(shot.vsBudget.miscBudget) : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {shot.vsBudget.hasMiscBudget ? money(shot.vsBudget.variance) : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono">{shot.lineCount}</td>
                    <td className="px-2 py-2">{shot.notes || "—"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => persist(openPurchasingSnapshot(book, shot.id))}
                        className="text-steel underline"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-[#5b6f73]">Parked this pass: {PURCHASING_PARKED.join(" · ")}.</p>
    </div>
  );
}
