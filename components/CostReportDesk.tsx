"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useSession } from "@/components/SessionProvider";
import { readFcrPacket } from "@/lib/change-order-packet";
import {
  COST_REPORT_LIVE_NOTE,
  COST_REPORT_NOUN,
  COST_REPORT_PARKED,
  applyTurnipPaste,
  buildCostCurve,
  costActualsFromPastes,
  deskBudgetFromPack,
  emptyCostReportBook,
  parseLooseDate,
  todayYmd,
  estimateCurveFromCrew,
  openCostSnapshot,
  readCostReport,
  saveCostSnapshot,
  snapshotList,
  spentPct,
  variance,
  writeCostReport,
  type CostReportBook,
  type TurnipExportKind,
} from "@/lib/cost-report";
import { costReportToXlsx, costReportXlsxFilename } from "@/lib/cost-report-xlsx";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import { packIdFromEstimateKey } from "@/lib/estimate-pack";
import { exporterDisplayName } from "@/lib/estimate-xlsx";
import { findLocalPack } from "@/lib/local-estimates";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";
import { downloadXlsx } from "@/lib/xlsx-minimal";

function money(value: number) {
  return value
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function hours(value: number) {
  return value ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
}

function pct(value: number) {
  return value ? `${(value * 100).toFixed(1)}%` : "—";
}

function CostCurveChart({
  points,
}: {
  points: Array<{ date: string; cumEstHours: number; cumActHours: number }>;
}) {
  if (!points.length) {
    return <p className="text-sm text-[#5b6f73]">Paste Turnip 15 or set crew dates to draw the S-curve.</p>;
  }
  const width = 720;
  const height = 220;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const max = Math.max(...points.map((p) => Math.max(p.cumEstHours, p.cumActHours)), 1);
  const x = (i: number) => pad.l + (i / Math.max(points.length - 1, 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = (key: "cumEstHours" | "cumActHours") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Estimate vs actuals hours">
      <rect x="0" y="0" width={width} height={height} fill="#f7faf9" />
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="#d5e0de" />
          <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fill="#5b6f73" fontSize="10">
            {tick}
          </text>
        </g>
      ))}
      <path d={line("cumEstHours")} fill="none" stroke="#0f5f6d" strokeWidth="2.5" />
      <path d={line("cumActHours")} fill="none" stroke="#e38b2a" strokeWidth="2.5" />
      <text x={pad.l} y={height - 8} fill="#0f5f6d" fontSize="11">
        Est hours
      </text>
      <text x={pad.l + 80} y={height - 8} fill="#e38b2a" fontSize="11">
        Act hours
      </text>
      <text x={width - pad.r} y={height - 8} textAnchor="end" fill="#5b6f73" fontSize="10">
        {points[0]?.date} → {points[points.length - 1]?.date}
      </text>
    </svg>
  );
}

async function textFromUpload(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return "";
    const lines: string[] = [];
    ws.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map((cell) => (cell == null ? "" : String(cell))).join("\t"));
    });
    return lines.join("\n");
  }
  return file.text();
}

