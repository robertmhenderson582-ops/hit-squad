"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeskChrome } from "@/components/DeskChrome";
import { EstimateWorkbook } from "@/components/EstimateWorkbook";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { EstimatePackageProvider } from "@/components/EstimatePackage";
import { JobSetupCard } from "@/components/JobSetupCard";
import { PhaseSchedule } from "@/components/PhaseSchedule";
import { EquipmentDesk } from "@/components/EquipmentDesk";
import { OtherCostDesk } from "@/components/OtherCostDesk";
import { ChangeOrderPacket } from "@/components/ChangeOrderPacket";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { useAlias } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { ShopRigSheet } from "@/components/ShopRigSheet";
import { boundOtLabel } from "@/lib/hours-clock";
import { newEstimateKey, newEstimatePackId } from "@/lib/estimate-open";
import { defaultEstimateName } from "@/lib/job-event";
import { hydrateFromVault, scheduleVaultUpsert } from "@/lib/estimate-vault-client";
import { rememberLocalPack } from "@/lib/local-estimates";

export function NewEstimateForm() {
  const params = useSearchParams();
  const router = useRouter();
  const size = params.get("size");
  const client = params.get("client") || "Phillips 66";
  const site = params.get("site") || "Wood River — Roxana, IL";
  const name = params.get("name") || defaultEstimateName(client, site, size ?? undefined);
  const pack = params.get("pack");

  useEffect(() => {
    if (pack || size === "shop") return;
    const next = new URLSearchParams(params.toString());
    next.set("pack", newEstimatePackId());
    router.replace(`/estimates/new?${next.toString()}`);
  }, [pack, params, router, size]);

  useEffect(() => {
    if (!pack || size === "shop") return;
    void hydrateFromVault().then(() => {
      rememberLocalPack({ packId: pack, title: name, client, site, size: size ?? undefined });
      scheduleVaultUpsert(pack);
    });
  }, [client, name, pack, site, size]);

  if (size === "shop") {
    return (
      <DeskChrome title="SHOP / RIG">
        <ShopRigSheet client={client} name={name} />
      </DeskChrome>
    );
  }

  if (!pack) {
    return <p className="p-6 text-sm text-[#5b6f73]">Opening package</p>;
  }

  return <NewEstimateDesk client={client} site={site} name={name} size={size} pack={pack} />;
}

function NewEstimateDesk({
  client,
  site,
  name,
  size,
  pack,
}: {
  client: string;
  site: string;
  name: string;
  size: string | null;
  pack: string;
}) {
  const alias = useAlias();
  const { user } = useSession();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const plant = site.split("—")[0]?.trim() || site;
  const otRule = boundOtLabel(site, client);

  const existingClient = size !== "other";
  const estimateKey = newEstimateKey(pack);

  return (
    <EstimatePackageProvider estimateKey={estimateKey}>
    <EstimateWorkspace
      crumb={`${alias(plant)} / ${name}`}
      tab={tab}
      onTab={setTab}
      client={alias(client)}
      site={alias(site)}
      jobClient={client}
      jobSite={site}
      name={name}
      packageId={pack}
      status="Estimate"
      statusLocked
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          <JobSetupCard
            type="T&M"
            client={alias(client)}
            site={site}
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
      {tab === "equipment" ? <EquipmentDesk /> : null}
      {tab === "costs" ? <OtherCostDesk client={client} site={site} /> : null}
      {tab === "change-orders" ? <ChangeOrderPacket client={client} site={site} /> : null}
    </EstimateWorkspace>
    </EstimatePackageProvider>
  );
}
