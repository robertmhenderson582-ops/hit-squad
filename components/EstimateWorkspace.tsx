"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { DeskBanners } from "@/components/DeskBanners";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { RfqPreview } from "@/components/RfqPreview";

const TABS = [
  { id: "summary", label: "Job setup", icon: "📄" },
  { id: "activities", label: "Activities", icon: "∿" },
  { id: "crew", label: "Crew", icon: "⛑" },
  { id: "staffing", label: "Staffing", icon: "▦" },
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
  children,
}: {
  crumb: string;
  tab: EstimateTab;
  onTab: (next: EstimateTab) => void;
  client?: string;
  name?: string;
  total?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [rfq, setRfq] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#d8e4e2]">
      <FieldTrialBanner />
      {rfq ? (
        <RfqPreview
          client={client || crumb}
          name={name || crumb}
          total={total}
          onClose={() => setRfq(false)}
        />
      ) : null}
      <header className="est-chrome">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="brand-static flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <span className="font-display text-lg tracking-[0.16em] text-white">HIT SQUAD</span>
            </Link>
            <p className="truncate text-sm text-white/70">{crumb}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  if (action.id === "export") setRfq(true);
                }}
                className="rounded border border-white/20 px-3 py-1.5 text-white/90"
              >
                {action.label}
              </button>
            ))}
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
              onClick={() => onTab(item.id)}
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
    </div>
  );
}
