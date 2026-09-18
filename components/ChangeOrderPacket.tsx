"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BuildingFileModal } from "@/components/BuildingFileModal";
import { CatalogPick } from "@/components/CatalogPick";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { canEditChangeOrders, CHANGE_ORDERS_DENIED } from "@/lib/module-access";
import {
  addClaimLine,
  addCraftLine,
  addScrAttachments,
  applyScrClientLabels,
  CHANGE_ORDER_SHELLS,
  CHANGE_ORDER_SHELL_LABELS,
  changeOrderNoun,
  CLAIMABLE_COST_TYPES,
  claimTypeNeedsHours,
  clientScrIdHelp,
  clientScrIdPlaceholder,
  CONTRACTOR_LOG_COLUMNS,
  craftLineHours,
  craftLineLabor,
  DEFAULT_CHANGE_ORDER_SHELL,
  DEFAULT_SCOPE_ID_LABEL,
  emptyFcrPacket,
  ensureDraftRow,
  formatScrMoney,
  logRowIsSubmitted,
  logRowScope,
  patchLogRow,
  readFcrPacket,
  removeScrAttachment,
  SCR_STATUSES,
  SCR_TYPE_LABELS,
  SCR_TYPES,
  SCR_WHY_REASONS,
  scrAttachmentOpenUrl,
  seedScopeIdLabel,
  submitScrEstimate,
  submittedLogRows,
  toggleScrWhy,
  writeFcrPacket,
  type ChangeOrderShell,
  type FcrLogRow,
  type FcrPacket,
  type ScrAttachment,
  type ScrClaimLine,
  type ScrCraftLine,
  type ScrStatus,
  type ScrType,
} from "@/lib/change-order-packet";
import { viewAsInit } from "@/lib/desk-scope";
import { fileToLead } from "@/lib/lead-briefs";
import { QUALITY_DROP_ACCEPT, checkQualityDrop } from "@/lib/quality-folders";
import { SCR_ATTACHMENT_VIEW_ERROR, SCR_ATTACHMENT_WRITE_ERROR } from "@/lib/scr-attachment-shared";
import { companyLogoFromApiPayload } from "@/lib/estimate-company-logo";
import { packIdFromEstimateKey } from "@/lib/estimate-pack";
import { estimateCompanyName, exporterDisplayName } from "@/lib/estimate-xlsx";
import { findLocalPack } from "@/lib/local-estimates";
import { onEstimateSheets } from "@/lib/sheet-events";
import { shahanCrewTitle } from "@/lib/shahan-wood-river";
import {
  recomputeScrCraftRates,
  scrActiveSchedule,
  scrCompositeHourlyRate,
  scrCraftOptions,
  scrPhaseOptions,
  SCR_COMPOSITE_RATE_HEADER,
  SCR_COMPOSITE_RATE_LABEL,
  SCR_COMPOSITE_RATE_NOTE,
  SCR_SHIFT_PRESETS,
} from "@/lib/scr-rates";
import { SCR_EXPORT_ERROR } from "@/lib/scr-xlsx";
import { SCR_ZIP_EXPORT_ERROR, scrToZip, scrZipFilename } from "@/lib/scr-zip";
import { regularClientFromParts } from "@/lib/site-regular";
import { yieldToUi } from "@/lib/ui-yield";
import { downloadZip } from "@/lib/xlsx-minimal";

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
  return formatScrMoney(value);
}

function numField(value: number) {
  return value ? String(value) : "";
}

function crewTitles(pack: ReturnType<typeof useEstimatePackage>) {
  return [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct, ...pack.crew.support]
    .map((row) => shahanCrewTitle(row))
    .filter(Boolean);
}

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKind(file: Pick<ScrAttachment, "name" | "type">) {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toUpperCase() : "";
  if (/pdf/i.test(file.type) || ext === "PDF") return "PDF";
  if (/image/i.test(file.type) || /^(PNG|JPE?G|WEBP|GIF)$/.test(ext)) return "Photo";
  if (/sheet|excel|csv/i.test(file.type) || /^(XLSX?|CSV)$/.test(ext)) return "Spreadsheet";
  if (/word|document/i.test(file.type) || /^DOCX?$/.test(ext)) return "Document";
  return ext || "File";
}

