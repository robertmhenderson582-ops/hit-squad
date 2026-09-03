"use client";

import { useState } from "react";
import { AwardedJobFrame } from "@/components/AwardedJobFrame";
import { EmptyLane } from "@/components/EmptyLane";
import { LeadStudio } from "@/components/LeadStudio";
import { QualityDay1Card, QualityFormRoster } from "@/components/QualityDay1Card";
import { RollingChartMap } from "@/components/RollingChartMap";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  QUALITY_DAY1_LABEL,
  QUALITY_PACKAGE_FORMS,
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
      <AwardedJobFrame
        label="AWARDED JOB"
        empty={
          <div className="rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
            <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">{QUALITY_DAY1_LABEL.toUpperCase()}</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">
              Named package Chance sent. Pick an awarded job to mark, fill, or count. Steam Drum
              Rolling Chart, Mud Drum Rolling Tracking Chart, and Generating Bank Retube Progression
              Chart open on that job.
            </p>
            <QualityFormRoster forms={QUALITY_PACKAGE_FORMS} />
          </div>
        }
      >
        {() => (
          <div className="space-y-5">
            <QualityDay1Card status="Awarded" />
            <RollingChartMap />
          </div>
        )}
      </AwardedJobFrame>
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
