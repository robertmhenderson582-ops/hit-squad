"use client";

import { useState } from "react";
import { OpenJobFrame } from "@/components/AwardedJobFrame";
import { EmptyLane } from "@/components/EmptyLane";
import { LeadStudio } from "@/components/LeadStudio";
import { QualityDay1Card } from "@/components/QualityDay1Card";
import { RollingChartMap } from "@/components/RollingChartMap";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import { OPEN_JOB_EMPTY_COPY } from "@/lib/quality-hse-modules";
import {
  QUALITY_DAY1_LABEL,
  canSeeMadisonManuals,
  madisonManualLabel,
} from "@/lib/quality-day1";

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
  const { user } = useSession();
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Phillips 66");
  const chance = owner?.viewAs === "chance";
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));

  return (
    <div className="mt-4 space-y-5">
      <LeadStudio title="Quality lead studio" kind="quality" />
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Quality module. {QUALITY_DAY1_LABEL} named forms and the rolling chart live here — not on Job
        setup. Chance has this page. Saved briefs persist the same way as before.
      </p>
      {chance ? (
        <p className="plant-card px-4 py-3 text-sm">
          Chance — this is your Quality home. Named Day-1 forms and the live tube map sit on this
          module. Drops you save stay on this desk.
        </p>
      ) : null}
      {manuals ? <p className="text-xs text-[#5b6f73]">{madisonManualLabel("quality")}</p> : null}
      <OpenJobFrame empty={<p className="text-sm text-[#5b6f73]">{OPEN_JOB_EMPTY_COPY}</p>}>
        {(job) => (
          <div className="space-y-5">
            <QualityDay1Card status={job.status} />
            <RollingChartMap />
          </div>
        )}
      </OpenJobFrame>
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
