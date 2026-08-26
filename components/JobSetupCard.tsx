"use client";

import { useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { DateField } from "@/components/DateField";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { displayEstimateType, ESTIMATE_TYPES, type EstimateType } from "@/lib/estimate-type";
import { jobEventLabel } from "@/lib/job-event";
import { showCraftTravelRow } from "@/lib/other-cost";

export function JobSetupCard({
  type,
  client,
  site,
  name,
  otRule,
  author,
  code,
  window,
  existingClient = false,
  children,
}: {
  type: string;
  client: string;
  site?: string;
  name: string;
  otRule: string;
  author?: string;
  code?: string;
  window?: string;
  existingClient?: boolean;
  children?: React.ReactNode;
}) {
  const pack = useEstimatePackage();
  const [estimateType, setEstimateType] = useState<EstimateType>(displayEstimateType(type));
  const travelOn = showCraftTravelRow(pack.jobMeta.mileageRate);

  return (
    <section className="plant-card mx-auto max-w-3xl px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-[#163038]">Job setup</h1>
        {author ? <CreatedBy author={author} /> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {existingClient ? (
          <span className="pill bg-steel text-white">Existing customer</span>
        ) : (
          <>
            <span className="pill border border-[#c5d4d4] bg-white">Existing customer</span>
            <span className="pill bg-steel text-white">New / potential client</span>
          </>
        )}
      </div>
      <label className="mt-6 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE TYPE</span>
        <select
          value={estimateType}
          onChange={(event) => setEstimateType(event.target.value as EstimateType)}
          className="paper-field mt-2"
        >
          {ESTIMATE_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[#5b6f73]">
          Contract type for this sheet — T&amp;M, lump sum, CR/FF, or Hybrid. {jobEventLabel(client, site)} is the
          job kind, not this field.
        </p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CLIENT</span>
        <input readOnly value={client} className="paper-field mt-2" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE NAME</span>
        <input readOnly value={name} className="paper-field mt-2" />
      </label>
      <div className="mt-4">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">PROJECT START</span>
        <DateField
          value={pack.schedule.projectStart}
          onChange={(start) => pack.setProjectStartDate(start)}
          className="mt-2"
          aria-label="Project start"
        />
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AFE / TA NAME</span>
        <input
          className="paper-field mt-2"
          placeholder="AFE or TA name"
          value={pack.jobMeta.afeName}
          onChange={(event) => pack.setJobMeta((current) => ({ ...current, afeName: event.target.value }))}
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AREA / UNIT</span>
        <input
          className="paper-field mt-2"
          placeholder="CAT, Coker, FCC…"
          value={pack.jobMeta.area}
          onChange={(event) => pack.setJobMeta((current) => ({ ...current, area: event.target.value }))}
        />
        <p className="mt-1 text-xs text-[#5b6f73]">Process unit on the job — CAT, Coker, FCC — not the refinery name.</p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">OVERTIME / RATE</span>
        <input readOnly value={otRule} className="paper-field mt-2" />
      </label>
      {children}
      {code || window ? (
        <p className="mt-4 text-sm text-[#5b6f73]">
          {[code, window].filter(Boolean).join(" · ")} · Dollars stay on the rail.
          {window
            ? " Blotter window is the job-card dates, not the phase START/STOP above. They can differ."
            : ""}
        </p>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">PER DIEM $ / DAY</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.perDiemRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, perDiemRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Job rate already on this desk. Not a new COMP table.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">MILEAGE RATE</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.mileageRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, mileageRate: Number(event.target.value) || 0 }))
            }
          />
        </label>
      </div>
      {travelOn ? (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">TRAVEL</p>
          <table className="mt-2 min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                <th className="py-2">ITEM</th>
                <th className="py-2">Mileage Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#d5e0de]">
                <td className="py-2">Craft travel</td>
                <td className="py-2">{pack.jobMeta.mileageRate || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
