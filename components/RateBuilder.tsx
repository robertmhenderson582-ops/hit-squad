"use client";

import {
  SHAHAN_BOOK_LABEL,
  SHAHAN_CRAFT_PD,
  SHAHAN_EQUIPMENT,
  SHAHAN_LABOR,
  SHAHAN_OT_MULTIPLIER,
  SHAHAN_PT_MULTIPLIER,
  SHAHAN_STAFF_PD,
  formatDeskDollars,
  shahanEquipmentByFuel,
  shahanLaborByGroup,
} from "@/lib/shahan-wood-river";

function rateCell(value: number | null) {
  return value && value > 0 ? formatDeskDollars(value) : "—";
}

function EquipmentTable({
  rows,
  caption,
}: {
  rows: { description: string; daily: number | null; weekly: number | null; monthly: number | null }[];
  caption: string;
}) {
  return (
    <section className="plant-card px-5 py-5">
      <h3 className="text-lg font-semibold text-[#163038]">{caption}</h3>
      <p className="mt-1 text-sm text-[#5b6f73]">Daily / weekly / monthly. $0 / cost-plus stays in the book as a blank cell.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["DESCRIPTION", "DAILY", "WEEKLY", "MONTHLY"].map((header) => (
                <th key={header} className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={4} className="px-2 py-4 text-sm text-[#5b6f73]">
                  No Shahan equipment rows in this table.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${caption}:${index}:${row.description}`} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">{row.description}</td>
                  <td className="px-2 py-2 font-semibold">{rateCell(row.daily)}</td>
                  <td className="px-2 py-2 font-semibold">{rateCell(row.weekly)}</td>
                  <td className="px-2 py-2 font-semibold">{rateCell(row.monthly)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RateBuilder() {
  const groups = shahanLaborByGroup(SHAHAN_LABOR);
  const equipment = shahanEquipmentByFuel(SHAHAN_EQUIPMENT);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="font-display text-2xl font-semibold text-[#163038]">{SHAHAN_BOOK_LABEL}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5b6f73]">
          Debbie Shahan TM OCIP book for P66 Wood River. Crew Cost uses these ST / OT / DT bill
          rates when a row title matches. PT Bill Rate maps to DT. OT × {SHAHAN_OT_MULTIPLIER}. PT ×{" "}
          {SHAHAN_PT_MULTIPLIER}. Staff PD ${SHAHAN_STAFF_PD} / day. Craft PD ${SHAHAN_CRAFT_PD} /
          day. East Coast weekly-40 / Sunday DT — not DT after 12.
        </p>
      </section>

      {groups.map((group) => (
        <section key={group.group} className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">{group.group}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  {["CRAFT", "ST", "OT", "DT", "PD"].map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.length === 0 ? (
                  <tr className="border-t border-[#d5e0de]">
                    <td colSpan={5} className="px-2 py-4 text-sm text-[#5b6f73]">
                      No Shahan rows in this group yet.
                    </td>
                  </tr>
                ) : (
                  group.rows.map((row, index) => (
                    <tr key={`${group.group}:${index}:${row.craftName}`} className="border-t border-[#d5e0de]">
                      <td className="px-2 py-2">{row.craftName}</td>
                      <td className="px-2 py-2 font-semibold">{rateCell(row.st)}</td>
                      <td className="px-2 py-2 font-semibold">{rateCell(row.ot)}</td>
                      <td className="px-2 py-2 font-semibold">{rateCell(row.dt)}</td>
                      <td className="px-2 py-2 font-semibold">{rateCell(row.pd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <EquipmentTable rows={equipment.wet} caption="Equipment — with fuel (wet)" />
      <EquipmentTable rows={equipment.dry} caption="Equipment — without fuel (dry)" />
    </div>
  );
}
