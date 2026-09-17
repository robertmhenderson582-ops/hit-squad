"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BuildingFileModal } from "@/components/BuildingFileModal";
import { CatalogPick } from "@/components/CatalogPick";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useSession } from "@/components/SessionProvider";
import {
  addClaimLine,
  addCraftLine,
  CHANGE_ORDER_SHELLS,
  CHANGE_ORDER_SHELL_LABELS,
  changeOrderNoun,
  CLAIMABLE_COST_TYPES,
  claimTypeNeedsHours,
  CONTRACTOR_LOG_COLUMNS,
  craftLineHours,
  craftLineLabor,
  DEFAULT_CHANGE_ORDER_SHELL,
  emptyFcrPacket,
  ensureDraftRow,
  logRowIsSubmitted,
  LOG_STATUSES,
  logRowScope,
  patchLogRow,
  readFcrPacket,
  submitScrEstimate,
  submittedLogRows,
  writeFcrPacket,
  type ChangeOrderShell,
  type FcrLogRow,
  type FcrPacket,
  type ScrClaimLine,
  type ScrCraftLine,
} from "@/lib/change-order-packet";
import { companyLogoFromApiPayload } from "@/lib/estimate-company-logo";
import { packIdFromEstimateKey } from "@/lib/estimate-pack";
import { estimateCompanyName, exporterDisplayName } from "@/lib/estimate-xlsx";
import { findLocalPack } from "@/lib/local-estimates";
import { onEstimateSheets } from "@/lib/sheet-events";
import { shahanCrewTitle } from "@/lib/shahan-wood-river";
import { scrCompositeRates, scrCraftOptions } from "@/lib/scr-rates";
import { SCR_EXPORT_ERROR, scrToXlsx, scrXlsxFilename } from "@/lib/scr-xlsx";
import { regularClientFromParts } from "@/lib/site-regular";
import { yieldToUi } from "@/lib/ui-yield";
import { downloadXlsx } from "@/lib/xlsx-minimal";

