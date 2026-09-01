"use client";

import Link from "next/link";
import { DeskHero } from "@/components/DeskHero";
import { useDisplay } from "@/components/DisplayProvider";
import { HOME_DOORS } from "@/lib/desk-home";

export function DeskHome() {
  const { resolvedTheme } = useDisplay();
  const night = resolvedTheme === "night";

  return (
    <div className="space-y-6">
      <DeskHero />
      <p className={`max-w-3xl text-sm leading-6 ${night ? "text-paper-cream/80" : "text-[#5b6f73]"}`}>
        Two doors, one home. Company desk is companies, then site, then jobs. Standalone is a quiet
        door for a one-off estimate, a change-order log, or a tool that is not tied to a client site.
      </p>
      <div className="desk-grid">
        {HOME_DOORS.map((door) => (
          <Link
            key={door.key}
            href={door.href}
            className={night ? "hud-tile block px-4 py-5" : "plant-card block px-4 py-5"}
          >
            <p className={`font-mono text-[10px] tracking-[0.28em] ${night ? "text-steel-glow" : "text-steel"}`}>
              {door.note.toUpperCase()}
            </p>
            <p className={`mt-2 font-display text-3xl tracking-[0.16em] ${night ? "text-paper-cream" : "text-[#163038]"}`}>
              {door.label.toUpperCase()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
