"use client";

import { FormEvent, useState } from "react";
import { ModuleTable } from "@/components/ModuleTable";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";
import type { ChangeOrderRecord } from "@/lib/types";

export function ChangeOrderDesk() {
  const { board, error } = useDeskBoard();
  const [extra, setExtra] = useState<ChangeOrderRecord[]>([]);
  const [title, setTitle] = useState("");
  const [estimateCode, setEstimateCode] = useState("");
  const [origin, setOrigin] = useState<ChangeOrderRecord["origin"]>("Ops");
  const [laborDelta, setLaborDelta] = useState("");
  const [materialDelta, setMaterialDelta] = useState("");
  const [schedule, setSchedule] = useState("");
  const rows = [...(board?.changeOrders ?? []), ...extra];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = `SCR-${String(extra.length + 4).padStart(3, "0")}`;
    setExtra((current) => [
      ...current,
      {
        id: number,
        ownerId: "owner-robert-henderson",
        number,
        estimateCode: estimateCode || "EST-2609-U3",
        title,
        origin,
        status: "OPEN",
        laborDelta: laborDelta || "$0",
        materialDelta: materialDelta || "$0",
        schedule: schedule || "None",
        filed: "Today · this desk",
      },
    ]);
    setTitle("");
    setLaborDelta("");
    setMaterialDelta("");
    setSchedule("");
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-paper-cream/80">
        Change-order log and scope-change request. Filed tickets stay on this owner desk.
      </p>
      {error ? <p className="text-amber-label">{error}</p> : null}
      <ModuleTable
        caption="CHANGE ORDER / SCR LOG"
        headers={["NO.", "ESTIMATE", "SCOPE", "ORIGIN", "LABOR", "MATL", "SCHEDULE", "STATUS"]}
      >
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-steel-rim/20">
            <td className="px-4 py-3 font-mono text-amber-label">{row.number}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.estimateCode}</td>
            <td className="px-4 py-3">{row.title}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.origin}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.laborDelta}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.materialDelta}</td>
            <td className="px-4 py-3 font-mono text-xs">{row.schedule}</td>
            <td className="px-4 py-3">
              <StatusStamp value={row.status} />
            </td>
          </tr>
        ))}
      </ModuleTable>

      <form onSubmit={onSubmit} className="steel-plate paper-grain space-y-3 px-4 py-5">
        <p className="font-mono text-[11px] tracking-[0.22em] text-amber-label">NEW SCOPE CHANGE REQUEST</p>
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">TITLE</span>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} className="steel-field mt-1 w-full px-3 py-2" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">ESTIMATE</span>
            <select
              value={estimateCode}
              onChange={(event) => setEstimateCode(event.target.value)}
              className="steel-field mt-1 w-full px-3 py-2"
            >
              <option value="">Select package</option>
              {(board?.estimates ?? []).map((estimate) => (
                <option key={estimate.id} value={estimate.code}>
                  {estimate.code}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">ORIGIN</span>
            <select
              value={origin}
              onChange={(event) => setOrigin(event.target.value as ChangeOrderRecord["origin"])}
              className="steel-field mt-1 w-full px-3 py-2"
            >
              <option>Ops</option>
              <option>Engineering</option>
              <option>HSE</option>
              <option>Contractor</option>
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">LABOR DELTA</span>
            <input value={laborDelta} onChange={(event) => setLaborDelta(event.target.value)} className="steel-field mt-1 w-full px-3 py-2" />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">MATERIAL DELTA</span>
            <input value={materialDelta} onChange={(event) => setMaterialDelta(event.target.value)} className="steel-field mt-1 w-full px-3 py-2" />
          </label>
        </div>
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">SCHEDULE IMPACT</span>
          <input value={schedule} onChange={(event) => setSchedule(event.target.value)} className="steel-field mt-1 w-full px-3 py-2" />
        </label>
        <button type="submit" className="bg-steel px-4 py-2 font-display tracking-[0.18em] text-paper-cream">
          FILE SCR
        </button>
      </form>
    </div>
  );
}
