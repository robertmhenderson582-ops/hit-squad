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
import { SubcontractorDesk } from "@/components/SubcontractorDesk";
import { ChangeOrderPacket } from "@/components/ChangeOrderPacket";
import { WorkActivitiesDesk } from "@/components/WorkActivitiesDesk";
import { StaffingPlanDesk } from "@/components/StaffingPlanDesk";
import { OrgChartDesk } from "@/components/OrgChartDesk";
import { RodeoFormDesk } from "@/components/RodeoFormDesk";
import { HseDay1Card } from "@/components/HseDay1Card";
import { QualityDay1Card } from "@/components/QualityDay1Card";
import { RollingChartMap } from "@/components/RollingChartMap";
import { NoRatesNotice } from "@/components/NoRatesNotice";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { ShopRigSheet } from "@/components/ShopRigSheet";
import { HSE_TAB_ID, QUALITY_TAB_ID } from "@/lib/quality-hse-modules";
import { newEstimateNeedsRatesNotice } from "@/lib/estimate-rates-gate";
import { boundOtLabel } from "@/lib/hours-clock";
import { newEstimateKey, newEstimatePackId } from "@/lib/estimate-open";
import { defaultEstimateName } from "@/lib/job-event";
import { hydrateFromVault, flushVaultUpsert, scheduleVaultUpsert } from "@/lib/estimate-vault-client";
import { findLocalPack, rememberLocalPack } from "@/lib/local-estimates";

export function NewEstimateForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useSession();
  const { lens, seat } = useDeskLens();
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
    void hydrateFromVault(undefined, { viewAs: seat }).then(() => {
      const existing = findLocalPack(pack);
      rememberLocalPack({
        packId: pack,
        title: existing?.title || name,
        client,
        site,
        size: size ?? undefined,
        ownerEmail: lens?.email || user?.email,
        estimator: lens?.name || user?.name,
      });
      scheduleVaultUpsert(pack);
      void flushVaultUpsert(pack);
    });
  }, [client, lens?.email, lens?.name, name, pack, seat, site, size, user?.email, user?.name]);

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
  const { lens } = useDeskLens();
  const [tab, setTab] = useState<EstimateTab>("summary");
  const [title, setTitle] = useState(name);
  const [ratesTick, setRatesTick] = useState(0);
  const plant = site.split("—")[0]?.trim() || site;
  const otRule = boundOtLabel(site, client);
  const needsRates = size !== "shop" && newEstimateNeedsRatesNotice(lens || user) && ratesTick >= 0;

  const existingClient = size !== "other";
  const estimateKey = newEstimateKey(pack);

  return (
    <EstimatePackageProvider estimateKey={estimateKey}>
    <EstimateWorkspace
      crumb={`${alias(plant)} / ${title}`}
      tab={tab}
      onTab={setTab}
      client={alias(client)}
      site={alias(site)}
      jobClient={client}
      jobSite={site}
      name={title}
      packageId={pack}
      status="Estimate"
      statusLocked
    >
      {tab === "summary" ? (
        <div className="space-y-5">
          {needsRates ? <NoRatesNotice user={lens || user} onImported={() => setRatesTick((value) => value + 1)} /> : null}
          <JobSetupCard
            type="T&M"
            client={alias(client)}
            site={site}
            name={title}
            onName={setTitle}
            otRule={alias(otRule)}
            author={user?.name}
            existingClient={existingClient}
            status="Estimate"
            statusLocked
            onOpenQuality={() => setTab(QUALITY_TAB_ID)}
            onOpenHse={() => setTab(HSE_TAB_ID)}
          />
          <PhaseSchedule />
        </div>
      ) : null}
      {tab === "activities" ? <WorkActivitiesDesk client={client} site={site} /> : null}
      {tab === "crew" ? <EstimateWorkbook client={client} site={site} name={title} /> : null}
      {tab === "org-chart" ? <OrgChartDesk client={client} site={site} name={title} /> : null}
      {tab === "staffing" ? <StaffingPlanDesk client={client} site={site} name={title} /> : null}
      {tab === "equipment" ? <EquipmentDesk /> : null}
      {tab === "subs" ? <SubcontractorDesk client={client} site={site} /> : null}
      {tab === "costs" ? <OtherCostDesk client={client} site={site} /> : null}
      {tab === "change-orders" ? <ChangeOrderPacket client={client} site={site} /> : null}
      {tab === "rodeo" ? <RodeoFormDesk client={client} site={site} name={title} /> : null}
      {tab === QUALITY_TAB_ID ? (
        <div className="space-y-5">
          <QualityDay1Card status="Estimate" />
          <RollingChartMap />
        </div>
      ) : null}
      {tab === HSE_TAB_ID ? <HseDay1Card status="Estimate" site={site} client={client} /> : null}
    </EstimateWorkspace>
    </EstimatePackageProvider>
  );
}
