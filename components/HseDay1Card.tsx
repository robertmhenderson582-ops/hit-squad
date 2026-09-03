"use client";

import { useMemo } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import type { EstimateStatus } from "@/lib/estimate-status";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import {
  HSE_DAY1_LABEL,
  HSE_LIVE_NOTE,
  HSE_PACKAGE_SLOTS,
  canSeeHesRoster,
  hseJobSnapshot,
  hseNotify,
  hsePackageForSeat,
  hydrateHseDay1,
} from "@/lib/hse-day1";
import { readSubSheet } from "@/lib/subcontractor";

export function HseDay1Card({
  status = "Estimate",
  site = "",
  client = "",
}: {
  status?: EstimateStatus;
  site?: string;
  client?: string;
}) {
  const pack = useEstimatePackage();
  const { user } = useSession();
  const packState = hydrateHseDay1(pack.jobMeta.hseDay1);
  const hours = useMemo(
    () =>
      sumSplits(
        [
          ...pack.crew.staff,
          ...pack.crew.generalForeman,
          ...pack.crew.foreman,
          ...pack.crew.direct,
          ...pack.crew.support,
        ].map((row) => computeRowHours(row, site, client, pack.crew.otAfter8)),
      ).hours,
    [client, pack.crew, site],
  );
  const snapshot = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const subs = readSubSheet(pack.estimateKey);
    return hseJobSnapshot({
      plant: site,
      phases: pack.schedule.phases,
      crafts: [
        ...pack.crew.staff,
        ...pack.crew.generalForeman,
        ...pack.crew.foreman,
        ...pack.crew.direct,
        ...pack.crew.support,
      ]
        .map((row) => row.position)
        .filter(Boolean),
      equipment: [
        ...equipment.largeTools.map((row) => row.item),
        ...equipment.thirdParty.map((row) => row.item),
      ].filter(Boolean),
      subs: [...subs.cards.map((card) => card.vendor), ...subs.lines.map((line) => line.vendor)].filter(Boolean),
      hours,
    });
  }, [hours, pack.crew, pack.estimateKey, pack.schedule.phases, site]);
  const surface = hsePackageForSeat(packState, snapshot, user, companyScopeFor(user));

  function patchSlot(id: (typeof HSE_PACKAGE_SLOTS)[number]["id"], value: string) {
    pack.setJobMeta((current) => ({
      ...current,
      hseDay1: hydrateHseDay1({
        slots: { ...packState.slots, [id]: value },
      }),
    }));
  }

  return (
    <div className="mt-6 rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">{HSE_DAY1_LABEL.toUpperCase()}</h2>
      {hseNotify(status) ? <p className="mt-2 text-sm text-[#163038]">{HSE_LIVE_NOTE}</p> : null}
      <p className="mt-2 text-sm text-[#5b6f73]">
        Site safety package. Slots stay empty until you fill them. Plant, phases, crafts, equipment, and
        subs come from this estimate.
      </p>
      <p className="mt-2 text-sm text-[#163038]">
        {surface.plant || "Plant not set"}
        {surface.phases.length ? ` · ${surface.phases.join(" · ")}` : ""}
      </p>
      {surface.crafts.length ? <p className="mt-1 text-sm text-[#5b6f73]">Crafts: {surface.crafts.join(" · ")}</p> : null}
      {surface.equipment.length ? (
        <p className="mt-1 text-sm text-[#5b6f73]">Equipment: {surface.equipment.join(" · ")}</p>
      ) : null}
      {surface.subs.length ? <p className="mt-1 text-sm text-[#5b6f73]">Subs: {surface.subs.join(" · ")}</p> : null}
      {surface.hours != null ? (
        <p className="mt-1 text-sm text-[#5b6f73]">Hours on this estimate: {surface.hours.toLocaleString()}</p>
      ) : (
        <p className="mt-1 text-sm text-[#5b6f73]">No scoreboard until real hours exist.</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {surface.slots.map((slot) => (
          <label key={slot.id} className="block text-sm">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{slot.label.toUpperCase()}</span>
            <input
              className="paper-field mt-1"
              value={slot.value}
              placeholder="Empty until filled"
              onChange={(event) => patchSlot(slot.id, event.target.value)}
            />
          </label>
        ))}
      </div>
      {surface.manuals.length ? <p className="mt-3 text-xs text-[#5b6f73]">{surface.manuals.join(" · ")}</p> : null}
      {canSeeHesRoster(user) ? (
        <p className="mt-2 text-xs text-[#5b6f73]">HES Reporting roster stays on the owner desk.</p>
      ) : null}
    </div>
  );
}
