"use client";

import { useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  RODEO_FILL_ERROR,
  RODEO_TAB_LABEL,
  hydrateRodeoForm,
  rodeoFormFilename,
  rodeoFormToXlsx,
  rodeoLaborLines,
  rodeoBucketTotals,
  sanitizeRodeoUnit,
} from "@/lib/rodeo-form";
import { downloadXlsx } from "@/lib/xlsx-minimal";
import { wageLookupOpts } from "@/lib/wage-lookup";

export function RodeoFormDesk({
  client = "",
  site = "",
  name = "",
}: {
  client?: string;
  site?: string;
  name?: string;
}) {
  const pack = useEstimatePackage();
  const form = hydrateRodeoForm(pack.jobMeta.rodeoForm);
  const [error, setError] = useState("");
  const lines = rodeoLaborLines(pack.crew, site, client, wageLookupOpts(site));
  const totals = rodeoBucketTotals(lines);

  function patchForm(patch: Partial<typeof form>) {
    pack.setJobMeta((current) => ({
      ...current,
      rodeoForm: hydrateRodeoForm({ ...form, ...patch }),
    }));
  }

  async function fillForm() {
    setError("");
    try {
      const bytes = await rodeoFormToXlsx({
        form,
        crew: pack.crew,
        site,
        client,
        title: name,
        opts: wageLookupOpts(site),
      });
      if (!bytes.byteLength) throw new Error("empty-rodeo-form");
      downloadXlsx(rodeoFormFilename(name), bytes);
    } catch {
      setError(RODEO_FILL_ERROR);
    }
  }

  return (
    <section className="plant-card mx-auto max-w-3xl px-6 py-6">
      <h1 className="text-3xl font-semibold text-[#163038]">{RODEO_TAB_LABEL}</h1>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Client-form hinge. Preview and fill map only — Crew, Job setup, Equipment, and Other Cost stay
        the desk cards. Hours × composite rate. Madison still hands P66 the locked workbook.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">TAR UNIT</span>
          <input
            className="paper-field mt-2"
            value={form.tarUnit}
            placeholder="Unit — not the plant name"
            onChange={(event) => patchForm({ tarUnit: sanitizeRodeoUnit(event.target.value) })}
            onBlur={(event) => patchForm({ tarUnit: sanitizeRodeoUnit(event.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CONTRACTOR</span>
          <input
            className="paper-field mt-2"
            value={form.contractor}
            onChange={(event) => patchForm({ contractor: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">BLOCK</span>
          <input
            className="paper-field mt-2"
            value={form.block}
            onChange={(event) => patchForm({ block: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#d5e0de] px-4 py-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">DIRECT (TIME ON TOOLS)</p>
          <p className="mt-1 text-sm text-[#163038]">
            {totals.directHours.toLocaleString()} hrs · ${totals.directRate.toFixed(2)} · $
            {totals.directDollars.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-[#d5e0de] px-4 py-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">INDIRECT (FOREMAN AND ABOVE)</p>
          <p className="mt-1 text-sm text-[#163038]">
            {totals.indirectHours.toLocaleString()} hrs · ${totals.indirectRate.toFixed(2)} · $
            {totals.indirectDollars.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
      {lines.length ? (
        <ul className="mt-4 space-y-1 text-sm text-[#5b6f73]">
          {lines.map((line) => (
            <li key={`${line.bucket}-${line.title}`}>
              {line.title} · {line.bucket === "direct" ? "Direct" : "Indirect"} · {line.hours.toLocaleString()}{" "}
              hrs · ${line.compositeRate.toFixed(2)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#5b6f73]">Add Crew positions to preview hours × composite rate.</p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={fillForm} className="rounded-lg bg-steel px-4 py-2 text-white">
          Fill map
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
