"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { ModuleTable } from "@/components/ModuleTable";
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

  return <NewEstimateDesk client={client} site={site} name={name} />;
}

function NewEstimateDesk({
  client,
  site,
  name,
}: {
  client: string;
  site: string;
  name: string;
}) {
  const alias = useAlias();
  const { user } = useSession();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const plant = site.split("—")[0]?.trim() || site;
  const otRule = boundOtLabel(site, client);

  return (
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
          />
          <PhaseSchedule />
        </div>
      ) : null}
      {tab === "activities" ? (
        <ModuleTable caption="ACTIVITIES" headers={["WBS", "ACTIVITY", "CRAFT", "MH", "DOLLARS", "STATUS"]}>
          {null}
        </ModuleTable>
      ) : null}
      {tab === "crew" ? <EstimateWorkbook client={client} site={site} name={name} /> : null}
      {tab === "staffing" ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Support</h2>
          <p className="text-sm text-[#5b6f73]">
            Support / Staffing is the duty split. Direct Craft stays empty until you add a position.
          </p>
          <ModuleTable caption="STAFFING" headers={["BILLED AS", "POSITION", "DAYS", "SHIFT", "HEADCOUNT"]}>
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
  );
}
