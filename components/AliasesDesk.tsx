"use client";

import { ALIAS_CATALOG } from "@/lib/catalog-aliases";
import { useOwnerDesk } from "@/components/OwnerDeskContext";

export function AliasesDesk() {
  const desk = useOwnerDesk();
  if (!desk) return <p className="text-[#5b6f73]">Owner desk only.</p>;

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#163038]">Aliases</h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Catalog aliases live here, not on Display. Whole catalog, not only P66. Off = real names
            on the owner blotter. On = tester view.
            Ironwood Refining, Piedmont Power / Ridge Station, Harbor Fuels / Harbor Works, Pacific
            Fuels / Bay Point, Midcontinent Pipeline / Midwest Terminal. Nathan, John, Wendell, Benny,
            and Chance stay on real names. Mark, Cody, Bill, James, and Joseph stay aliased. Testers
            never see this switch. Rates, site ids, and files stay real underneath.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={desk.aliasesOn}
          onClick={() => desk.setAliasesOn(!desk.aliasesOn)}
          className={`rounded-full px-4 py-2 text-sm text-white ${desk.aliasesOn ? "bg-steel" : "bg-[#5b6f73]"}`}
        >
          {desk.aliasesOn ? "Aliases on" : "Aliases off"}
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
            <tr>
              <th className="px-2 py-2">REAL NAME</th>
              <th className="px-2 py-2">ALIAS</th>
              <th className="px-2 py-2">NOTE</th>
            </tr>
          </thead>
          <tbody>
            {ALIAS_CATALOG.map((row) => (
              <tr key={row.real} className="border-t border-[#d5e0de]">
                <td className="px-2 py-2">{row.real}</td>
                <td className="px-2 py-2 font-semibold">{row.alias}</td>
                <td className="px-2 py-2 text-[#5b6f73]">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
