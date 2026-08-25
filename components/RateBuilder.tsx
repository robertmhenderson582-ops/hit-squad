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
        Illinois burden build-up for {alias("Madison")} / {alias("Wood River")} work: FICA, FUI, SUI,
        workers&apos; comp, GL, and small tools rolled into the burdened craft rate. This is the IL
        rate builder — B-1 ingest is parked. Field-trial figures stay on this desk.
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
        Burdened = base × (1 + FICA + FUI + SUI + WC + GL + small tools). SUI is the Illinois
        contractor rate loaded for this trial. Adjust on the blotter — do not treat as a published
        wage schedule.
      </p>
    </div>
  );
}
