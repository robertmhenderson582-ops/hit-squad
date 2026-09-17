"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogPick } from "@/components/CatalogPick";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  addClaimLine,
  addCraftLine,
  addLogRow,
  changeOrderNoun,
  CLAIMABLE_COST_TYPES,
  claimTypeNeedsHours,
  CONTRACTOR_LOG_COLUMNS,
  craftLineHours,
  craftLineLabor,
  DEFAULT_CHANGE_ORDER_SHELL,
  emptyFcrPacket,
  fcrSummary,
  LOG_STATUSES,
  logRowScope,
  patchLogRow,
  readFcrPacket,
  writeFcrPacket,
  type FcrLogRow,
  type FcrPacket,
  type ScrClaimLine,
  type ScrCraftLine,
} from "@/lib/change-order-packet";
import { onEstimateSheets } from "@/lib/sheet-events";
import { shahanCrewTitle } from "@/lib/shahan-wood-river";
import { scrCompositeRates, scrCraftOptions } from "@/lib/scr-rates";

const SHELLS = ["Log", "Estimate", "SCR"] as const;

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

function numField(value: number) {
  return value ? String(value) : "";
}

function crewTitles(pack: ReturnType<typeof useEstimatePackage>) {
  return [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct, ...pack.crew.support]
    .map((row) => shahanCrewTitle(row))
    .filter(Boolean);
}

