"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { HomeCue } from "@/components/HomeCue";
import { DeskBanners } from "@/components/DeskBanners";
import { useDisplay } from "@/components/DisplayProvider";
import { ShareTurnover } from "@/components/ShareTurnover";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { ThemeFlip } from "@/components/ThemeFlip";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { EstimateTotalRail } from "@/components/EstimateTotalRail";
import { ModalPortal } from "@/components/ModalPortal";
import { WageLookupDesk } from "@/components/WageLookupDesk";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { closePackage, isClosed } from "@/lib/desk-closeout";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { ESTIMATE_EXPORT_ERROR, estimateToXlsx, estimateXlsxFilename } from "@/lib/estimate-xlsx";
import type { EstimateStatus } from "@/lib/estimate-status";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import {
  HSE_TAB_ID,
  HSE_TAB_LABEL,
  QUALITY_TAB_ID,
  QUALITY_TAB_LABEL,
  showsQualityHseModules,
} from "@/lib/quality-hse-modules";
import { RODEO_TAB_ID, RODEO_TAB_LABEL, showsRodeoTab } from "@/lib/rodeo-form";
import { readSubSheet } from "@/lib/subcontractor";
import { downloadXlsx } from "@/lib/xlsx-minimal";
import type { StaffingLine } from "@/lib/types";

export type { EstimateStatus };

export const BASE_ESTIMATE_TABS = [
  { id: "summary", label: "Job setup", icon: "📄" },
  { id: "activities", label: "Activities", icon: "∿" },
  { id: "crew", label: "Crew", icon: "⛑" },
  { id: "org-chart", label: "Org chart", icon: "⬡" },
  { id: "staffing", label: "Staffing", icon: "▦" },
  { id: "equipment", label: "Equipment", icon: "⛟" },
  { id: "subs", label: "Subcontractor", icon: "▣" },
  { id: "costs", label: "Other Cost", icon: "▤" },
  { id: "change-orders", label: "Change orders", icon: "⚖" },
  { id: "wage-lookup", label: "Wage lookup", icon: "＄" },
] as const;

export type EstimateTab =
  | (typeof BASE_ESTIMATE_TABS)[number]["id"]
  | typeof RODEO_TAB_ID
  | typeof QUALITY_TAB_ID
  | typeof HSE_TAB_ID;

export function estimateTabsForSite(site = "", client = "", status?: EstimateStatus) {
  const tabs: Array<{ id: EstimateTab; label: string; icon: string }> = [...BASE_ESTIMATE_TABS];
  if (showsRodeoTab(site, client)) {
    const idx = tabs.findIndex((item) => item.id === "wage-lookup");
    tabs.splice(idx < 0 ? tabs.length : idx, 0, { id: RODEO_TAB_ID, label: RODEO_TAB_LABEL, icon: "📋" });
  }
  if (showsQualityHseModules(status)) {
    tabs.push(
      { id: QUALITY_TAB_ID, label: QUALITY_TAB_LABEL, icon: "◈" },
      { id: HSE_TAB_ID, label: HSE_TAB_LABEL, icon: "✚" },
    );
  }
  return tabs;
}

const ACTIONS = [
  { id: "team", label: "Team" },
  { id: "undo", label: "Undo" },
  { id: "export", label: "Export" },
  { id: "print", label: "Print" },
  { id: "duplicate", label: "Duplicate" },
] as const;

