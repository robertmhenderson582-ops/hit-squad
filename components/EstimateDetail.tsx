"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateStatus, type EstimateTab } from "@/components/EstimateWorkspace";
import { ChangeOrderPacket } from "@/components/ChangeOrderPacket";
import { EquipmentDesk } from "@/components/EquipmentDesk";
import { OtherCostDesk } from "@/components/OtherCostDesk";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { useAlias, useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { boundOtLabel } from "@/lib/hours-clock";
import {
  ensureSeatEstimates,
  findCopy,
  folderIsLocked,
  seedExampleSheetsOnce,
  setCopyStatus,
  showsAwardFields,
  writeSeatEstimates,
  type SeatEstimate,
} from "@/lib/seat-estimates";

export function EstimateDetail({ estimateId }: { estimateId: string }) {
  const alias = useAlias();
  const { user } = useSession();
  const lens = useLensUser();
  const seatId = lens?.id || user?.id || "";
  const seatName = lens?.name || user?.name || "Owner";
  const [tab, setTab] = useState<EstimateTab>("summary");
  const [copy, setCopy] = useState<SeatEstimate | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!seatId || !estimateId) return;
    const list = ensureSeatEstimates(seatId, seatName);
    const row = findCopy(list, estimateId) ?? null;
    if (row) seedExampleSheetsOnce(row.id, row.templateId);
    setCopy(row);
    setReady(true);
  }, [estimateId, seatId, seatName]);

  const estimateKey = copy?.id || "";
  const status = (copy?.status || "Estimate") as EstimateStatus;
  const locked = copy ? folderIsLocked(status, "example") : false;
  const awardFields = copy ? showsAwardFields(status) : false;

  const staffing = useMemo(() => [], []);

  if (!seatId || !ready) return <p className="p-6 font-mono text-xs tracking-[0.2em] text-steel">LOADING PACKAGE</p>;
  if (!copy) {
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
    <EstimatePackageProvider estimateKey={estimateKey}>
    <EstimateWorkspace
      crumb={`${alias(copy.siteName)} / ${copy.title}`}
      tab={tab}
      onTab={setTab}
      client={alias(copy.client)}
      site={alias(copy.siteName)}
      jobClient={copy.client}
      jobSite={copy.siteName}
      name={copy.title}
      total={copy.total}
      packageId={copy.id}
      staffing={staffing}
      status={status}
      onStatus={(next) => {
        const list = ensureSeatEstimates(seatId, seatName);
        const updated = setCopyStatus(list, copy.id, next);
        writeSeatEstimates(seatId, updated);
        setCopy(findCopy(updated, copy.id) ?? copy);
      }}
      folderLocked={locked}
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          <JobSetupCard
            type={copy.type}
            client={alias(copy.client)}
            site={copy.siteName}
            name={copy.title}
            otRule={boundOtLabel(copy.siteName, copy.client)}
            author={copy.estimator}
            code={copy.code}
            window={copy.window}
            existingClient
          >
            {awardFields ? (
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
        <WorkActivitiesDesk client={copy.client} site={copy.siteName} />
      ) : null}

      {tab === "crew" ? (
        <EstimateWorkbook client={copy.client} site={copy.siteName} name={copy.title} />
      ) : null}

      {tab === "staffing" ? (
        <StaffingPlanDesk client={copy.client} site={copy.siteName} name={copy.title} />
      ) : null}

      {tab === "equipment" ? <EquipmentDesk /> : null}

      {tab === "costs" ? <OtherCostDesk client={copy.client} site={copy.siteName} /> : null}

      {tab === "change-orders" ? <ChangeOrderPacket client={copy.client} site={copy.siteName} /> : null}
    </EstimateWorkspace>
    </EstimatePackageProvider>
  );
}
