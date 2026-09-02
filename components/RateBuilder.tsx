"use client";

import { SubcontractorRateBook } from "@/components/SubcontractorDesk";
import { useAlias } from "@/components/OwnerDeskContext";
import {
  SHAHAN_EQUIPMENT,
  formatDeskDollars,
  shahanEquipmentByFuel,
} from "@/lib/shahan-wood-river";
import { EAST_COAST_OT_NOTE, LABOR_SHEET_COLUMNS } from "@/lib/rate-builder";

/** Yates labor sheet: CRAFT / POSITION, BASE WAGE (BW), BILLED ST, BILLED OT, BILLED DT, PD. */
import {
  WOOD_RIVER_SITE_ID,
  bookForSiteId,
  formatBaseWage,
  formatBilledDt,
  formatBilledOt,
  formatBilledSt,
  isWoodRiverBook,
  wageCatalogByGroup,
  wageLookupLabels,
  wageLookupNote,
} from "@/lib/wage-lookup";

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

export function RateBuilder({ siteId = WOOD_RIVER_SITE_ID }: { siteId?: string } = {}) {
  const alias = useAlias();
  const book = bookForSiteId(siteId);
  if (!book) return null;
  const labeled = wageLookupLabels(book.wageCatalog);
  const groups = wageCatalogByGroup(book.wageCatalog).map((group) => ({
    ...group,
    rows: labeled.filter((item) => group.rows.includes(item.row)),
  }));
  const equipment = shahanEquipmentByFuel(SHAHAN_EQUIPMENT);
  const woodRiver = isWoodRiverBook(book);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="font-display text-2xl font-semibold text-[#163038]">{alias(book.wageLabel || book.bookLabel)}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5b6f73]">{alias(wageLookupNote(book))}</p>
        {book.wageCoast === "east" ? (
          <p className="mt-2 text-sm text-[#5b6f73]">{EAST_COAST_OT_NOTE}</p>
        ) : null}
      </section>

      {groups.map((group) => (
        <section key={group.group} className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">{group.group}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  {LABOR_SHEET_COLUMNS.map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.length === 0 ? (
                  <tr className="border-t border-[#d5e0de]">
                    <td colSpan={LABOR_SHEET_COLUMNS.length} className="px-2 py-4 text-sm text-[#5b6f73]">
                      No Shahan rows in this group yet.
                    </td>
                  </tr>
                ) : (
                  group.rows.map((item) => (
                    <tr key={`${group.group}:${item.index}:${item.row.craftName}`} className="border-t border-[#d5e0de]">
                      <td className="px-2 py-2">{item.label}</td>
                      <td className="px-2 py-2 font-semibold">{formatBaseWage(item.row, book) || "—"}</td>
                      <td className="px-2 py-2 font-semibold">{formatBilledSt(item.row)}</td>
                      <td className="px-2 py-2 font-semibold">{formatBilledOt(item.row)}</td>
                      <td className="px-2 py-2 font-semibold">{formatBilledDt(item.row)}</td>
                      <td className="px-2 py-2 font-semibold">{rateCell(item.row.pd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {woodRiver ? <EquipmentTable rows={equipment.wet} caption="Equipment — with fuel (wet)" /> : null}
      {woodRiver ? <EquipmentTable rows={equipment.dry} caption="Equipment — without fuel (dry)" /> : null}
      {woodRiver ? <SubcontractorRateBook /> : null}
    </div>
  );
}
