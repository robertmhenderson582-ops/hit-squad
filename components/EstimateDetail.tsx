"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { ChangeOrderPacket } from "@/components/ChangeOrderPacket";
import { EquipmentDesk } from "@/components/EquipmentDesk";
import { OtherCostDesk } from "@/components/OtherCostDesk";
import { SubcontractorDesk } from "@/components/SubcontractorDesk";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { OrgChartDesk } from "@/components/OrgChartDesk";
import { RodeoFormDesk } from "@/components/RodeoFormDesk";
import { EstimatePackageProvider, useEstimatePackage } from "@/components/EstimatePackage";
import { HoldScreen } from "@/components/HoldScreen";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { useAlias } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { boundOtLabel } from "@/lib/hours-clock";
import { estimateStorageKey } from "@/lib/estimate-open";
import { findLocalPack, localPackToEstimate } from "@/lib/local-estimates";
import { DEFAULT_ESTIMATE_STATUS, type EstimateStatus } from "@/lib/estimate-status";
import type { EstimateRecord, StaffingLine } from "@/lib/types";

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const alias = useAlias();
  const { board, error } = useDeskBoard();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const local = findLocalPack(estimateId);
  const estimate = board?.estimates.find((row) => row.id === estimateId) ?? (local ? localPackToEstimate(local) : undefined);
  const site = board?.sites.find((row) => row.id === estimate?.siteId);
  const siteName = site?.name ?? local?.site ?? estimate?.unit ?? "";
  const staffing = useMemo(
    () => board?.staffing.filter((row) => row.estimateId === estimateId) ?? [],
    [board, estimateId],
  );
  const [title, setTitle] = useState(estimate?.title || local?.title || "");

  useEffect(() => {
    setTitle(estimate?.title || local?.title || "");
  }, [estimateId]);

  if (error && !estimate) return <p className="p-6 text-amber-flare">{error}</p>;
  if (!board && !estimate) return <HoldScreen label="LOADING ESTIMATE" variant="panel" />;
  if (!estimate) {
    return (
      <p className="p-6">
        That package is not on this desk.{" "}
        <Link href="/jobs" className="text-steel underline">
          Back to jobs
        </Link>
      </p>
    );
  }

  const shown = title || estimate.title;

  return (
    <EstimatePackageProvider estimateKey={estimateStorageKey(estimate.id)}>
      <EstimateDetailBody
        estimate={estimate}
        siteName={siteName}
        siteCode={site?.code}
        regularClient={site?.regularClient}
        staffing={staffing}
        alias={alias}
        title={shown}
        setTitle={setTitle}
        tab={tab}
        setTab={setTab}
      />
    </EstimatePackageProvider>
  );
}

function EstimateDetailBody({
  estimate,
  siteName,
  siteCode,
  regularClient,
  staffing,
  alias,
  title,
  setTitle,
  tab,
  setTab,
}: {
  estimate: EstimateRecord;
  siteName: string;
  siteCode?: string;
  regularClient?: boolean;
  staffing: StaffingLine[];
  alias: (value: string) => string;
  title: string;
  setTitle: (next: string) => void;
  tab: EstimateTab;
  setTab: (next: EstimateTab) => void;
}) {
  const pack = useEstimatePackage();
  const status: EstimateStatus = pack.status || DEFAULT_ESTIMATE_STATUS;
  const shown = title || estimate.title;

  if (!pack.ready) {
    return <HoldScreen label="OPENING PACKAGE" variant="panel" />;
  }

  return (
    <EstimateWorkspace
      crumb={`${alias(siteName)} / ${shown}`}
      tab={tab}
      onTab={setTab}
      client={alias(estimate.client)}
      site={alias(siteName)}
      jobClient={estimate.client}
      jobSite={siteName}
      name={shown}
      onName={setTitle}
      total={estimate.total}
      packageId={estimate.id}
      staffing={staffing}
      status={status}
      onStatus={(next) => pack.setPackStatus(next)}
      regularClient={regularClient}
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          <JobSetupCard
            type={estimate.type}
            client={alias(estimate.client)}
            site={siteName}
            name={shown}
            onName={setTitle}
            otRule={alias(boundOtLabel(siteName, estimate.client, siteCode))}
            author={estimate.estimator}
            code={estimate.code}
            window={estimate.window}
            existingClient
            status={status}
            onStatus={(next) => pack.setPackStatus(next)}
            regularClient={regularClient}
          >
            {status !== "Draft" ? (
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
        <WorkActivitiesDesk client={estimate.client} site={siteName} />
      ) : null}

      {tab === "crew" ? (
        <EstimateWorkbook client={estimate.client} site={siteName} name={shown} />
      ) : null}

      {tab === "org-chart" ? (
        <OrgChartDesk client={estimate.client} site={siteName} name={shown} />
      ) : null}

      {tab === "staffing" ? (
        <StaffingPlanDesk client={estimate.client} site={siteName} name={shown} />
      ) : null}

      {tab === "equipment" ? <EquipmentDesk client={estimate.client} site={siteName} /> : null}

      {tab === "subs" ? <SubcontractorDesk client={estimate.client} site={siteName} /> : null}

      {tab === "costs" ? <OtherCostDesk client={estimate.client} site={siteName} /> : null}

      {tab === "change-orders" ? <ChangeOrderPacket client={estimate.client} site={siteName} /> : null}

      {tab === "rodeo" ? <RodeoFormDesk client={estimate.client} site={siteName} name={shown} /> : null}
    </EstimateWorkspace>
  );
}
