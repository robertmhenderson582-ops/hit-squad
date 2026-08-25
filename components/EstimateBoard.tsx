"use client";

import Link from "next/link";
import { ModuleTable } from "@/components/ModuleTable";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

export function EstimateBoard() {
  const alias = useAlias();
  const { board, error } = useDeskBoard();
  const rows = board?.estimates ?? [];

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Working estimates for this owner desk only. {alias("Madison")} / {alias("P66")} plant figures stay on the signed-in
        blotter. Field trial — not a release.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING / ISSUED</p>
          <p className="mt-1 font-display text-3xl text-amber-label">
            {rows.filter((row) => row.status === "WORKING" || row.status === "ISSUED").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">HOLD</p>
          <p className="mt-1 font-display text-3xl text-amber-label">
            {rows.filter((row) => row.status === "HOLD").length || "—"}
          </p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">SITES ON THIS DESK</p>
          <p className="mt-1 font-display text-3xl text-amber-label">{board?.sites.length || "—"}</p>
        </article>
      </div>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable
        caption="ESTIMATE LOG — OWNER SCOPED"
        headers={["CODE", "PACKAGE", "CLIENT / UNIT", "TYPE", "REV", "WINDOW", "TOTAL", "STATUS"]}
      >
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3 font-mono text-amber-label">
              <Link href={`/estimates/${row.id}`} className="underline underline-offset-4">
                {row.code}
              </Link>
            </td>
            <td className="px-4 py-3">
              <Link href={`/estimates/${row.id}`}>{row.title}</Link>
            </td>
            <td className="px-4 py-3 font-mono text-xs">
              {alias(row.client)}
              <br />
              {alias(row.unit)}
            </td>
            <td className="px-4 py-3 font-mono text-xs">{row.type}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.revision}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.window}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.total}</td>
            <td className="px-4 py-3">
              <StatusStamp value={row.status} />
            </td>
          </tr>
        ))}
      </ModuleTable>
    </div>
  );
}
