"use client";

import { FieldBlock, FieldMark } from "@/components/FieldMark";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import {
  HSE_DAY1_LABEL,
  HSE_PACKAGE_SLOTS,
  HSE_SLOT_STATUSES,
  canSeeHesRoster,
  canSeeMadisonSafetyManuals,
  emptyHseSlot,
  hydrateHseDay1,
  hseSlot,
  hseSlotMarked,
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

  function patchSlot(
    id: (typeof HSE_PACKAGE_SLOTS)[number]["id"],
    next: Partial<{ status: string; date: string; note: string }>,
  ) {
    const current = hseSlot(packState, id);
    const status = next.status ?? current.status;
    const date = next.date ?? current.date;
    const note = next.note ?? current.note;
    onChange(
      hydrateHseDay1({
        slots: {
          ...packState.slots,
          [id]: {
            ...emptyHseSlot(),
            status,
            date,
            note,
            marked: hseSlotMarked(status) || Boolean(note.trim()),
          },
        },
      }),
    );
  }

  return (
    <div className="plant-card px-4 py-4">
      <h2 className="font-display text-xl text-[#163038]">{HSE_DAY1_LABEL}</h2>
      <p className="mt-2 text-base text-[#163038]">
        Site safety package. Type status, date, and notes like the field forms — not a checkbox shell.
        No scoreboard. No invented hours. This is not a plant permit office.
      </p>
      <FieldBlock label="Plant">
        <input
          className="paper-field mt-1"
          value={plant}
          placeholder="Empty until filled"
          onChange={(event) => onPlant(event.target.value)}
        />
      </FieldBlock>
      <div className="mt-4 overflow-x-auto">
        <table className="field-register-table min-w-full text-left">
          <thead>
            <tr>
              <th className="whitespace-nowrap px-2 py-2">Package item</th>
              <th className="whitespace-nowrap px-2 py-2">Status</th>
              <th className="whitespace-nowrap px-2 py-2">Date</th>
              <th className="whitespace-nowrap px-2 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {HSE_PACKAGE_SLOTS.map((slot) => {
              const row = hseSlot(packState, slot.id);
              return (
                <tr key={slot.id} className="border-t border-[#c5d4d4]">
                  <td className="px-2 py-2 font-semibold text-[#163038]">
                    <FieldMark>{slot.label}</FieldMark>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="paper-field"
                      value={row.status}
                      aria-label={`${slot.label} status`}
                      onChange={(event) => patchSlot(slot.id, { status: event.target.value })}
                    >
                      {HSE_SLOT_STATUSES.map((item) => (
                        <option key={item.id || "blank"} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="paper-field"
                      type="date"
                      value={row.date}
                      aria-label={`${slot.label} date`}
                      onChange={(event) => patchSlot(slot.id, { date: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="paper-field"
                      value={row.note}
                      placeholder="Type the note"
                      aria-label={`${slot.label} note`}
                      onChange={(event) => patchSlot(slot.id, { note: event.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {manuals ? <p className="mt-3 text-base text-[#163038]">Madison Safety Manual / HES SOPs</p> : null}
      {canSeeHesRoster(user) ? (
        <p className="mt-2 text-base text-[#163038]">HES Reporting roster stays on the owner desk.</p>
      ) : null}
    </div>
  );
}