export function EstimateWorkspace({
  crumb,
  tab,
  onTab,
  client,
  site,
  jobClient,
  jobSite,
  name,
  packageId,
  status = "Estimate",
  onStatus: _onStatus,
  statusLocked: _statusLocked = false,
  children,
}: {
  crumb: string;
  tab: EstimateTab;
  onTab: (next: EstimateTab) => void;
  client?: string;
  site?: string;
  jobClient?: string;
  jobSite?: string;
  name?: string;
  total?: string;
  packageId?: string;
  staffing?: StaffingLine[];
  status?: EstimateStatus;
  onStatus?: (next: EstimateStatus) => void;
  statusLocked?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pack = useEstimatePackage();
  const [exportError, setExportError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const { resolvedTheme } = useDisplay();
  const paper = resolvedTheme === "day";
  const closed = packageId ? isClosed(packageId) : false;
  const boundClient = jobClient || client || "";
  const boundSite = jobSite || site || "";
  const tabs = estimateTabsForSite(boundSite, boundClient, status);

  function exportWorkbook() {
    setExportError("");
    try {
      const bytes = estimateToXlsx({
        title: name || crumb,
        client: boundClient,
        site: boundSite,
        crew: pack.crew,
        schedule: pack.schedule,
        orgChart: pack.orgChart,
        jobMeta: pack.jobMeta,
        equipment: readEquipmentSheet(pack.estimateKey),
        otherCost: syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
          staffPerMile: pack.jobMeta.staffMileageRate,
          craftPerMile: pack.jobMeta.craftMileageRate,
        }),
        subcontractor: readSubSheet(pack.estimateKey),
      });
      if (!bytes.byteLength) throw new Error("empty-workbook");
      downloadXlsx(estimateXlsxFilename({ site: boundSite, title: name || crumb }), bytes);
    } catch {
      setExportError(ESTIMATE_EXPORT_ERROR);
    }
  }

  return (
    <div className={paper ? "desk-day min-h-screen overflow-x-hidden bg-[#d8e4e2]" : "industrial-root"} data-capture-root>
      <FieldTrialBanner />
      <header className={paper ? "est-chrome" : "est-chrome hud-bezel"}>
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="brand-static header-home flex min-w-0 shrink-0 items-center gap-2" title="Home" aria-label="Home">
              <BrandMark className="h-7 w-7 shrink-0" />
              <span className="min-w-0 leading-none">
                <span className="block font-display text-lg tracking-[0.16em] text-white">HIT SQUAD</span>
                <span className="mt-0.5 block font-display text-[10px] tracking-[0.22em] text-white/75">
                  PROJECT CONTROLS
                </span>
                <HomeCue tight />
              </span>
            </Link>
            <p className="truncate text-sm text-white/70">{crumb}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ThemeFlip />
            <ShareTurnover title={name || crumb} packId={packageId} />
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                title={
                  action.id === "export"
                    ? "Export Excel workbook"
                    : action.id === "print"
                      ? "Print this estimate"
                      : action.id === "duplicate"
                        ? "Start a copy of this estimate"
                        : action.id === "undo"
                          ? "Undo is not wired yet"
                          : "Team is chrome only"
                }
                onClick={() => {
                  if (action.id === "export") {
                    exportWorkbook();
                    noteFeatureTrail("export");
                  }
                  if (action.id === "print") {
                    window.print();
                  }
                  if (action.id === "duplicate" && packageId) {
                    const query = new URLSearchParams({
                      client: client || "",
                      name: `${name || crumb} copy`,
                      size: "outage",
                    });
                    router.push(`/estimates/new?${query.toString()}`);
                  }
                }}
                className="rounded border border-white/20 px-3 py-1.5 text-white/90"
              >
                {action.label}
              </button>
            ))}
            {packageId && !closed ? (
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                className="rounded border border-white/20 px-3 py-1.5 text-white/90"
                title="Close out — park this estimate on the Closed out list. Nothing is deleted."
              >
                Close out
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push("/jobs")}
              className="rounded border border-white/20 px-3 py-1.5 text-white/90"
              title="Close this sheet and go back to Jobs. Does not close out the job."
            >
              Close
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 px-3 pb-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => {
                onTab(item.id);
                if (item.id === "crew") noteFeatureTrail("Crew");
                if (item.id === "staffing") noteFeatureTrail("Staffing");
                if (item.id === "subs") noteFeatureTrail("Subcontractor");
              }}
              className={`rounded-t px-3 py-2 text-sm ${
                tab === item.id ? "bg-[#0f5f6d] text-white" : "text-white/75 hover:text-white"
              }`}
            >
              <span className="mr-1.5 opacity-80" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        {exportError || pack.vaultSaveError ? (
          <p className="px-4 pb-3 text-sm text-[#f3c6a5]" role="alert">
            {exportError || pack.vaultSaveError}
          </p>
        ) : null}
      </header>
      <div className={`${paper ? "paper-desk desk-day" : "instrument-desk desk-night"} est-desk-body min-h-[70vh] px-4 py-6`}>
        <DeskBanners />
        {tab === "wage-lookup" ? <WageLookupDesk client={jobClient || client} site={jobSite || site} /> : null}
        {tab === "wage-lookup" ? null : children}
        <EstimateTotalRail client={jobClient || client} site={jobSite || site} />
      </div>
      {confirmClose && packageId ? (
        <ModalPortal>
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="estimate-modal px-6 py-5">
            <h2 className="font-display text-2xl text-[#163038]">Close out</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">
              {name || crumb} leaves the company desk. Nothing is deleted. Closed out sits collapsed at the
              bottom with Reopen / View. A copy starts open.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmClose(false)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closePackage({ id: packageId, title: name || crumb, kind: "estimate" });
                  setConfirmClose(false);
                  router.push("/jobs");
                }}
                className="rounded-lg bg-steel px-4 py-2 text-white"
              >
                Close out
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
