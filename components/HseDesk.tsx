"use client";

import { ModuleTable } from "@/components/ModuleTable";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

export function HseDesk() {
  const { board, error } = useDeskBoard();
  const rows = board?.hse ?? [];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Permits, JSAs, walkdowns, and open actions for Madison / P66 work on this desk.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">OPEN / OVERDUE</p>
          <p className="font-display text-3xl text-amber-label">
            {rows.filter((row) => row.status === "OPEN" || row.status === "OVERDUE").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">PERMITS CURRENT</p>
          <p className="font-display text-3xl text-amber-label">
            {rows.filter((row) => row.type === "Permit" && row.status === "CURRENT").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WALKDOWNS</p>
          <p className="font-display text-3xl text-amber-label">
            {rows.filter((row) => row.type === "Walkdown").length || "—"}
          </p>
        </article>
      </div>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable caption="HSE RAIL" headers={["CODE", "ITEM", "SITE", "TYPE", "OWNER", "NOTE", "STATUS"]}>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3 font-mono text-amber-label">{row.code}</td>
            <td className="px-4 py-3">{row.title}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.site}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.type}</td>
            <td className="px-4 py-3">{row.owner}</td>
            <td className="px-4 py-3 font-mono text-xs text-steel-glow">{row.note}</td>
            <td className="px-4 py-3">
              <StatusStamp value={row.status} />
            </td>
          </tr>
        ))}
      </ModuleTable>
    </div>
  );
}
