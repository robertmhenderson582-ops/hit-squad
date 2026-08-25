"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { ModuleTable } from "@/components/ModuleTable";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { useAlias } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { ShopRigSheet } from "@/components/ShopRigSheet";
import { boundOtLabel } from "@/lib/hours-clock";

export function NewEstimateForm() {
  const params = useSearchParams();
  const size = params.get("size");
  const client = params.get("client") || "Phillips 66";
  const site = params.get("site") || "Wood River — Roxana, IL";
  const name = params.get("name") || "New T&M estimate";

  if (size === "shop") {
    return (
      <DeskChrome title="SHOP / RIG">
        <ShopRigSheet client={client} name={name} />
      </DeskChrome>
    );
  }

  return <NewEstimateDesk client={client} site={site} name={name} size={size} />;
}

function NewEstimateDesk({
  client,
  site,
  name,
  size,
}: {
  client: string;
  site: string;
  name: string;
  size: string | null;
}) {
  const alias = useAlias();
  const { user } = useSession();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const plant = site.split("—")[0]?.trim() || site;
  const otRule = boundOtLabel(site, client);

  const existingClient = size !== "other";
  const estimateKey = `new:${client}:${site}:${name}`;

  return (
    <EstimatePackageProvider estimateKey={estimateKey}>
    <EstimateWorkspace
      crumb={`${alias(plant)} / ${name}`}
      tab={tab}
      onTab={setTab}
      client={alias(client)}
      name={name}
      status="Estimate"
      statusLocked
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          <JobSetupCard
            type="T&M"
            client={alias(client)}
            name={name}
            otRule={otRule}
            author={user?.name}
            existingClient={existingClient}
          />
          <PhaseSchedule />
        </div>
      ) : null}
      {tab === "activities" ? <WorkActivitiesDesk client={client} site={site} /> : null}
      {tab === "crew" ? <EstimateWorkbook client={client} site={site} name={name} /> : null}
      {tab === "staffing" ? <StaffingPlanDesk client={client} site={site} name={name} /> : null}
      {tab === "support" ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Support</h2>
          <p className="text-sm text-[#5b6f73]">
            Support is the duty split. Direct Craft stays empty until you add a position. The
            Staffing tab is the generated P66 plan.
          </p>
          <ModuleTable caption="SUPPORT" headers={["BILLED AS", "POSITION", "DAYS", "SHIFT", "HEADCOUNT"]}>
            {null}
          </ModuleTable>
        </div>
      ) : null}
      {tab === "equipment" ? (
        <ModuleTable caption="EQUIPMENT" headers={["ITEM", "QTY", "PERIOD", "RATE"]}>{null}</ModuleTable>
      ) : null}
      {tab === "costs" ? (
        <ModuleTable caption="COSTS" headers={["PERIOD", "BUDGET", "EARNED", "ACTUAL", "CPI", "SPI", "FORECAST"]}>
          {null}
        </ModuleTable>
      ) : null}
      {tab === "change-orders" ? (
        <ModuleTable caption="CHANGE ORDERS" headers={["NO.", "SCOPE", "ORIGIN", "LABOR", "MATL", "STATUS"]}>
          {null}
        </ModuleTable>
      ) : null}
    </EstimateWorkspace>
    </EstimatePackageProvider>
  );
}
