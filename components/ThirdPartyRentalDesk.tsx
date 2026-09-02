"use client";

import { useEffect, useState } from "react";
import { deskFetch } from "@/lib/estimate-vault-client";
import { formatDeskDollars } from "@/lib/shahan-wood-river";
import {
  WOOD_RIVER_THIRD_PARTY_BOOK_LABEL,
  blankThirdPartyRow,
  type ThirdPartyRentalRow,
} from "@/lib/third-party-rental";

function moneyText(value: number | null) {
  return value == null || value === 0 ? "—" : formatDeskDollars(value);
}

function moneyInput(value: number | null) {
  return value == null ? "" : String(value);
}

function parseInput(raw: string): number | null {
  if (!raw.trim()) return null;
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

export function ThirdPartyRentalDesk({ editable }: { editable: boolean }) {
  const [catalog, setCatalog] = useState<ThirdPartyRentalRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    deskFetch("/api/desk/rates/third-party")
      .then(async (response) => {
        const data = await response.json();
        if (cancelled || !response.ok || !Array.isArray(data.catalog)) return;
        setCatalog(data.catalog);
        setLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(next: ThirdPartyRentalRow[]) {
    setCatalog(next);
    if (!editable) return;
    await deskFetch("/api/desk/rates/third-party", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ catalog: next }),
    }).catch(() => undefined);
  }

  function patch(index: number, patch: Partial<ThirdPartyRentalRow>) {
    const next = catalog.map((row, i) => (i === index ? { ...row, ...patch } : row));
    void persist(next);
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#163038]">{WOOD_RIVER_THIRD_PARTY_BOOK_LABEL}</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            {editable
              ? "Description, daily, weekly, monthly, and freight. Add or delete a row when vendors change the list."
              : "Wood River third-party rental dollars. Read-only."}
          </p>
        </div>
        {editable ? (
          <button
            type="button"
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            onClick={() => void persist([...catalog, blankThirdPartyRow()])}
          >
            + Add row
          </button>
        ) : null}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["DESCRIPTION", "DAILY", "WEEKLY", "MONTHLY", "FREIGHT"].map((header) => (
                <th key={header} className="px-2 py-2">
                  {header}
                </th>
              ))}
              {editable ? (
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={editable ? 6 : 5} className="px-2 py-4 text-sm text-[#5b6f73]">
                  Loading rental list…
                </td>
              </tr>
            ) : catalog.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={editable ? 6 : 5} className="px-2 py-4 text-sm text-[#5b6f73]">
                  No third-party rental rows.
                </td>
              </tr>
            ) : (
              catalog.map((row, index) => (
                <tr key={`${row.description}:${index}`} className="border-t border-[#d5e0de] align-top">
                  <td className="px-2 py-2">
                    {editable ? (
                      <input
                        className="paper-field w-full min-w-[12rem]"
                        value={row.description}
                        onChange={(event) => patch(index, { description: event.target.value })}
                        aria-label="Rental description"
                      />
                    ) : (
                      row.description
                    )}
                  </td>
                  <td className="px-2 py-2 font-semibold">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={moneyInput(row.daily)}
                        onChange={(event) => patch(index, { daily: parseInput(event.target.value) })}
                        aria-label="Daily rate"
                      />
                    ) : (
                      moneyText(row.daily)
                    )}
                  </td>
                  <td className="px-2 py-2 font-semibold">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={moneyInput(row.weekly)}
                        onChange={(event) => patch(index, { weekly: parseInput(event.target.value) })}
                        aria-label="Weekly rate"
                      />
                    ) : (
                      moneyText(row.weekly)
                    )}
                  </td>
                  <td className="px-2 py-2 font-semibold">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={moneyInput(row.monthly)}
                        onChange={(event) => patch(index, { monthly: parseInput(event.target.value) })}
                        aria-label="Monthly rate"
                      />
                    ) : (
                      moneyText(row.monthly)
                    )}
                  </td>
                  <td className="px-2 py-2 font-semibold">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        className="paper-field w-24"
                        value={row.freight || ""}
                        onChange={(event) => patch(index, { freight: Number(event.target.value) || 0 })}
                        aria-label="Freight"
                      />
                    ) : (
                      moneyText(row.freight)
                    )}
                  </td>
                  {editable ? (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-sm text-steel underline"
                        onClick={() => void persist(catalog.filter((_, i) => i !== index))}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
