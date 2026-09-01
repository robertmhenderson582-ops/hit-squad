"use client";

import Link from "next/link";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { useDisplay } from "@/components/DisplayProvider";
import { canOpenRates } from "@/lib/desk-role";
import { useLensUser } from "@/components/OwnerDeskContext";

const TOOLS = [
  { href: "/change-orders", label: "Change-order log", note: "Parked list. Job packets stay on the estimate." },
  { href: "/cost", label: "Cost / PPR", note: "T&M / earned value — not nested under a client site." },
] as const;

export function StandaloneDesk() {
  const { openNewEstimate } = useEstimateModal();
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";
  const lens = useLensUser();
  const rates = canOpenRates(lens);

  return (
    <div className="mt-4 space-y-5">
      <p className={`max-w-3xl text-sm leading-6 ${night ? "text-paper-cream/80" : "text-[#5b6f73]"}`}>
        Quiet door. One-off estimate, change-order log, or a tool that is not tied to a client site.
        Company people stay on the company desk. Same login.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => openNewEstimate()}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          New estimate
        </button>
        <Link href="/jobs" className="rounded-lg border border-steel px-4 py-2 text-steel">
          Company desk
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={night ? "hud-tile block px-4 py-5" : "plant-card block px-4 py-5"}
          >
            <p className="font-display text-2xl tracking-wide">{tool.label}</p>
            <p className="mt-2 text-sm text-[#5b6f73]">{tool.note}</p>
          </Link>
        ))}
        {rates ? (
          <Link href="/rates" className={night ? "hud-tile block px-4 py-5" : "plant-card block px-4 py-5"}>
            <p className="font-display text-2xl tracking-wide">Rates</p>
            <p className="mt-2 text-sm text-[#5b6f73]">Wage look-up that is not nested under a plant.</p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
