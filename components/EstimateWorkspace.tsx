"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "activities", label: "Activities" },
  { id: "crew", label: "Crew" },
  { id: "staffing", label: "Staffing" },
  { id: "equipment", label: "Equipment" },
  { id: "costs", label: "Costs" },
  { id: "change-orders", label: "Change orders" },
] as const;

export type EstimateTab = (typeof TABS)[number]["id"];

export function EstimateWorkspace({
  crumb,
  tab,
  onTab,
  children,
}: {
  crumb: string;
  tab: EstimateTab;
  onTab: (next: EstimateTab) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#d8e4e2]">
      <FieldTrialBanner />
      <header className="est-chrome">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <span className="font-display text-lg tracking-[0.16em] text-white">HIT SQUAD</span>
            </Link>
            <p className="truncate text-sm text-white/70">{crumb}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {["Team", "Undo", "Export", "Duplicate"].map((action) => (
              <button key={action} type="button" className="rounded border border-white/20 px-3 py-1.5 text-white/90">
                {action}
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
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="paper-desk min-h-[70vh] px-4 py-6">{children}</div>
    </div>
  );
}
