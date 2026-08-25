"use client";

import { useState } from "react";
import { EmptyLane } from "@/components/EmptyLane";
import { LeadStudio } from "@/components/LeadStudio";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";

const CLIENTS = ["Phillips 66", "Georgia Power", "Other"] as const;

const LANES = [
  { title: "Open NCRs", headers: ["NCR", "AREA", "NOTE", "STATUS"] },
  { title: "Weld reject", headers: ["WELD", "JOINT", "NOTE", "STATUS"] },
  { title: "Connection reject", headers: ["CONN", "AREA", "NOTE", "STATUS"] },
  { title: "Travelers", headers: ["TRAVELER", "SCOPE", "NOTE", "STATUS"] },
  { title: "Expired welders", headers: ["WELDER", "STAMP", "EXPIRES", "STATUS"] },
  { title: "Overdue gauges", headers: ["GAUGE", "AREA", "DUE", "STATUS"] },
] as const;

export function QualityDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Phillips 66");
  const chance = owner?.viewAs === "chance";
  const joseph = owner?.viewAs === "joseph";

  return (
    <div className="mt-4 space-y-5">
      <LeadStudio title="Quality lead studio" kind="quality" />
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Empty Quality desk. Client folders only — no fake NCR counts and no QC Manual digest.
      </p>
      {chance ? (
        <p className="plant-card px-4 py-3 text-sm">
          Chance — this is your Quality home. Empty on purpose. You are the lead.
        </p>
      ) : null}
      {joseph ? (
        <p className="plant-card px-4 py-3 text-sm">Joseph chrome — look only. Empty board.</p>
      ) : null}
      <label className="block max-w-sm text-sm">
        Client folder
        <select
          value={client}
          onChange={(event) => setClient(event.target.value as (typeof CLIENTS)[number])}
          className="paper-field mt-1"
        >
          {CLIENTS.map((item) => (
            <option key={item} value={item}>
              {alias(item)}
            </option>
          ))}
        </select>
      </label>
      <p className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">
        {alias(client).toUpperCase()} · EMPTY BOARD
      </p>
      <div className="grid gap-4">
        {LANES.map((lane) => (
          <EmptyLane key={lane.title} title={lane.title} headers={[...lane.headers]} />
        ))}
      </div>
    </div>
  );
}