export function ChangeOrderPacket({ client, site }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const noun = changeOrderNoun(client, site);
  const [shell, setShell] = useState<(typeof SHELLS)[number]>(DEFAULT_CHANGE_ORDER_SHELL);
  const [packet, setPacket] = useState<FcrPacket>(emptyFcrPacket);
  const [selectedId, setSelectedId] = useState("");

  const crafts = useMemo(
    () => scrCraftOptions(site, client, crewTitles(pack)),
    [client, pack.crew, site],
  );

  useEffect(() => {
    function load() {
      if (!pack.estimateKey) {
        setPacket(emptyFcrPacket());
        setSelectedId("");
        return;
      }
      const saved = readFcrPacket(pack.estimateKey);
      setPacket(saved);
      setSelectedId((current) => current && saved.log.some((row) => row.id === current) ? current : saved.log[0]?.id || "");
    }
    load();
    return onEstimateSheets(load);
  }, [pack.estimateKey, pack.ready]);

  function persist(next: FcrPacket) {
    setPacket(next);
    writeFcrPacket(pack.estimateKey, next);
    if (selectedId && !next.log.some((row) => row.id === selectedId)) {
      setSelectedId(next.log[0]?.id || "");
    }
  }

  function addOrder(patch: Partial<FcrLogRow> = {}) {
    const next = addLogRow(packet, patch);
    const added = next.log[next.log.length - 1];
    if (added) setSelectedId(added.id);
    persist(next);
    return next;
  }

  const selected = packet.log.find((row) => row.id === selectedId) ?? packet.log[0] ?? null;
  const selectedScope = selected ? logRowScope(selected) : null;
  const summary = fcrSummary(packet, 0, 0);
  const logColSpan = CONTRACTOR_LOG_COLUMNS.length + 2;

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        On-job Change Orders log. {noun} math stays under the hood. Scope change takes hours and
        money. The SCR estimate is a short workbook — craft lines at composite ST / OT (DT optional)
        plus claimable pass-throughs — not the full day-grid desk. Totals stay on this estimate after
        refresh or another device.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Change Orders packet">
        {SHELLS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setShell(item)}
            className={`rounded px-3 py-1.5 ${shell === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {item === "Log" ? "Change Orders log" : item}
          </button>
        ))}
      </nav>

      {shell === "Log" ? (
        <section className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-[#163038]">Change Orders log</h2>
              <p className="mt-1 text-sm text-[#5b6f73]">
                Contractor log — SCR, request, who asked, status, and scope change (description,
                hours, and money). Adding a row writes the live pack.
              </p>
            </div>
            <button
              type="button"
              onClick={() => addOrder()}
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            >
              + Add Change Order
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["pm", "PM"],
                ["costTracker", "Cost Tracker"],
                ["publishDate", "Publish Date"],
                ["nte", "NTE"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input
                  className="paper-field mt-1"
                  value={packet.header[key]}
                  onChange={(event) =>
                    persist({ ...packet, header: { ...packet.header, [key]: event.target.value } })
                  }
                />
              </label>
            ))}
            <label className="block text-sm sm:col-span-2">
              Project Scope
              <textarea
                rows={2}
                className="paper-field mt-1"
                value={packet.header.projectScope}
                onChange={(event) =>
                  persist({ ...packet, header: { ...packet.header, projectScope: event.target.value } })
                }
              />
            </label>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {CONTRACTOR_LOG_COLUMNS.map((column) => (
                    <th key={column.key} className="px-2 py-2">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-2 py-2">Hours</th>
                  <th className="px-2 py-2">$</th>
                </tr>
              </thead>
              <tbody>
                {packet.log.length === 0 ? (
                  <tr>
                    <td colSpan={logColSpan} className="px-2 py-6 text-[#5b6f73]">
                      <p>No Change Orders on this job yet.</p>
                      <button
                        type="button"
                        onClick={() => addOrder()}
                        className="mt-3 rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
                      >
                        + Add Change Order
                      </button>
                    </td>
                  </tr>
                ) : (
                  packet.log.map((row) => {
                    const scope = logRowScope(row);
                    return (
                      <tr key={row.id} className="border-t border-[#d5e0de] align-top">
                        {(["scr", "requestDate", "requestedBy"] as const).map((key) => (
                          <td key={key} className="px-2 py-2">
                            <input
                              className="paper-field min-w-[7rem]"
                              value={row[key]}
                              onChange={(event) => persist(patchLogRow(packet, row.id, { [key]: event.target.value }))}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <select
                            className="paper-field"
                            value={row.status}
                            onChange={(event) =>
                              persist(
                                patchLogRow(packet, row.id, {
                                  status: event.target.value as (typeof LOG_STATUSES)[number],
                                }),
                              )
                            }
                          >
                            {LOG_STATUSES.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="paper-field min-w-[12rem]"
                            value={row.scope}
                            onChange={(event) => persist(patchLogRow(packet, row.id, { scope: event.target.value }))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="paper-field w-24"
                            aria-label="Scope change hours"
                            readOnly={scope.hasLines}
                            value={numField(scope.hours)}
                            onChange={(event) =>
                              persist(patchLogRow(packet, row.id, { scopeHours: Number(event.target.value) || 0 }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="paper-field w-28"
                            aria-label="Scope change money"
                            readOnly={scope.hasLines}
                            value={numField(scope.cost)}
                            onChange={(event) =>
                              persist(patchLogRow(packet, row.id, { scopeCost: Number(event.target.value) || 0 }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {shell === "Estimate" ? (
        <ScrEstimateWorkbook
          packet={packet}
          selected={selected}
          crafts={crafts}
          site={site}
          client={client}
          onSelect={setSelectedId}
          onAddOrder={() => addOrder()}
          onPersist={persist}
        />
      ) : null}

      {shell === "SCR" ? (
        <section className="plant-card space-y-3 px-5 py-5">
          <h2 className="text-2xl font-semibold text-[#163038]">SCR form</h2>
          <p className="text-sm text-[#5b6f73]">
            Scope-change hours and money roll from the Estimate workbook (craft labor + claimable
            costs). Cost is not a note-only field.
          </p>
          {(
            [
              ["taRm", "TA / RM"],
              ["categories", "Categories"],
              ["moc", "MOC"],
              ["sap", "SAP"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                className="paper-field mt-1"
                value={packet.scr[key]}
                onChange={(event) => persist({ ...packet, scr: { ...packet.scr, [key]: event.target.value } })}
              />
            </label>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Hours
              <input
                className="paper-field mt-1"
                readOnly
                aria-label="Scope change hours"
                value={numField(selectedScope?.hours ?? summary.scrHours)}
              />
            </label>
            <label className="block text-sm">
              Cost $
              <input
                className="paper-field mt-1"
                readOnly
                aria-label="Scope change money"
                value={numField(selectedScope?.cost ?? summary.scrCost)}
              />
            </label>
          </div>
          <label className="block text-sm">
            Cost note
            <input
              className="paper-field mt-1"
              value={packet.scr.costNote}
              onChange={(event) => persist({ ...packet, scr: { ...packet.scr, costNote: event.target.value } })}
            />
          </label>
          {(
            [
              ["scheduleNote", "Schedule"],
              ["signOff", "Sign-off"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                className="paper-field mt-1"
                value={packet.scr[key]}
                onChange={(event) => persist({ ...packet, scr: { ...packet.scr, [key]: event.target.value } })}
              />
            </label>
          ))}
          <p className="text-sm text-[#163038]">
            Craft labor {money(summary.scrLabor)} · Claims {money(summary.scrClaims)} · SCR total{" "}
            {money(summary.scrCost || summary.total)}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ScrEstimateWorkbook({
  packet,
  selected,
  crafts,
  site,
  client,
  onSelect,
  onAddOrder,
  onPersist,
}: {
  packet: FcrPacket;
  selected: FcrLogRow | null;
  crafts: string[];
  site?: string;
  client?: string;
  onSelect: (id: string) => void;
  onAddOrder: () => void;
  onPersist: (next: FcrPacket) => void;
}) {
  const scope = selected ? logRowScope(selected) : null;

  function applyCraft(line: ScrCraftLine, patch: Partial<ScrCraftLine>) {
    if (!selected) return;
    const next = { ...line, ...patch };
    if (patch.craft != null) {
      const rates = scrCompositeRates(patch.craft, site, client);
      next.stRate = rates.st;
      next.otRate = rates.ot;
      next.dtRate = rates.dt;
    }
    onPersist(
      patchLogRow(packet, selected.id, {
        craftLines: selected.craftLines.map((item) => (item.id === line.id ? next : item)),
      }),
    );
  }

  function applyClaim(line: ScrClaimLine, patch: Partial<ScrClaimLine>) {
    if (!selected) return;
    onPersist(
      patchLogRow(packet, selected.id, {
        claimLines: selected.claimLines.map((item) => (item.id === line.id ? { ...item, ...patch } : item)),
      }),
    );
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">SCR estimate</h2>
      <p className="mt-1 text-sm text-[#5b6f73]">
        Simpler than the full estimate desk. Add craft lines — pick a craft, enter hours, price with
        composite ST / OT (DT optional). Labor $ is hours × those rates. Add claimable cost lines
        (Subcontractor, Third-party rental, Material — describe + $; hours only when that type
        needs them). The catalog stays extensible for other pass-throughs. The SCR total is craft
        labor plus claims.
      </p>
      {packet.log.length === 0 ? (
        <div className="mt-4 text-sm text-[#5b6f73]">
          <p>Add a Change Order to estimate scope-change hours and money.</p>
          <button type="button" onClick={onAddOrder} className="mt-3 rounded-lg bg-steel px-3 py-1.5 text-sm text-white">
            + Add Change Order
          </button>
        </div>
      ) : (
        <>
          <label className="mt-4 block text-sm">
            Change Order
            <select
              className="paper-field mt-1 max-w-xl"
              value={selected?.id || ""}
              onChange={(event) => onSelect(event.target.value)}
            >
              {packet.log.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.scr || "Untitled")}{row.scope ? ` — ${row.scope}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-[#163038]">Craft lines</h3>
            <button
              type="button"
              onClick={() => selected && onPersist(addCraftLine(packet, selected.id))}
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            >
              + Add craft
            </button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {["CRAFT", "ST HRS", "OT HRS", "DT HRS", "ST $/HR", "OT $/HR", "DT $/HR", "LABOR $", ""].map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selected?.craftLines.length ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-[#5b6f73]">
                      No craft lines yet.
                    </td>
                  </tr>
                ) : (
                  selected.craftLines.map((line) => (
                    <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                      <td className="px-2 py-2">
                        <CatalogPick
                          value={line.craft}
                          options={crafts}
                          placeholder="Pick a craft"
                          allowCustom
                          onChange={(craft) => applyCraft(line, { craft })}
                        />
                      </td>
                      {(
                        [
                          ["stHours", "ST hours"],
                          ["otHours", "OT hours"],
                          ["dtHours", "DT hours (optional)"],
                          ["stRate", "ST composite rate"],
                          ["otRate", "OT composite rate"],
                          ["dtRate", "DT composite rate (optional)"],
                        ] as const
                      ).map(([key, label]) => (
                        <td key={key} className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="paper-field w-24"
                            aria-label={label}
                            placeholder={key.startsWith("dt") ? "opt" : ""}
                            value={numField(line[key])}
                            onChange={(event) => applyCraft(line, { [key]: Number(event.target.value) || 0 })}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 font-semibold">{money(craftLineLabor(line))}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="text-sm text-steel"
                          onClick={() =>
                            onPersist(
                              patchLogRow(packet, selected.id, {
                                craftLines: selected.craftLines.filter((item) => item.id !== line.id),
                              }),
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-[#163038]">Claimable costs</h3>
            <button
              type="button"
              onClick={() => selected && onPersist(addClaimLine(packet, selected.id))}
              className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
            >
              + Add claimable cost
            </button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {["TYPE", "DESCRIPTION", "HOURS", "$", ""].map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selected?.claimLines.length ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-[#5b6f73]">
                      No claimable cost lines yet. Use Subcontractor, Third-party rental, Material, or
                      type another pass-through.
                    </td>
                  </tr>
                ) : (
                  selected.claimLines.map((line) => {
                    const needsHours = claimTypeNeedsHours(line.type);
                    return (
                      <tr key={line.id} className="border-t border-[#d5e0de] align-top">
                        <td className="px-2 py-2">
                          <CatalogPick
                            value={line.type}
                            options={CLAIMABLE_COST_TYPES}
                            placeholder="Cost type"
                            allowCustom
                            onChange={(type) => applyClaim(line, { type })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="paper-field min-w-[12rem]"
                            aria-label="Claimable cost description"
                            value={line.description}
                            onChange={(event) => applyClaim(line, { description: event.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="paper-field w-24"
                            aria-label="Claimable cost hours"
                            placeholder={needsHours ? "" : "opt"}
                            value={numField(line.hours)}
                            onChange={(event) => applyClaim(line, { hours: Number(event.target.value) || 0 })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="paper-field w-28"
                            aria-label="Claimable cost money"
                            required
                            value={numField(line.amount)}
                            onChange={(event) => applyClaim(line, { amount: Number(event.target.value) || 0 })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="text-sm text-steel"
                            onClick={() =>
                              onPersist(
                                patchLogRow(packet, selected.id, {
                                  claimLines: selected.claimLines.filter((item) => item.id !== line.id),
                                }),
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-[#163038]">
            Craft hours{" "}
            {selected?.craftLines.reduce((sum, line) => sum + craftLineHours(line), 0) ?? 0}h · Labor{" "}
            {money(scope?.labor ?? 0)} · Claims {money(scope?.claims ?? 0)} · SCR total{" "}
            {money(scope?.cost ?? 0)}
          </p>
        </>
      )}
    </section>
  );
}
