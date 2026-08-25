"use client";

import { ModuleTable } from "@/components/ModuleTable";
import { useDeskBoard } from "@/components/useDeskBoard";

export function CostDesk() {
  const { board, error } = useDeskBoard();
  const rows = board?.cost ?? [];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Period progress / earned-value blotter. Budget, earned, and actual stay scoped to the
        signed-in owner.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable
        caption="COST / PPR — WEEKLY EARNED VALUE"
        headers={["ESTIMATE", "PERIOD", "BUDGET", "EARNED", "ACTUAL", "CPI", "SPI", "FORECAST", "NOTE"]}
      >
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3 font-mono text-amber-label">{row.estimateCode}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.period}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.budget}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.earned}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.actual}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.cpi}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.spi}</td>
            <td className="px-4 py-3 font-mono text-xs text-amber-label">{row.forecast}</td>
            <td className="px-4 py-3 font-mono text-xs text-steel-glow">{row.note}</td>
          </tr>
        ))}
      </ModuleTable>
    </div>
  );
}
