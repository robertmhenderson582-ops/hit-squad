"use client";

import { CreatedBy } from "@/components/CreatedBy";

export function JobSetupCard({
  type,
  client,
  name,
  otRule,
  author,
  code,
  window,
  children,
}: {
  type: string;
  client: string;
  name: string;
  otRule: string;
  author?: string;
  code?: string;
  window?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="plant-card mx-auto max-w-3xl px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-[#163038]">Job setup</h1>
        {author ? <CreatedBy author={author} /> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="pill bg-steel text-white">Existing customer</span>
        <span className="pill border border-[#c5d4d4] bg-white">New / potential client</span>
      </div>
      <label className="mt-6 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE TYPE</span>
        <input readOnly value={type} className="paper-field mt-2" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CLIENT</span>
        <input readOnly value={client} className="paper-field mt-2" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE NAME</span>
        <input readOnly value={name} className="paper-field mt-2" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AFE / TA NAME</span>
        <input className="paper-field mt-2" placeholder="AFE or TA name" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AREA / UNIT</span>
        <input className="paper-field mt-2" placeholder="CAT, Coker, FCC…" />
        <p className="mt-1 text-xs text-[#5b6f73]">A unit, not the refinery title.</p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">OVERTIME / RATE</span>
        <input readOnly value={otRule} className="paper-field mt-2" />
      </label>
      {children}
      {code || window ? (
        <p className="mt-4 text-sm text-[#5b6f73]">
          {[code, window].filter(Boolean).join(" · ")} · Dollars stay on the rail.
        </p>
      ) : null}
      <div className="mt-6">
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
              <td className="py-2">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