export function CostReportDesk({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const { user } = useSession();
  const [book, setBook] = useState<CostReportBook>(emptyCostReportBook);
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const file15 = useRef<HTMLInputElement>(null);
  const file16 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function load() {
      if (!pack.estimateKey) {
        setBook(emptyCostReportBook());
        return;
      }
      setBook(readCostReport(pack.estimateKey));
    }
    load();
    return onEstimateSheets(load);
  }, [pack.estimateKey, pack.ready]);

  const budget = useMemo(
    () =>
      deskBudgetFromPack({
        crew: pack.crew,
        site,
        client,
        equipment: readEquipmentSheet(pack.estimateKey),
        otherCost: syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
          staffPerMile: pack.jobMeta.staffMileageRate,
          craftPerMile: pack.jobMeta.craftMileageRate,
        }),
        subcontractor: readSubSheet(pack.estimateKey),
        jobMeta: pack.jobMeta,
        changeOrders: fcrChangeOrderTotal(readFcrPacket(pack.estimateKey)),
      }),
    [client, pack.crew, pack.estimateKey, pack.jobMeta, pack.ready, site],
  );

  const actuals = useMemo(
    () => costActualsFromPastes(book.export15, book.export16, book.statusDate),
    [book.export15, book.export16, book.statusDate],
  );
  const estimate = useMemo(
    () => estimateCurveFromCrew(pack.crew, site, client, pack.jobMeta.holidays ?? []),
    [client, pack.crew, pack.jobMeta.holidays, site],
  );
  const curve = useMemo(
    () => buildCostCurve(estimate, actuals, book.statusDate),
    [actuals, book.statusDate, estimate],
  );
  const history = snapshotList(book);
  const local = findLocalPack(packIdFromEstimateKey(pack.estimateKey) || "");
  const jobTitle = local?.title || "Working estimate";

  function persist(next: CostReportBook) {
    setBook(next);
    writeCostReport(pack.estimateKey, next);
  }

  async function ingest(kind: TurnipExportKind, file: File | null) {
    if (!file) return;
    persist(applyTurnipPaste(book, kind, await textFromUpload(file)));
  }

  async function exportWorkbook() {
    if (exportBusy) return;
    setExportError("");
    setExportBusy(true);
    try {
      const bytes = await costReportToXlsx({
        title: jobTitle,
        client,
        site,
        statusDate: book.statusDate,
        budget,
        book,
        curve,
        preparedBy: exporterDisplayName(user?.name, user?.email) ?? undefined,
      });
      downloadXlsx(
        costReportXlsxFilename({
          site,
          title: jobTitle,
          statusDate: book.statusDate,
        }),
        bytes,
      );
    } catch {
      setExportError("Could not export. Try again.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        {COST_REPORT_NOUN} for this live estimate. {COST_REPORT_LIVE_NOTE} Paste Turnip T3 Export 15
        (hours) and 16 (dollars) the same way Mike does — no typed time card this pass. East Coast
        still does not turn 12s into DT.
      </p>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block text-sm">
            Status date
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder="YYYY-MM-DD or 9/5/2026"
              value={book.statusDate}
              onChange={(event) => persist({ ...book, statusDate: event.target.value })}
              onBlur={() =>
                persist({
                  ...book,
                  statusDate: parseLooseDate(book.statusDate) || todayYmd(),
                })
              }
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => persist(saveCostSnapshot(book, budget))}
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            >
              Save daily report
            </button>
            <button
              type="button"
              onClick={() => void exportWorkbook()}
              disabled={exportBusy}
              className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
            >
              {exportBusy ? "Exporting…" : "Excel export"}
            </button>
          </div>
        </div>
        {exportError ? <p className="mt-2 text-sm text-amber-flare">{exportError}</p> : null}
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
        <h2 className="text-2xl font-semibold text-[#163038]">Estimate vs actuals</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Live pack budget. Turnip actuals through the status date.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Budget $" value={money(budget.total)} />
          <Stat label="Actual $" value={money(actuals.dollars)} note={`Var ${money(variance(budget.total, actuals.dollars))}`} />
          <Stat label="Budget hours" value={hours(budget.hours)} />
          <Stat
            label="Actual hours"
            value={hours(actuals.hours)}
            note={`${pct(spentPct(budget.hours, actuals.hours))} spent`}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
              <tr>
                {["Line", "Budget", "Actual", "Variance"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((line) => (
                <tr key={line.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">{line.label}</td>
                  <td className="px-2 py-2 font-mono">{money(line.amount)}</td>
                  <td className="px-2 py-2 font-mono">{line.id === "labor" ? "—" : "—"}</td>
                  <td className="px-2 py-2 font-mono">{money(line.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-[#d5e0de] font-semibold">
                <td className="px-2 py-2">TOTAL</td>
                <td className="px-2 py-2 font-mono">{money(budget.total)}</td>
                <td className="px-2 py-2 font-mono">{money(actuals.dollars)}</td>
                <td className="px-2 py-2 font-mono">{money(variance(budget.total, actuals.dollars))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Hours S-curve</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Cumulative estimate hours vs Turnip 15 actuals.</p>
        <div className="mt-4">
          <CostCurveChart points={curve} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <TurnipPasteCard
          title="Turnip T3 Export 15"
          note="Hours. Paste or upload the same export Mike uses."
          raw={book.export15.raw}
          rows={book.export15.rows.length}
          fileRef={file15}
          onRaw={(raw) => persist(applyTurnipPaste(book, "15", raw))}
          onFile={(file) => void ingest("15", file)}
        />
        <TurnipPasteCard
          title="Turnip T3 Export 16"
          note="Dollars. Paste or upload — stored on this estimate, not in git."
          raw={book.export16.raw}
          rows={book.export16.rows.length}
          fileRef={file16}
          onRaw={(raw) => persist(applyTurnipPaste(book, "16", raw))}
          onFile={(file) => void ingest("16", file)}
        />
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Dated report log</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Each save is a snapshot. Open a prior day to see that paste again.</p>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-[#5b6f73]">No saved days yet. Set the status date and save.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {["Status date", "Budget $", "Actual $", "Hours", "Notes", ""].map((header) => (
                    <th key={header || "open"} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((shot) => (
                  <tr key={shot.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2 font-mono">{shot.statusDate}</td>
                    <td className="px-2 py-2 font-mono">{money(shot.budget.total)}</td>
                    <td className="px-2 py-2 font-mono">{money(shot.actuals.dollars)}</td>
                    <td className="px-2 py-2 font-mono">{hours(shot.actuals.hours)}</td>
                    <td className="px-2 py-2">{shot.notes || "—"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => persist(openCostSnapshot(book, shot.id))}
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

      <p className="text-sm text-[#5b6f73]">
        Parked this pass: {COST_REPORT_PARKED.join(" · ")}.
      </p>
    </div>
  );
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

function TurnipPasteCard({
  title,
  note,
  raw,
  rows,
  fileRef,
  onRaw,
  onFile,
}: {
  title: string;
  note: string;
  raw: string;
  rows: number;
  fileRef: RefObject<HTMLInputElement | null>;
  onRaw: (raw: string) => void;
  onFile: (file: File | null) => void;
}) {
  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#163038]">{title}</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">{note}</p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
        >
          Upload
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <textarea
        rows={8}
        className="paper-field mt-3 font-mono text-xs"
        placeholder="Paste Export here (tab or CSV). Date + hours or dollars."
        value={raw}
        onChange={(event) => onRaw(event.target.value)}
      />
      <p className="mt-2 text-xs text-[#5b6f73]">{rows ? `${rows} row${rows === 1 ? "" : "s"} parsed` : "Nothing parsed yet."}</p>
    </section>
  );
}
