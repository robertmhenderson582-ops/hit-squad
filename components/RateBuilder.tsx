"use client";

import { ModuleTable } from "@/components/ModuleTable";
import { useAlias } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

export function RateBuilder() {
  const alias = useAlias();
  const { board, error } = useDeskBoard();
  const rows = board?.rates ?? [];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Illinois burden columns for {alias("Madison")} / {alias("Wood River")} work: FICA, FUI, SUI,
        workers&apos; comp, GL, and small tools. Burdened dollars on the right are stored field-trial
        figures — not live-computed from those columns. B-1 ingest is parked.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable
        caption={alias("RATE BUILDER — IL / WOOD RIVER")}
        headers={["CRAFT", "ST", "BASE", "FICA", "FUI", "SUI", "W/C", "GL", "TOOLS", "BURDENED"]}
      >
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3">{row.craft}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.state}</td>
            <td className="px-4 py-3 font-mono text-xs">${row.base.toFixed(2)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.fica)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.fui)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.sui)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.wc)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.gl)}</td>
            <td className="px-4 py-3 font-mono text-xs">{pct(row.smallTools)}</td>
            <td className="px-4 py-3 font-mono text-xs text-amber-label">${row.burdened.toFixed(2)}</td>
          </tr>
        ))}
      </ModuleTable>
      <p className="font-mono text-[11px] leading-5 text-paper-cream/55">
        Burdened dollars are field-trial figures stored on this desk. They are not live-computed
        from the FICA / FUI / SUI / W/C / GL / tools columns. The wrap stays as stored until it is
        decided later. B-1 ingest is parked. Do not treat this as a published wage schedule.
      </p>
    </div>
  );
}
