"use client";

import { ALIAS_CATALOG } from "@/lib/catalog-aliases";
import { VISUAL_ROSTER } from "@/lib/owner-desk";
import { useOwnerDesk } from "@/components/OwnerDeskContext";

export function UsersAdmin() {
  const desk = useOwnerDesk();
  if (!desk) return <p className="mt-4 text-[#5b6f73]">Owner desk only.</p>;

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#163038]">Aliases</h2>
            <p className="mt-1 text-sm text-[#5b6f73]">
              Whole catalog, not only P66. Off = real names on the owner blotter. On = tester view.
              Madison shop (Nathan / later John) still sees real names. Mark, Bill, Joseph, and Benny
              stay aliased. Benny never sees real client or plant names.
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
        <p className="mt-3 text-xs text-[#5b6f73]">
          Imports that still say Phillips 66 / P66 still match under Ironwood. Owner viewing with the
          toggle off sees real names. Follow Benny to check his lens.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">View as</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Responsibility + site lens for Owner and Joseph later. This is not Follow. Follow watches a
          tester’s screen and stays Robert-only.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => desk.setViewAs("owner")}
            className={`rounded-lg px-4 py-2 text-sm ${
              desk.viewAs === "owner" ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            Owner
          </button>
          <button
            type="button"
            onClick={() => desk.setViewAs("joseph")}
            className={`rounded-lg px-4 py-2 text-sm ${
              desk.viewAs === "joseph" ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            Joseph (later)
          </button>
        </div>
      </section>

      <section className="plant-card overflow-hidden px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Roster</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Visual book only. No live seats, no claim passwords, no mail.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
              <tr>
                {["NAME", "INVITE", "PERMISSION", "SHOP"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VISUAL_ROSTER.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.email}</td>
                  <td className="px-2 py-2">{row.permission}</td>
                  <td className="px-2 py-2">{row.shop === "madison" ? "Madison · real names" : "Field · aliases"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
