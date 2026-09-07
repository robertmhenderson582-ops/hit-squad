"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readFcrPacket } from "@/lib/change-order-packet";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import {
  FERNDALE_ADDRESS,
  FERNDALE_COAST,
  FERNDALE_PCA,
  FERNDALE_PILE_FOLDER_IDS,
  FERNDALE_RFQ_LETTER_ID,
  FERNDALE_RFX_SOURCES,
  FERNDALE_WORK_FOLDER_ID,
  FERNDALE_WORK_PILES,
  ferndaleWorkbookTodos,
} from "@/lib/ferndale-work";
import {
  FERNDALE_FILL_ERROR,
  FERNDALE_TAB_LABEL,
  ferndaleFillMap,
  ferndaleFormFilename,
  ferndaleFormToXlsx,
  ferndaleLetterSubject,
  hydrateFerndaleForm,
  resolveFerndaleRfx,
} from "@/lib/ferndale-form";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";
import { driveFolderUrl, driveViewUrl } from "@/lib/work-folder";
import { downloadXlsx } from "@/lib/xlsx-minimal";

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FerndaleFormDesk({
  client = "",
  site = "",
  name = "",
}: {
  client?: string;
  site?: string;
  name?: string;
}) {
  const pack = useEstimatePackage();
  const form = hydrateFerndaleForm(pack.jobMeta.ferndaleForm);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => onEstimateSheets(() => setTick((n) => n + 1)), []);

  const crewRows = useMemo(
    () => [
      ...pack.crew.staff,
      ...pack.crew.generalForeman,
      ...pack.crew.foreman,
      ...pack.crew.direct,
      ...pack.crew.support,
    ],
    [pack.crew],
  );
  const hours = useMemo(
    () =>
      sumSplits(
        crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8, "", pack.jobMeta.holidays ?? [])),
      ),
    [client, crewRows, pack.crew.otAfter8, pack.jobMeta.holidays, site],
  );

  const packInput = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const otherCost = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    return {
      crew: pack.crew,
      site,
      client,
      equipment,
      otherCost,
      subcontractor: readSubSheet(pack.estimateKey),
      jobMeta: pack.jobMeta,
      changeOrders: fcrChangeOrderTotal(readFcrPacket(pack.estimateKey)),
      hours: hours.hours,
    };
  }, [client, hours.hours, pack.crew, pack.estimateKey, pack.jobMeta, site, tick]);

  const preview = useMemo(
    () => ferndaleFillMap({ form, pack: packInput, title: name }),
    [form, name, packInput],
  );
  const rfx = resolveFerndaleRfx(form.rfx, `${form.scope} ${name}`);

  function patchForm(patch: Partial<typeof form>) {
    pack.setJobMeta((current) => ({
      ...current,
      ferndaleForm: hydrateFerndaleForm({ ...form, ...patch }),
    }));
  }

  async function fillForm() {
    setError("");
    try {
      const bytes = await ferndaleFormToXlsx({
        form,
        pack: packInput,
        title: name,
      });
      if (!bytes.byteLength) throw new Error("empty-ferndale-form");
      downloadXlsx(ferndaleFormFilename(name), bytes);
    } catch {
      setError(FERNDALE_FILL_ERROR);
    }
  }

  return (
    <section className="plant-card mx-auto max-w-3xl px-6 py-6">
      <h1 className="text-3xl font-semibold text-[#163038]">{FERNDALE_TAB_LABEL}</h1>
      <p className="mt-2 text-sm text-[#5b6f73]">
        GEP / TASO client template. RFQ letter and pack hinge — not a Rodeo clone. Crew, Job setup, Equipment, and
        Other Cost stay the desk cards. Live pack dollars only. Unread EST workbook cells stay TODO on Drive ids.
      </p>
      <p className="mt-2 text-xs text-[#5b6f73]">
        {FERNDALE_COAST} · {FERNDALE_ADDRESS} · {FERNDALE_PCA}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">SCOPE</span>
          <input
            className="paper-field mt-2"
            value={form.scope}
            placeholder="Unit / package — not an invented RFX"
            onChange={(event) => patchForm({ scope: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">RFX</span>
          <input
            className="paper-field mt-2"
            value={form.rfx}
            placeholder="Map from Work Folder when known"
            onChange={(event) => patchForm({ rfx: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">WORK PILE</span>
          <select
            className="paper-field mt-2"
            value={form.pile}
            onChange={(event) => patchForm({ pile: event.target.value as typeof form.pile })}
          >
            <option value="">Pick a pile</option>
            {FERNDALE_WORK_PILES.map((pile) => (
              <option key={pile} value={pile}>
                {pile}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ADDRESSEE</span>
          <input
            className="paper-field mt-2"
            value={form.addressee}
            onChange={(event) => patchForm({ addressee: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">TITLE</span>
          <input
            className="paper-field mt-2"
            value={form.addresseeTitle}
            onChange={(event) => patchForm({ addresseeTitle: event.target.value })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CONTRACTOR</span>
          <input
            className="paper-field mt-2"
            value={form.contractor}
            onChange={(event) => patchForm({ contractor: event.target.value })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">NOTES</span>
          <textarea
            className="paper-field mt-2 min-h-20"
            value={form.notes}
            onChange={(event) => patchForm({ notes: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-6 rounded-lg border border-[#d5e0de] px-4 py-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">RFQ LETTER</p>
        <p className="mt-2 text-sm text-[#163038]">{ferndaleLetterSubject(form.scope || name, rfx)}</p>
        <p className="mt-1 text-sm text-[#5b6f73]">
          {rfx.rfx
            ? `${rfx.rfx}${rfx.label ? ` · ${rfx.label}` : ""} · ${rfx.source === "work-folder" ? "mapped from Work Folder title" : "entered on this pack"}`
            : rfx.todo}
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-[#d5e0de] px-4 py-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">LIVE PACK</p>
        <p className="mt-2 text-sm text-[#5b6f73]">{preview.live.note}</p>
        <ul className="mt-2 space-y-1 text-sm text-[#163038]">
          <li>{preview.live.hours.toLocaleString()} hrs</li>
          {preview.live.lines.map((line) => (
            <li key={line.id}>
              {line.label} · {money(line.amount)}
            </li>
          ))}
          <li className="font-semibold">Live pack total · {money(preview.live.total)}</li>
        </ul>
      </div>
      <div className="mt-4 rounded-lg border border-[#d5e0de] px-4 py-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">WORK FOLDER SOURCES</p>
        <ul className="mt-2 space-y-1 text-sm text-[#5b6f73]">
          {FERNDALE_RFX_SOURCES.map((row) => (
            <li key={row.rfx}>
              <a className="text-steel underline" href={driveFolderUrl(row.folderId)} target="_blank" rel="noreferrer">
                {row.rfx} · {row.label}
              </a>
              {row.todo ? <span className="block text-xs">{row.todo}</span> : null}
            </li>
          ))}
          <li>
            <a className="text-steel underline" href={driveFolderUrl(FERNDALE_WORK_FOLDER_ID)} target="_blank" rel="noreferrer">
              Ferndale Work Folder
            </a>
            {form.pile ? (
              <>
                {" · "}
                <a
                  className="text-steel underline"
                  href={driveFolderUrl(FERNDALE_PILE_FOLDER_IDS[form.pile])}
                  target="_blank"
                  rel="noreferrer"
                >
                  {form.pile}
                </a>
              </>
            ) : null}
          </li>
          <li>
            <a className="text-steel underline" href={driveViewUrl(FERNDALE_RFQ_LETTER_ID)} target="_blank" rel="noreferrer">
              RFQ letter shape
            </a>
          </li>
        </ul>
        <ul className="mt-3 space-y-1 text-xs text-[#5b6f73]">
          {ferndaleWorkbookTodos().map((todo) => (
            <li key={todo}>{todo}</li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={fillForm} className="rounded-lg bg-steel px-4 py-2 text-white">
          Fill RFQ pack
        </button>
        {error ? (
          <p className="text-sm text-[#8a4b2f]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
