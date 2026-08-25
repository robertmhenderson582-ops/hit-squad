"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { ChangeOrderPacket } from "@/components/ChangeOrderPacket";
import { EquipmentDesk } from "@/components/EquipmentDesk";
import { OtherCostDesk } from "@/components/OtherCostDesk";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { useAlias } from "@/components/OwnerDeskContext";
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
  const staffing = useMemo(
    () => board?.staffing.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
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

      {tab === "equipment" ? <EquipmentDesk /> : null}

      {tab === "costs" ? <OtherCostDesk client={estimate.client} site={site?.name} /> : null}

      {tab === "change-orders" ? <ChangeOrderPacket client={estimate.client} site={site?.name} /> : null}
    </EstimateWorkspace>
    </EstimatePackageProvider>
  );
}
