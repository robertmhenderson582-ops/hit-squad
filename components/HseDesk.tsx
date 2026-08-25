"use client";

import { useState } from "react";
import { EmptyLane } from "@/components/EmptyLane";
import { LeadStudio } from "@/components/LeadStudio";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";

const CLIENTS = ["Phillips 66", "Georgia Power", "Other"] as const;

const LANES = [
  { title: "Incidents / near misses", headers: ["WHEN", "SITE", "NOTE", "STATUS"] },
  { title: "Observations", headers: ["WHEN", "SITE", "NOTE", "STATUS"] },
  { title: "Permits — Hot work", headers: ["PERMIT", "AREA", "WINDOW", "STATUS"] },
  { title: "Permits — Confined space", headers: ["PERMIT", "AREA", "WINDOW", "STATUS"] },
  { title: "Permits — LOTO", headers: ["PERMIT", "AREA", "WINDOW", "STATUS"] },
  { title: "Permits — Excavation", headers: ["PERMIT", "AREA", "WINDOW", "STATUS"] },
  { title: "JSA", headers: ["TASK", "CREW", "DATE", "STATUS"] },
  { title: "Toolbox talks", headers: ["TOPIC", "CREW", "DATE", "STATUS"] },
] as const;

export function HseDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Phillips 66");
  const assigned = owner?.viewAs === "wendell" || owner?.viewAs === "benny";

  return (
    <div className="mt-4 space-y-5">
      <LeadStudio title="HSE lead studio" kind="hse" />
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Empty HSE desk. Client folders only — no invented TRIR or recordable counts. Open the lead
        studio when you are ready.
      </p>
      {assigned ? (
        <p className="plant-card px-4 py-3 text-sm">
          This is your HSE desk. Empty on purpose — you are the lead.
        </p>
      ) : null}
      <label className="block max-w-sm text-sm">
        Client
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
