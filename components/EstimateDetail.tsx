"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CrewManHours } from "@/components/CrewManHours";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { LaborRollup } from "@/components/LaborRollup";
import { ModuleTable } from "@/components/ModuleTable";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { useDeskBoard } from "@/components/useDeskBoard";
import { boundOtLabel } from "@/lib/hours-clock";
import type { EstimateStatus } from "@/components/EstimateWorkspace";

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const alias = useAlias();
  const { board, error } = useDeskBoard();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const [status, setStatus] = useState<EstimateStatus>("Estimate");
  const estimate = board?.estimates.find((row) => row.id === estimateId);
  const site = board?.sites.find((row) => row.id === estimate?.siteId);
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
    <EstimatePackageProvider estimateKey={estimate.id}>
    <EstimateWorkspace
      crumb={`${alias(site?.name ?? estimate.unit)} / ${estimate.title}`}
      tab={tab}
      onTab={setTab}
      client={alias(estimate.client)}
      name={estimate.title}
      total={estimate.total}
      packageId={estimate.id}
      staffing={staffing}
      status={status}
      onStatus={setStatus}
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          <JobSetupCard
            type={estimate.type}
            client={alias(estimate.client)}
            site={site?.name}
            name={estimate.title}
            otRule={boundOtLabel(site?.name ?? "", estimate.client, site?.code)}
            author={estimate.estimator}
            code={estimate.code}
            window={estimate.window}
            existingClient
          >
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
          </JobSetupCard>
          <PhaseSchedule />
        </div>
      ) : null}

      {tab === "activities" ? (
        <WorkActivitiesDesk client={estimate.client} site={site?.name} />
      ) : null}

      {tab === "crew" ? (
        <EstimateWorkbook client={estimate.client} site={site?.name} name={estimate.title} />
      ) : null}

      {tab === "staffing" ? (
        <StaffingPlanDesk client={estimate.client} site={site?.name} name={estimate.title} />
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
    </EstimatePackageProvider>
  );
}
