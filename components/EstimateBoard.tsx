"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { ModuleTable } from "@/components/ModuleTable";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";
import { useSession } from "@/components/SessionProvider";
import { readClosed, reopenPackage } from "@/lib/desk-closeout";

export function EstimateBoard() {
  const alias = useAlias();
  const { user } = useSession();
  const { board, error } = useDeskBoard();
  const [closed, setClosed] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    setClosed(readClosed().filter((item) => item.kind === "estimate"));
  }, []);
  const rows = (board?.estimates ?? []).filter((row) => !closed.some((item) => item.id === row.id));
  const closedRows = (board?.estimates ?? []).filter((row) => closed.some((item) => item.id === row.id));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const who = row.estimator || user?.name || "Owner";
    const list = groups.get(who) ?? [];
    list.push(row);
    groups.set(who, list);
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Working estimates for this owner desk only. {alias("Madison")} / {alias("P66")} plant figures stay on the signed-in
        blotter. Created by is chrome only — authors stay the signed-in owner for now.
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
      {[...groups.entries()].map(([who, list]) => (
        <section key={who}>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-[#163038]">{who}</h2>
            <CreatedBy author={who} />
          </div>
          <ModuleTable
            caption="ESTIMATE LOG — OWNER SCOPED"
            headers={["CODE", "PACKAGE", "CLIENT / UNIT", "TYPE", "REV", "WINDOW", "TOTAL", "STATUS", ""]}
          >
            {list.map((row) => (
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
                <td className="px-4 py-3">
                  <CreatedBy author={row.estimator || who} />
                </td>
              </tr>
            ))}
          </ModuleTable>
        </section>
      ))}
      {closedRows.length ? (
        <details className="plant-card px-5 py-4">
          <summary className="cursor-pointer font-display text-xl">Closed out</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {closedRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.code} · {row.title}
                </span>
                <span className="flex gap-2">
                  <Link href={`/estimates/${row.id}`} className="underline">
                    View
                  </Link>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      reopenPackage(row.id);
                      setClosed(readClosed().filter((item) => item.kind === "estimate"));
                    }}
                  >
                    Reopen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
