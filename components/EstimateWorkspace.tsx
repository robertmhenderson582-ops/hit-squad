"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { DeskBanners } from "@/components/DeskBanners";
import { useDisplay } from "@/components/DisplayProvider";
import { ShareTurnover } from "@/components/ShareTurnover";
import { InboxBadge } from "@/components/InboxBadge";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { ThemeFlip } from "@/components/ThemeFlip";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { RfqPreview } from "@/components/RfqPreview";
import { closePackage, isClosed } from "@/lib/desk-closeout";
import type { StaffingLine } from "@/lib/types";

const TABS = [
  { id: "summary", label: "Job setup", icon: "📄" },
  { id: "activities", label: "Activities", icon: "∿" },
  { id: "crew", label: "Crew", icon: "⛑" },
  { id: "staffing", label: "Support", icon: "▦" },
  { id: "equipment", label: "Equipment", icon: "⛟" },
  { id: "costs", label: "Costs", icon: "▤" },
  { id: "change-orders", label: "Change orders", icon: "⚖" },
] as const;

const ACTIONS = [
  { id: "team", label: "Team" },
  { id: "undo", label: "Undo" },
  { id: "export", label: "Export" },
  { id: "duplicate", label: "Duplicate" },
] as const;

export type EstimateTab = (typeof TABS)[number]["id"];

export function EstimateWorkspace({
  crumb,
  tab,
  onTab,
  client,
  name,
  total,
  packageId,
  staffing,
  children,
}: {
  crumb: string;
  tab: EstimateTab;
  onTab: (next: EstimateTab) => void;
  client?: string;
  name?: string;
  total?: string;
  packageId?: string;
  staffing?: StaffingLine[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [rfq, setRfq] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { resolvedTheme } = useDisplay();
  const paper = resolvedTheme === "day";
  const closed = packageId ? isClosed(packageId) : false;

  return (
    <div className={paper ? "min-h-screen overflow-x-hidden bg-[#d8e4e2]" : "industrial-root"}>
      <FieldTrialBanner />
      {rfq ? (
        <RfqPreview
          client={client || crumb}
          name={name || crumb}
          total={total}
          staffing={staffing}
          onClose={() => setRfq(false)}
        />
      ) : null}
      <header className={paper ? "est-chrome" : "est-chrome hud-bezel"}>
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="brand-static flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <span className="leading-none">
                <span className="block font-display text-lg tracking-[0.16em] text-white">HIT SQUAD</span>
                <span className="mt-0.5 block font-display text-[10px] tracking-[0.22em] text-white/75">
                  PROJECT CONTROLS
                </span>
              </span>
            </Link>
            <p className="truncate text-sm text-white/70">{crumb}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <InboxBadge />
            <ThemeFlip />
            <ShareTurnover title={name || crumb} />
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  if (action.id === "export") {
                    setRfq(true);
                    noteFeatureTrail("export");
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
                title="Close out"
              >
                Close out
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push("/estimates")}
              className="rounded border border-white/20 px-3 py-1.5 text-white/90"
            >
              Close
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 px-3 pb-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onTab(item.id);
                if (item.id === "crew") noteFeatureTrail("Crew");
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
      </header>
      <div className="paper-desk min-h-[70vh] px-4 py-6">
        <DeskBanners />
        {children}
      </div>
      {confirmClose && packageId ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="estimate-modal px-6 py-5">
            <h2 className="font-display text-2xl text-[#163038]">Close out</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">
              {name || crumb} leaves Home. Nothing is deleted. Closed out sits collapsed at the
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
                  router.push("/estimates");
                }}
                className="rounded-lg bg-steel px-4 py-2 text-white"
              >
                Close out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
