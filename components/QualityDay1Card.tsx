"use client";

import { useEffect, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import type { EstimateStatus } from "@/lib/estimate-status";
import {
  QUALITY_DAY1_LABEL,
  QUALITY_LIVE_NOTE,
  canSeeMadisonManuals,
  hydrateQualityDay1,
  madisonManualLabel,
  publicQualityDrops,
  qualityNotify,
  qualityWorkNames,
} from "@/lib/quality-day1";
import type { PublicLeadBrief } from "@/lib/lead-briefs";

export function QualityDay1Card({ status = "Estimate" }: { status?: EstimateStatus }) {
  const pack = useEstimatePackage();
  const { user } = useSession();
  const packState = hydrateQualityDay1(pack.jobMeta.qualityDay1);
  const names = qualityWorkNames(pack.schedule.phases);
  const [drops, setDrops] = useState<Array<{ name: string; files: string[] }>>([]);
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/desk/briefs?kind=quality", { credentials: "include" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { briefs?: PublicLeadBrief[] };
        if (cancelled || !response.ok || !Array.isArray(data.briefs)) return;
        setDrops(publicQualityDrops(data.briefs, user?.email));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  function patch(next: Partial<typeof packState>) {
    pack.setJobMeta((current) => ({
      ...current,
      qualityDay1: hydrateQualityDay1({ ...packState, ...next }),
    }));
  }

  return (
    <div className="mt-6 rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">{QUALITY_DAY1_LABEL.toUpperCase()}</h2>
      {qualityNotify(status) ? <p className="mt-2 text-sm text-[#163038]">{QUALITY_LIVE_NOTE}</p> : null}
      <p className="mt-2 text-sm text-[#5b6f73]">
        Inspection plan, weld map, and traveler count for this job. Phase names only — no invented hold points.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-[#163038]">
          <input
            type="checkbox"
            checked={packState.inspectionPlan}
            onChange={(event) => patch({ inspectionPlan: event.target.checked })}
          />
          Inspection plan
        </label>
        <label className="flex items-center gap-2 text-sm text-[#163038]">
          <input
            type="checkbox"
            checked={packState.weldMap}
            onChange={(event) => patch({ weldMap: event.target.checked })}
          />
          Weld map
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">TRAVELER COUNT</span>
          <input
            className="paper-field mt-1"
            value={packState.travelerCount}
            inputMode="numeric"
            onChange={(event) => patch({ travelerCount: event.target.value })}
          />
        </label>
      </div>
      {names.length ? (
        <p className="mt-3 text-sm text-[#163038]">Work names: {names.join(" · ")}</p>
      ) : (
        <p className="mt-3 text-sm text-[#5b6f73]">Turn on phases on Job setup to seed work names.</p>
      )}
      {drops.length ? (
        <ul className="mt-3 space-y-1 text-sm text-[#5b6f73]">
          {drops.map((drop) => (
            <li key={drop.name}>
              {drop.name}
              {drop.files.length ? ` · ${drop.files.join(" · ")}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {manuals ? <p className="mt-3 text-xs text-[#5b6f73]">{madisonManualLabel("quality")}</p> : null}
    </div>
  );
}
