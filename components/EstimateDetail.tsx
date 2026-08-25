"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CrewManHours } from "@/components/CrewManHours";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { LaborRollup } from "@/components/LaborRollup";
import { ModuleTable } from "@/components/ModuleTable";
import { CreatedBy } from "@/components/CreatedBy";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const alias = useAlias();
  const { board, error } = useDeskBoard();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const [status, setStatus] = useState<"Estimate" | "Submitted" | "Awarded">("Estimate");
  const estimate = board?.estimates.find((row) => row.id === estimateId);
  const site = board?.sites.find((row) => row.id === estimate?.siteId);
  const activities = useMemo(
    () => board?.activities.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );
  const equipment = useMemo(
    () => board?.equipment.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );
  const staffing = useMemo(
    () => board?.staffing.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );
  const changes = useMemo(
    () => board?.changeOrders.filter((row) => row.estimateCode === estimate?.code) ?? [],
    [board, estimate],
  );
  const cost = useMemo(
    () => board?.cost.filter((row) => row.estimateCode === estimate?.code) ?? [],
    [board, estimate],
  );

  if (error) return <p className="p-6 text-amber-flare">{error}</p>;
  if (!board) return <p className="p-6 font-mono text-xs tracking-[0.2em] text-steel">LOADING PACKAGE</p>;
  if (!estimate) {
    return (
      <p className="p-6">
        That package is not on this desk.{" "}
        <Link href="/estimates" className="text-steel underline">
          Back to estimates
        </Link>
      </p>
    );
  }

  return (
    <EstimateWorkspace
      crumb={`${alias(site?.name ?? estimate.unit)} / ${estimate.title}`}
      tab={tab}
      onTab={setTab}
      client={alias(estimate.client)}
      name={estimate.title}
      total={estimate.total}
      packageId={estimate.id}
    >
      {tab === "summary" ? (
        <section className="plant-card mx-auto max-w-3xl px-6 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-[#163038]">Job setup</h1>
            <CreatedBy author={estimate.estimator} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="pill bg-steel text-white">Existing customer</span>
            <span className="pill border border-[#c5d4d4] bg-white">New / potential client</span>
          </div>
          <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STATUS</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["Estimate", "Submitted", "Awarded"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`pill ${status === item ? "bg-steel text-white" : "border border-[#c5d4d4] bg-white"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="mt-6 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE TYPE</span>
            <input readOnly value={estimate.type} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CLIENT</span>
            <input readOnly value={alias(estimate.client)} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE NAME</span>
            <input readOnly value={estimate.title} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AFE / TA NAME</span>
            <input className="paper-field mt-2" placeholder="AFE or TA name" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AREA / UNIT</span>
            <input className="paper-field mt-2" placeholder="CAT, Coker, FCC…" />
            <p className="mt-1 text-xs text-[#5b6f73]">A unit, not the refinery title.</p>
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">OVERTIME / RATE</span>
            <input
              readOnly
              value={site?.name === "Wood River" ? "East Coast (PCA0001103)" : "Customer rule"}
              className="paper-field mt-2"
            />
          </label>
          {status !== "Estimate" ? (
            <>
              <label className="mt-4 block">
                <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">JOB / CR</span>
                <input className="paper-field mt-2" />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">PO</span>
                <input className="paper-field mt-2" />
              </label>
            </>
          ) : null}
          <p className="mt-4 text-sm text-[#5b6f73]">
            {estimate.code} · {estimate.window} · Dollars stay on the rail.
          </p>
          <div className="mt-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">TRAVEL</p>
            <table className="mt-2 min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="py-2">ITEM</th>
                  <th className="py-2">Mileage Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#d5e0de]">
                  <td className="py-2">Craft travel</td>
                  <td className="py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "activities" ? (
        <ModuleTable caption="ACTIVITIES" headers={["WBS", "ACTIVITY", "CRAFT", "MH", "DOLLARS", "STATUS"]}>
          {activities.map((row) => (
            <tr key={row.id} className="border-t border-steel-rim/20">
              <td className="px-4 py-3 font-mono text-amber-label">{row.wbs}</td>
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.craft}</td>
              <td className="px-4 py-3 font-mono">{row.mh.toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.dollars}</td>
              <td className="px-4 py-3">
                <StatusStamp value={row.status} />
              </td>
            </tr>
          ))}
        </ModuleTable>
      ) : null}

      {tab === "crew" ? (
        <EstimateWorkbook client={estimate.client} site={site?.name} name={estimate.title} />
      ) : null}

      {tab === "staffing" ? (
        <div className="space-y-3">
          <p className="text-sm text-[#5b6f73]">
            Billed as is the craft rate. Position is the duty title. Example labels: billed as
            Boilermaker Journeyman, position Tool Room Attendant. This split stays on Staffing — not
            on Direct Craft.
          </p>
          <ModuleTable caption="STAFFING" headers={["BILLED AS", "POSITION", "DAYS", "SHIFT", "HEADCOUNT"]}>
            {staffing.map((row) => (
              <tr key={row.id} className="border-t border-steel-rim/20">
                <td className="px-4 py-3">{row.role}</td>
                <td className="px-4 py-3 text-[#5b6f73]">—</td>
                <td className="px-4 py-3">{row.days}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.shift}</td>
                <td className="px-4 py-3 font-mono">{row.headcount}</td>
              </tr>
            ))}
          </ModuleTable>
        </div>
      ) : null}

      {tab === "equipment" ? (
        <ModuleTable caption="EQUIPMENT" headers={["ITEM", "QTY", "PERIOD", "RATE"]}>
          {equipment.map((row) => (
            <tr key={row.id} className="border-t border-steel-rim/20">
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3 font-mono">{row.qty}</td>
              <td className="px-4 py-3">{row.period}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.rate}</td>
            </tr>
          ))}
        </ModuleTable>
      ) : null}

      {tab === "costs" ? (
        <div className="space-y-5">
          <LaborRollup />
          <CrewManHours />
          <ModuleTable caption="COSTS" headers={["PERIOD", "BUDGET", "EARNED", "ACTUAL", "CPI", "SPI", "FORECAST"]}>
            {cost.map((row) => (
              <tr key={row.id} className="border-t border-steel-rim/20">
                <td className="px-4 py-3 font-mono text-xs">{row.period}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.budget}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.earned}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.actual}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.cpi}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.spi}</td>
                <td className="px-4 py-3 font-mono text-xs text-amber-label">{row.forecast}</td>
              </tr>
            ))}
          </ModuleTable>
        </div>
      ) : null}

      {tab === "change-orders" ? (
        <ModuleTable caption="CHANGE ORDERS" headers={["NO.", "SCOPE", "ORIGIN", "LABOR", "MATL", "STATUS"]}>
          {changes.map((row) => (
            <tr key={row.id} className="border-t border-steel-rim/20">
              <td className="px-4 py-3 font-mono text-amber-label">{row.number}</td>
              <td className="px-4 py-3">{row.title}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.origin}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.laborDelta}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.materialDelta}</td>
              <td className="px-4 py-3">
                <StatusStamp value={row.status} />
              </td>
            </tr>
          ))}
        </ModuleTable>
      ) : null}
    </EstimateWorkspace>
  );
}