async function fetchScrCompanyLogo(client: string, site: string): Promise<string | null> {
  try {
    const query = new URLSearchParams({ client, site });
    const res = await fetch(`/api/desk/company-logo?${query}`, { cache: "no-store" });
    if (!res.ok) return null;
    return companyLogoFromApiPayload(await res.json());
  } catch {
    return null;
  }
}

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
  const { user } = useSession();
  const noun = changeOrderNoun(client, site);
  const [shell, setShell] = useState<ChangeOrderShell>(DEFAULT_CHANGE_ORDER_SHELL);
  const [packet, setPacket] = useState<FcrPacket>(emptyFcrPacket);
  const [selectedId, setSelectedId] = useState("");
  const exportLock = useRef(false);
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const jobTitle = findLocalPack(packIdFromEstimateKey(pack.estimateKey) || "")?.title || "Estimate";
  const company = estimateCompanyName({ client, site, title: jobTitle });

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

  const posted = submittedLogRows(packet);
  const selected = packet.log.find((row) => row.id === selectedId) ?? null;
  const logColSpan = CONTRACTOR_LOG_COLUMNS.length + 3;

  function openWorkbook(id?: string) {
    if (id && packet.log.some((row) => row.id === id)) {
      setSelectedId(id);
      setShell("Estimate");
      return;
    }
    const next = ensureDraftRow(packet);
    persist(next.packet);
    setSelectedId(next.id);
    setShell("Estimate");
  }

  function submitSelected() {
    const source = selected ? { packet, id: selected.id } : ensureDraftRow(packet);
    const next = submitScrEstimate(source.packet, source.id);
    persist(next);
    setSelectedId(source.id);
    setShell("Log");
  }

  async function exportWorkbook() {
    if (exportLock.current || exportBusy) return;
    exportLock.current = true;
    setExportError("");
    setExportBusy(true);
    setExportModal(true);
    await yieldToUi();
    try {
      const bytes = await scrToXlsx({
        title: jobTitle,
        client,
        site,
        packet,
        preparedBy: exporterDisplayName(user?.name, user?.email),
        status: pack.status,
        regularClient: regularClientFromParts(site, client),
        companyName: company,
        companyLogo: await fetchScrCompanyLogo(client || "", site || ""),
        selectedId,
      });
      if (!bytes.byteLength) throw new Error("empty-workbook");
      downloadXlsx(scrXlsxFilename({ site, title: jobTitle, client, companyName: company }), bytes);
      setExportModal(false);
    } catch {
      setExportError(SCR_EXPORT_ERROR);
    } finally {
      exportLock.current = false;
      setExportBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Two surfaces only: the Estimate workbook, then Submit onto the SCR Log. {noun} math stays
        under the hood. Fill craft lines at composite ST / OT (DT optional) plus claimable
        pass-throughs — not the full day-grid desk. Submit posts that packet as a log row. Open a
        submitted row to revise the same SCR # in place; status lives on the log. Export Excel is
        the client-submittable proof.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="SCR packet">
          {CHANGE_ORDER_SHELLS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => (item === "Estimate" ? openWorkbook(selectedId || undefined) : setShell(item))}
              className={`rounded px-3 py-1.5 ${shell === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
            >
              {CHANGE_ORDER_SHELL_LABELS[item]}
            </button>
          ))}
        </nav>
        <button
          type="button"
          title="Export Excel workbook"
          disabled={exportBusy}
          onClick={() => void exportWorkbook()}
          className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {exportBusy ? "Building file…" : "Export Excel"}
        </button>
      </div>
      {exportError ? (
        <p className="text-sm text-amber-flare" role="alert">
          {exportError}
        </p>
      ) : null}

      {shell === "Log" ? (
        <section className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-[#163038]">SCR Log</h2>
              <p className="mt-1 text-sm text-[#5b6f73]">
                Register of submitted SCRs — number, request, who asked, status, and scope change
                (description, hours, and money). Open a row to revise the same estimate packet.
                Status and register fields stay editable here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openWorkbook()}
              className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
            >
              New estimate
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
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {posted.length === 0 ? (
                  <tr>
                    <td colSpan={logColSpan} className="px-2 py-6 text-[#5b6f73]">
                      <p>No submitted SCRs on this job yet. Fill the Estimate workbook, then Submit.</p>
                      <button
                        type="button"
                        onClick={() => openWorkbook()}
                        className="mt-3 rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
                      >
                        Open Estimate workbook
                      </button>
                    </td>
                  </tr>
                ) : (
                  posted.map((row) => {
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
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="text-sm text-steel"
                            onClick={() => openWorkbook(row.id)}
                          >
                            Open
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
      ) : null}

      {shell === "Estimate" ? (
        <ScrEstimateWorkbook
          packet={packet}
          selected={selected}
          crafts={crafts}
          site={site}
          client={client}
          onPersist={persist}
          onSubmit={submitSelected}
          onNew={() => openWorkbook()}
        />
      ) : null}
      {exportModal ? (
        <BuildingFileModal
          error={exportBusy ? "" : exportError}
          onDismissError={!exportBusy && exportError ? () => setExportModal(false) : undefined}
        />
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
  onPersist,
  onSubmit,
  onNew,
}: {
  packet: FcrPacket;
  selected: FcrLogRow | null;
  crafts: string[];
  site?: string;
  client?: string;
  onPersist: (next: FcrPacket) => void;
  onSubmit: () => void;
  onNew: () => void;
}) {
  const scope = selected ? logRowScope(selected) : null;
  const posted = selected ? logRowIsSubmitted(selected) : false;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#163038]">Estimate workbook</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Simpler than the full estimate desk. Add craft lines — pick a craft, enter hours, price
            with composite ST / OT (DT optional). Labor $ is hours × those rates. Add claimable
            cost lines (Subcontractor, Third-party rental, Material — describe + $; hours only when
            that type needs them). Submit posts this packet onto the SCR Log. Opening a log row
            edits the same SCR # in place — it does not mint a new number.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNew} className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel">
            New estimate
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
          >
            {posted ? "View SCR Log" : "Submit to SCR Log"}
          </button>
        </div>
      </div>
      {selected ? (
        <>
          <p className="mt-3 text-sm text-[#163038]">
            {posted
              ? `${selected.scr || "Untitled"} is on the SCR Log. Edits save on this packet.`
              : "Draft — not on the SCR Log until you Submit."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              SCR #
              <input
                className="paper-field mt-1"
                value={selected.scr}
                onChange={(event) => onPersist(patchLogRow(packet, selected.id, { scr: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Requested by
              <input
                className="paper-field mt-1"
                value={selected.requestedBy}
                onChange={(event) =>
                  onPersist(patchLogRow(packet, selected.id, { requestedBy: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              Scope change
              <input
                className="paper-field mt-1"
                value={selected.scope}
                onChange={(event) => onPersist(patchLogRow(packet, selected.id, { scope: event.target.value }))}
              />
            </label>
            {(
              [
                ["taRm", "TA / RM"],
                ["moc", "MOC"],
                ["sap", "SAP"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input
                  className="paper-field mt-1"
                  value={packet.scr[key]}
                  onChange={(event) => onPersist({ ...packet, scr: { ...packet.scr, [key]: event.target.value } })}
                />
              </label>
            ))}
          </div>

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
