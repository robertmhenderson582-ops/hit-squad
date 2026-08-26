"use client";

import { useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { DateField } from "@/components/DateField";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { displayEstimateType, ESTIMATE_TYPES, type EstimateType } from "@/lib/estimate-type";
import { jobEventLabel } from "@/lib/job-event";

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
          How this sheet is priced: T&amp;M, lump sum, CR/FF, or Hybrid. {jobEventLabel(client, site)} is the job
          itself. This list is never Outage.
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
        <p className="mt-1 text-xs text-[#5b6f73]">
          Which unit you are bidding — CAT, Coker, FCC. Leave the refinery name on the Client line.
        </p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">OVERTIME / RATE</span>
        <input readOnly value={otRule} className="paper-field mt-2" />
      </label>
      {children}
      {code || window ? (
        <p className="mt-4 text-sm text-[#5b6f73]">
          {code ? `${code}. ` : ""}
          {window
            ? `The job card still shows ${window}. Crew follows Project start and the phase START/STOP table above — those can differ from the job card.`
            : ""}
        </p>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STAFF PER DIEM $ / DAY</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.staffPerDiemRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, staffPerDiemRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Staff + GF. Shahan TM OCIP default is $140.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CRAFT PER DIEM $ / DAY</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.craftPerDiemRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, craftPerDiemRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Foreman + Direct + Support. Shahan TM OCIP default is $130.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STAFF MILEAGE $ / MILE</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="paper-field mt-2"
            value={pack.jobMeta.staffMileageRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, staffMileageRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Seeds Other Cost Travel Staff. No Shahan default — type it here.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CRAFT MILEAGE $ / MILE</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="paper-field mt-2"
            value={pack.jobMeta.craftMileageRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, craftMileageRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Seeds Other Cost Travel Craft. You can still override on that line.</p>
        </label>
      </div>
    </section>
  );
}
