"use client";

import { FieldBlock, FieldMark } from "@/components/FieldMark";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  HSE_DAY1_LABEL,
  HSE_PACKAGE_SLOTS,
  canSeeHesRoster,
  canSeeMadisonSafetyManuals,
  emptyHseSlot,
  hydrateHseDay1,
  hseSlot,
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

  function patchSlot(id: (typeof HSE_PACKAGE_SLOTS)[number]["id"], next: { marked?: boolean; note?: string }) {
    const current = hseSlot(packState, id);
    onChange(
      hydrateHseDay1({
        slots: {
          ...packState.slots,
          [id]: { ...emptyHseSlot(), ...current, ...next },
        },
      }),
    );
  }

  return (
    <div className="plant-card px-4 py-4">
      <h2 className="font-display text-xl text-[#163038]">{HSE_DAY1_LABEL}</h2>
      <p className="mt-2 text-sm text-[#163038]">
        Site safety package. Mark what is in place and type the note. No scoreboard. No invented hours.
        This is not a plant permit office.
      </p>
      <FieldBlock label="Plant">
        <input
          className="paper-field mt-1"
          value={plant}
          placeholder="Empty until filled"
          onChange={(event) => onPlant(event.target.value)}
        />
      </FieldBlock>
      <div className="mt-4 grid gap-3">
        {HSE_PACKAGE_SLOTS.map((slot) => {
          const row = hseSlot(packState, slot.id);
          return (
            <div key={slot.id} className="rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-3 py-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#163038]">
                <input
                  type="checkbox"
                  checked={row.marked}
                  onChange={(event) => patchSlot(slot.id, { marked: event.target.checked })}
                />
                <FieldMark>{slot.label}</FieldMark>
              </label>
              <input
                className="paper-field mt-2"
                value={row.note}
                placeholder="Note — empty until filled"
                onChange={(event) => patchSlot(slot.id, { note: event.target.value })}
              />
            </div>
          );
        })}
      </div>
      {manuals ? <p className="mt-3 text-sm text-[#163038]">Madison Safety Manual / HES SOPs</p> : null}
      {canSeeHesRoster(user) ? (
        <p className="mt-2 text-sm text-[#163038]">HES Reporting roster stays on the owner desk.</p>
      ) : null}
    </div>
  );
}
