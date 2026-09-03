"use client";

import { useEffect, useState } from "react";
import { FieldBlock } from "@/components/FieldMark";
import { QualityFormJump, QualityFormScreens } from "@/components/QualityFormScreens";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  QUALITY_DAY1_LABEL,
  QUALITY_PACKAGE_FORMS,
  canSeeMadisonManuals,
  hydrateQualityDay1,
  madisonManualLabel,
  publicQualityDrops,
  type QualityDay1,
  type QualityFormId,
} from "@/lib/quality-day1";
import type { PublicLeadBrief } from "@/lib/lead-briefs";

export function QualityDay1Card({
  value,
  workNames,
  travelerRows,
  onChange,
  onWorkNames,
}: {
  value: QualityDay1;
  workNames: string;
  travelerRows: number;
  onChange: (next: QualityDay1) => void;
  onWorkNames: (next: string) => void;
}) {
  const { user } = useSession();
  const packState = hydrateQualityDay1(value);
  const [openForm, setOpenForm] = useState<QualityFormId | "">("2.7.1");
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

  function patch(next: Partial<QualityDay1>) {
    onChange(hydrateQualityDay1({ ...packState, ...next }));
  }

  return (
    <div className="plant-card px-4 py-4">
      <h2 className="font-display text-xl text-[#163038]">{QUALITY_DAY1_LABEL}</h2>
      <p className="mt-2 text-sm text-[#163038]">
        Chance’s named package. Open a form and type. No invented hold points. Files stay off this desk.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FieldBlock label="Inspection plan / ITP">
          <select
            className="paper-field mt-1"
            value={packState.inspectionPlan ? "yes" : "no"}
            onChange={(event) => patch({ inspectionPlan: event.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </FieldBlock>
        <FieldBlock label="Weld map">
          <select
            className="paper-field mt-1"
            value={packState.weldMap ? "yes" : "no"}
            onChange={(event) => patch({ weldMap: event.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </FieldBlock>
        <FieldBlock label="Traveler count">
          <input
            className="paper-field mt-1"
            inputMode="numeric"
            value={packState.travelerCount}
            onChange={(event) => patch({ travelerCount: event.target.value })}
          />
          <p className="mt-1 text-sm text-[#163038]">
            Board has {travelerRows} traveler{travelerRows === 1 ? "" : "s"}. Adding a traveler row updates this
            count. Typing here does not invent travelers.
          </p>
        </FieldBlock>
      </div>
      <FieldBlock label="Phase / work names">
        <input
          className="paper-field mt-1"
          value={workNames}
          placeholder="Names only — no hold points"
          onChange={(event) => onWorkNames(event.target.value)}
        />
      </FieldBlock>
      <QualityFormJump activeId={openForm} onPick={(id) => setOpenForm(id)} />
      <QualityFormScreens value={packState} onChange={onChange} openForm={openForm} onOpenForm={setOpenForm} />
      {drops.length ? (
        <ul className="mt-3 space-y-1 text-sm text-[#163038]">
          {drops.map((drop) => (
            <li key={drop.name}>
              {drop.name}
              {drop.files.length ? ` · ${drop.files.join(" · ")}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {manuals ? <p className="mt-3 text-sm text-[#163038]">{madisonManualLabel("quality")}</p> : null}
      <p className="sr-only">{QUALITY_PACKAGE_FORMS.map((item) => item.label).join(" ")}</p>
    </div>
  );
}
