"use client";

import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  HSE_DAY1_LABEL,
  HSE_PACKAGE_SLOTS,
  canSeeHesRoster,
  canSeeMadisonSafetyManuals,
  hydrateHseDay1,
  type HseDay1,
} from "@/lib/hse-day1";

export function HseDay1Card({
  value,
  plant,
  onChange,
  onPlant,
}: {
  value: HseDay1;
  plant: string;
  onChange: (next: HseDay1) => void;
  onPlant: (next: string) => void;
}) {
  const { user } = useSession();
  const packState = hydrateHseDay1(value);
  const manuals = canSeeMadisonSafetyManuals(user, companyScopeFor(user));

  function patchSlot(id: (typeof HSE_PACKAGE_SLOTS)[number]["id"], next: string) {
    onChange(
      hydrateHseDay1({
        slots: { ...packState.slots, [id]: next },
      }),
    );
  }

  return (
    <div className="rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">{HSE_DAY1_LABEL.toUpperCase()}</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Site safety package. Slots stay empty until you fill them. Type what this module needs. No
        scoreboard. No invented hours.
      </p>
      <label className="mt-3 block text-sm">
        <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">PLANT</span>
        <input
          className="paper-field mt-1"
          value={plant}
          placeholder="Empty until filled"
          onChange={(event) => onPlant(event.target.value)}
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {HSE_PACKAGE_SLOTS.map((slot) => (
          <label key={slot.id} className="block text-sm">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{slot.label.toUpperCase()}</span>
            <input
              className="paper-field mt-1"
              value={packState.slots[slot.id] || ""}
              placeholder="Empty until filled"
              onChange={(event) => patchSlot(slot.id, event.target.value)}
            />
          </label>
        ))}
      </div>
      {manuals ? <p className="mt-3 text-xs text-[#5b6f73]">Madison Safety Manual / HES SOPs</p> : null}
      {canSeeHesRoster(user) ? (
        <p className="mt-2 text-xs text-[#5b6f73]">HES Reporting roster stays on the owner desk.</p>
      ) : null}
    </div>
  );
}
