"use client";

import { ModuleTable } from "@/components/ModuleTable";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

export function QualityDesk() {
  const { board, error } = useDeskBoard();
  const rows = board?.quality ?? [];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        ITP hold points, NDE, and punchlist for packages on this owner desk.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable caption="QUALITY / ITP" headers={["CODE", "ITEM", "UNIT", "TYPE", "NOTE", "STATUS"]}>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3 font-mono text-amber-label">{row.code}</td>
            <td className="px-4 py-3">{row.title}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.unit}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.type}</td>
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