function formatAddedAt(value: string) {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return value || "—";
  return new Date(stamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function ChangeOrderPacket({ client, site }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const { user } = useSession();
  const lens = useLensUser();
  const owner = useOwnerDesk();
  const canWrite = canEditChangeOrders(lens);
  const noun = changeOrderNoun(client, site);
  const packId = packIdFromEstimateKey(pack.estimateKey);
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
      const saved = applyScrClientLabels(readFcrPacket(pack.estimateKey), client, site);
      setPacket(saved);
      setSelectedId((current) => current && saved.log.some((row) => row.id === current) ? current : saved.log[0]?.id || "");
    }
    load();
    return onEstimateSheets(load);
  }, [client, pack.estimateKey, pack.ready, site]);

  function persist(next: FcrPacket) {
    if (!canWrite) return;
    setPacket(next);
    writeFcrPacket(pack.estimateKey, next);
    if (selectedId && !next.log.some((row) => row.id === selectedId)) {
      setSelectedId(next.log[0]?.id || "");
    }
  }

  const posted = submittedLogRows(packet);
  const selected = packet.log.find((row) => row.id === selectedId) ?? null;
  const phases = useMemo(() => scrPhaseOptions(pack.schedule), [pack.schedule]);
  const logColSpan = CONTRACTOR_LOG_COLUMNS.length + 5;

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

  async function attachmentBytes() {
    if (!packId) return [];
    const files: Array<{ name: string; scr: string; bytes: Uint8Array }> = [];
    for (const row of packet.log) {
      for (const file of row.attachments) {
        if (!file.driveId) continue;
        const query = new URLSearchParams({ rowId: row.id, fileId: file.driveId });
        const href = `/api/desk/estimates/${encodeURIComponent(packId)}/scr-attachments?${query}`;
        const response = await fetch(href, viewAsInit(owner?.viewAs));
        if (!response.ok) continue;
        files.push({
          name: file.name,
          scr: row.scr || "scr",
          bytes: new Uint8Array(await response.arrayBuffer()),
        });
      }
    }
    return files;
  }

  async function exportPackage() {
    if (exportLock.current || exportBusy) return;
    exportLock.current = true;
    setExportError("");
    setExportBusy(true);
    setExportModal(true);
    await yieldToUi();
    try {
      const attachments = await attachmentBytes();
      const bytes = await scrToZip({
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
        attachments,
        scr: selected?.scr,
        scopeId: selected?.scopeId,
      });
      if (!bytes.byteLength) throw new Error("empty-package");
      downloadZip(
        scrZipFilename({
          site,
          title: jobTitle,
          client,
          packet,
          selectedId,
          scr: selected?.scr,
          scopeId: selected?.scopeId,
        }),
        bytes,
      );
      setExportModal(false);
    } catch {
      setExportError(SCR_ZIP_EXPORT_ERROR || SCR_EXPORT_ERROR);
    } finally {
      exportLock.current = false;
      setExportBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Two surfaces only: the Estimate workbook, then Submit onto the SCR Log. {noun} math stays
        under the hood. Same workbook on every job — one hours box, locked composite $/hr from
        phase (or optional shift), Addition or Credit / deletion. Submit posts that packet as a
        log row. Open a submitted row to revise the same SCR # in place. Download package is the
        client ZIP (Excel + backups). Owner assigns Change Orders under Settings → Privileges — not
        every Project Manager. Owner always can.
      </p>
      {canWrite ? null : <p className="mt-2 text-sm text-[#5b6f73]">{CHANGE_ORDERS_DENIED}</p>}
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
          title="Download ZIP package"
          disabled={exportBusy}
          onClick={() => void exportPackage()}
          className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {exportBusy ? "Building file…" : "Download package (ZIP)"}
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
                Register of submitted SCRs — Hit Squad number, client ID, type, status, issue,
                hours, and signed money. Open a row to revise the same estimate packet. Status and
                Client SCR ID stay editable here after submit.
              </p>
            </div>
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => openWorkbook()}
              className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel disabled:cursor-not-allowed disabled:opacity-50"
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
                  <th className="px-2 py-2">Client SCR ID</th>
                  <th className="px-2 py-2">Type</th>
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
                        <td className="px-2 py-2">
                          <input className="paper-field min-w-[7rem]" value={row.scr} readOnly aria-label="Hit Squad SCR #" />
                        </td>
                        {(["requestDate", "requestedBy"] as const).map((key) => (
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
                                  status: event.target.value as ScrStatus,
                                }),
                              )
                            }
                          >
                            {SCR_STATUSES.map((item) => (
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
                            className="paper-field min-w-[7rem]"
                            aria-label="Client SCR ID"
                            placeholder={clientScrIdPlaceholder(client, site)}
                            value={row.clientScrId}
                            onChange={(event) => persist(patchLogRow(packet, row.id, { clientScrId: event.target.value }))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="paper-field"
                            aria-label="SCR type"
                            value={row.scrType}
                            onChange={(event) =>
                              persist(patchLogRow(packet, row.id, { scrType: event.target.value as ScrType }))
                            }
                          >
                            {SCR_TYPES.map((item) => (
                              <option key={item} value={item}>
                                {SCR_TYPE_LABELS[item]}
                              </option>
                            ))}
                          </select>
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
          phases={phases}
          site={site}
          client={client}
          packId={packId || ""}
          canEdit={canWrite}
          viewAs={owner?.viewAs}
          exportBusy={exportBusy}
          onPersist={persist}
          onSubmit={submitSelected}
          onNew={() => openWorkbook()}
          onDownload={() => void exportPackage()}
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
  phases,
  site,
  client,
  packId,
  canEdit,
  viewAs,
  exportBusy,
  onPersist,
  onSubmit,
  onNew,
  onDownload,
}: {
  packet: FcrPacket;
  selected: FcrLogRow | null;
  crafts: string[];
  phases: ReturnType<typeof scrPhaseOptions>;
  site?: string;
  client?: string;
  packId: string;
  canEdit: boolean;
  viewAs?: string | null;
  exportBusy: boolean;
  onPersist: (next: FcrPacket) => void;
  onSubmit: () => void;
  onNew: () => void;
  onDownload: () => void;
}) {
  const scope = selected ? logRowScope(selected) : null;
  const posted = selected ? logRowIsSubmitted(selected) : false;
  const scopeIdLabel = seedScopeIdLabel(client, site, packet.scopeIdLabel);
  const schedule = selected ? scrActiveSchedule(selected, phases) : null;

  function applyCraft(line: ScrCraftLine, patch: Partial<ScrCraftLine>) {
    if (!selected) return;
    const next = { ...line, ...patch };
    if (patch.craft != null) {
      next.rate = next.craft && schedule ? scrCompositeHourlyRate(next.craft, site, client, schedule) : 0;
    }
    onPersist(
      patchLogRow(packet, selected.id, {
        craftLines: selected.craftLines.map((item) => (item.id === line.id ? next : item)),
      }),
    );
  }

  function applySchedule(patch: Partial<FcrLogRow>) {
    if (!selected) return;
    const nextRow = { ...selected, ...patch };
    const nextSchedule = scrActiveSchedule(nextRow, phases);
    onPersist(
      patchLogRow(packet, selected.id, {
        ...patch,
        craftLines: recomputeScrCraftRates(selected.craftLines, site || "", client || "", nextSchedule),
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
            Same workbook on every job. Hit Squad SCR # is locked after create. One hours box ×
            locked composite $/hr from the required phase, or an optional schedule-impact shift.
            Labor $ follows Addition vs Credit / deletion. Claimables and backups stay on the
            packet. Submit posts this packet onto the SCR Log without minting a new number.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNew} className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel">
            New estimate
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={exportBusy}
            className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel disabled:opacity-60"
          >
            {exportBusy ? "Building file…" : "Download package (ZIP)"}
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
              Hit Squad SCR #
              <input className="paper-field mt-1" value={selected.scr} readOnly aria-label="Hit Squad SCR #" />
            </label>
            <label className="block text-sm">
              Client SCR ID
              <input
                className="paper-field mt-1"
                placeholder={clientScrIdPlaceholder(client, site)}
                value={selected.clientScrId}
                onChange={(event) => onPersist(patchLogRow(packet, selected.id, { clientScrId: event.target.value }))}
              />
              <span className="mt-1 block text-xs text-[#5b6f73]">{clientScrIdHelp(client, site)}</span>
            </label>
            <fieldset className="block text-sm">
              <legend>Status</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="SCR status">
                {SCR_STATUSES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={!posted}
                    onClick={() => onPersist(patchLogRow(packet, selected.id, { status: item }))}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      selected.status === item ? "bg-steel text-white" : "border border-steel text-steel"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {posted ? null : <span className="mt-1 block text-xs text-[#5b6f73]">Editable after Submit.</span>}
            </fieldset>
            <fieldset className="block text-sm sm:col-span-2">
              <legend>Type</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="SCR type">
                {SCR_TYPES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onPersist(patchLogRow(packet, selected.id, { scrType: item }))}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      selected.scrType === item ? "bg-steel text-white" : "border border-steel text-steel"
                    }`}
                  >
                    {SCR_TYPE_LABELS[item]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="flex items-center justify-between gap-2">
                <input
                  className="paper-field w-28 text-xs tracking-[0.08em]"
                  aria-label="Scope ID label"
                  value={scopeIdLabel}
                  onChange={(event) =>
                    onPersist({
                      ...packet,
                      scopeIdLabel: event.target.value || DEFAULT_SCOPE_ID_LABEL,
                    })
                  }
                />
              </span>
              <input
                className="paper-field mt-1"
                aria-label={scopeIdLabel}
                value={selected.scopeId}
                onChange={(event) => onPersist(patchLogRow(packet, selected.id, { scopeId: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Phase
              <select
                className="paper-field mt-1"
                required
                aria-label="Phase"
                value={selected.phaseId}
                onChange={(event) => applySchedule({ phaseId: event.target.value })}
              >
                <option value="">Select phase</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="block text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.scheduleImpact}
                  onChange={(event) =>
                    applySchedule({
                      scheduleImpact: event.target.checked,
                      shiftId: event.target.checked ? selected.shiftId || "6x10" : selected.shiftId,
                    })
                  }
                />
                Schedule impact
              </label>
              {selected.scheduleImpact ? (
                <select
                  className="paper-field mt-1"
                  aria-label="Schedule impact shift"
                  value={selected.shiftId}
                  onChange={(event) => applySchedule({ shiftId: event.target.value })}
                >
                  {SCR_SHIFT_PRESETS.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs text-[#5b6f73]">
                  Composite $/hr follows the phase default
                  {schedule ? ` (${schedule.label})` : ""}.
                </p>
              )}
            </div>
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
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              SCR issue
              <textarea
                rows={3}
                className="paper-field mt-1"
                value={selected.scope}
                onChange={(event) => onPersist(patchLogRow(packet, selected.id, { scope: event.target.value }))}
              />
            </label>
            <fieldset className="block text-sm sm:col-span-2 lg:col-span-3">
              <legend>Why this is an SCR</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {SCR_WHY_REASONS.map((reason) => {
                  const on = selected.whyReasons.includes(reason);
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() =>
                        onPersist(patchLogRow(packet, selected.id, { whyReasons: toggleScrWhy(selected.whyReasons, reason) }))
                      }
                      className={`rounded-full px-3 py-1 text-sm ${
                        on ? "bg-steel text-white" : "border border-steel text-steel"
                      }`}
                    >
                      {reason}
                    </button>
                  );
                })}
              </div>
              {selected.whyReasons.includes("Other") ? (
                <input
                  className="paper-field mt-2"
                  aria-label="Other reason note"
                  placeholder="Other note"
                  value={selected.whyOther}
                  onChange={(event) => onPersist(patchLogRow(packet, selected.id, { whyOther: event.target.value }))}
                />
              ) : null}
            </fieldset>
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
          <p className="mt-1 text-xs text-[#5b6f73]">{SCR_COMPOSITE_RATE_NOTE}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {["CRAFT", "HOURS", SCR_COMPOSITE_RATE_HEADER, "LABOR $", ""].map((header) => (
                    <th key={header || "actions"} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selected?.craftLines.length ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-[#5b6f73]">
                      No craft lines yet. One hours box — no ST / OT / DT columns.
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
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="paper-field w-24"
                          aria-label="Hours"
                          value={numField(line.hours)}
                          onChange={(event) => applyCraft(line, { hours: Number(event.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="paper-field w-24"
                          aria-label={SCR_COMPOSITE_RATE_LABEL}
                          title={SCR_COMPOSITE_RATE_NOTE}
                          readOnly
                          value={numField(line.rate)}
                        />
                      </td>
                      <td className="px-2 py-2 font-semibold">
                        {money(craftLineLabor(line, selected.scrType === "Credit" ? -1 : 1))}
                      </td>
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

          <ScrBackupAttachments
            packet={packet}
            selected={selected}
            packId={packId}
            canEdit={canEdit}
            viewAs={viewAs}
            onPersist={onPersist}
          />

          <p className="mt-4 text-sm text-[#163038]">
            Craft {selected?.craftLines.reduce((sum, line) => sum + craftLineHours(line), 0) ?? 0}h ·
            Labor {money(scope?.labor ?? 0)} · Claims {money(scope?.claims ?? 0)} · SCR total{" "}
            {money(scope?.cost ?? 0)}
            {selected.scrType === "Credit" ? " — credit signed" : ""}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#5b6f73]">Open a submitted SCR or start a new estimate to add lines.</p>
      )}
    </section>
  );
}

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

function ScrBackupAttachments({
  packet,
  selected,
  packId,
  canEdit,
  viewAs,
  onPersist,
}: {
  packet: FcrPacket;
  selected: FcrLogRow;
  packId: string;
  canEdit: boolean;
  viewAs?: string | null;
  onPersist: (next: FcrPacket) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function attachFiles(list: FileList | File[] | null) {
    if (!canEdit) {
      setNote(SCR_ATTACHMENT_VIEW_ERROR);
      return;
    }
    if (!packId) {
      setNote("Open this estimate from the job card before attaching backups.");
      return;
    }
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const check = checkQualityDrop(picked.map(dropFileFromBrowser));
    if (!check.accepted.length) {
      setNote(
        check.rejected.length
          ? check.rejected.map((row) => `${row.name}: ${row.error}`).join(" · ")
          : "error" in check && check.error
            ? check.error
            : "Attach at least one file.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const acceptedNames = new Set(check.accepted.map((file) => file.name));
      const leads = await Promise.all(picked.filter((file) => acceptedNames.has(file.name)).map(fileToLead));
      const response = await fetch(
        `/api/desk/estimates/${encodeURIComponent(packId)}/scr-attachments`,
        viewAsInit(viewAs, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowId: selected.id, files: leads }),
        }),
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        attachments?: Array<Partial<ScrAttachment>>;
      };
      if (!response.ok || !Array.isArray(data.attachments) || !data.attachments.length) {
        throw new Error(typeof data.error === "string" && data.error ? data.error : SCR_ATTACHMENT_WRITE_ERROR);
      }
      onPersist(addScrAttachments(packet, selected.id, data.attachments));
      if (check.rejected.length) {
        setNote(check.rejected.map((row) => `${row.name}: ${row.error}`).join(" · "));
      }
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : SCR_ATTACHMENT_WRITE_ERROR);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeFile(file: ScrAttachment) {
    if (!canEdit) {
      setNote(SCR_ATTACHMENT_VIEW_ERROR);
      return;
    }
    setBusy(true);
    setNote("");
    try {
      if (file.driveId && packId) {
        const response = await fetch(
          `/api/desk/estimates/${encodeURIComponent(packId)}/scr-attachments`,
          viewAsInit(viewAs, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowId: selected.id, driveId: file.driveId, fileName: file.name }),
          }),
        );
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(typeof data.error === "string" && data.error ? data.error : SCR_ATTACHMENT_WRITE_ERROR);
        }
      }
      onPersist(removeScrAttachment(packet, selected.id, file.id));
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : SCR_ATTACHMENT_WRITE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function downloadHref(file: ScrAttachment) {
    if (!packId || !file.driveId) return "";
    const query = new URLSearchParams({ rowId: selected.id, fileId: file.driveId });
    return `/api/desk/estimates/${encodeURIComponent(packId)}/scr-attachments?${query}`;
  }

  async function downloadFile(file: ScrAttachment) {
    const href = downloadHref(file);
    if (!href) return;
    try {
      const response = await fetch(href, viewAsInit(viewAs));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setNote(typeof data.error === "string" && data.error ? data.error : "Could not download that backup.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote("Could not download that backup.");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#163038]">Backup attachments</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            PDFs, photos, and other docs that back this claim — IPS pack, drawings, quotes. Files
            save with the estimate pack, not only on this browser.
          </p>
        </div>
        {canEdit ? (
          <label className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white">
            {busy ? "Saving…" : "Attach"}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={QUALITY_DROP_ACCEPT}
              className="sr-only"
              disabled={busy}
              onChange={(event) => void attachFiles(event.target.files)}
            />
          </label>
        ) : null}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
            <tr>
              {["NAME", "TYPE / SIZE", "ADDED BY", "WHEN", ""].map((header) => (
                <th key={header} className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!selected.attachments.length ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-[#5b6f73]">
                  No backup files on this SCR yet.
                </td>
              </tr>
            ) : (
              selected.attachments.map((file) => {
                const openUrl = scrAttachmentOpenUrl(file.driveId);
                const downloadUrl = downloadHref(file);
                return (
                  <tr key={file.id} className="border-t border-[#d5e0de] align-top">
                    <td className="px-2 py-2">{file.name}</td>
                    <td className="px-2 py-2">
                      {attachmentKind(file)} · {formatBytes(file.size)}
                    </td>
                    <td className="px-2 py-2">{file.addedBy || "—"}</td>
                    <td className="px-2 py-2">{formatAddedAt(file.addedAt)}</td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-3">
                        {openUrl ? (
                          <a href={openUrl} target="_blank" rel="noreferrer" className="text-sm text-steel">
                            Open
                          </a>
                        ) : null}
                        {downloadUrl ? (
                          <button
                            type="button"
                            className="text-sm text-steel"
                            onClick={() => void downloadFile(file)}
                          >
                            Download
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            className="text-sm text-steel"
                            disabled={busy}
                            onClick={() => void removeFile(file)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {note ? (
        <p className="mt-2 text-sm text-amber-flare" role="alert">
          {note}
        </p>
      ) : null}
    </div>
  );
}
