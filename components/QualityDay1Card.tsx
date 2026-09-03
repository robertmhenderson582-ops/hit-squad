"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  QUALITY_DAY1_LABEL,
  QUALITY_PACKAGE_FORMS,
  canSeeMadisonManuals,
  emptyQualityFormSlot,
  hydrateQualityDay1,
  madisonManualLabel,
  publicQualityDrops,
  qualityFormSlot,
  type QualityDay1,
  type QualityFormId,
  type QualityFormSlot,
} from "@/lib/quality-day1";
import type { PublicLeadBrief } from "@/lib/lead-briefs";

export function QualityDay1Card({
  value,
  workNames,
  onChange,
  onWorkNames,
}: {
  value: QualityDay1;
  workNames: string;
  onChange: (next: QualityDay1) => void;
  onWorkNames: (next: string) => void;
}) {
  const { user } = useSession();
  const packState = hydrateQualityDay1(value);
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

  function patchForm(id: QualityFormId, next: Partial<QualityFormSlot>) {
    const current = qualityFormSlot(packState, id);
    patch({
      forms: {
        ...packState.forms,
        [id]: { ...emptyQualityFormSlot(), ...current, ...next },
      },
    });
  }

  return (
    <div className="rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">{QUALITY_DAY1_LABEL.toUpperCase()}</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Chance’s named package. Mark, fill, or count on this module. Names only — no invented hold points.
        Files stay off this desk.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">INSPECTION PLAN / ITP</span>
          <select
            className="paper-field mt-1"
            value={packState.inspectionPlan ? "yes" : "no"}
            onChange={(event) => patch({ inspectionPlan: event.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">WELD MAP</span>
          <select
            className="paper-field mt-1"
            value={packState.weldMap ? "yes" : "no"}
            onChange={(event) => patch({ weldMap: event.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">TRAVELER COUNT</span>
          <input
            className="paper-field mt-1"
            inputMode="numeric"
            value={packState.travelerCount}
            onChange={(event) => patch({ travelerCount: event.target.value })}
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">PHASE / WORK NAMES</span>
        <input
          className="paper-field mt-1"
          value={workNames}
          placeholder="Names only — no hold points"
          onChange={(event) => onWorkNames(event.target.value)}
        />
      </label>
      <div className="mt-4 grid gap-3">
        {QUALITY_PACKAGE_FORMS.map((item) => {
          const slot = qualityFormSlot(packState, item.id);
          return (
            <div key={item.id} className="rounded-lg border border-[#d5e0de] px-3 py-3">
              <label className="flex items-center gap-2 text-sm text-[#163038]">
                <input
                  type="checkbox"
                  checked={slot.marked}
                  onChange={(event) => patchForm(item.id, { marked: event.target.checked })}
                />
                <span>{item.label}</span>
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">FILL</span>
                  <input
                    className="paper-field mt-1"
                    value={slot.fill}
                    onChange={(event) => patchForm(item.id, { fill: event.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">COUNT</span>
                  <input
                    className="paper-field mt-1"
                    value={slot.count}
                    inputMode="numeric"
                    onChange={(event) => patchForm(item.id, { count: event.target.value })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
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
