"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeskHero } from "@/components/DeskHero";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { useDisplay } from "@/components/DisplayProvider";
import { HOME_DOORS, companyDoorLogoSrc } from "@/lib/desk-home";
import { viewAsInit } from "@/lib/desk-scope";
import { deskFetch } from "@/lib/estimate-vault-client";

export function DeskHome() {
  const { resolvedTheme } = useDisplay();
  const { seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const [companyDeskLogo, setCompanyDeskLogo] = useState<string | null>(null);
  const night = resolvedTheme === "night";

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    deskFetch("/api/desk/jobs", viewAsInit(seat))
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const next = typeof data.companyDeskLogo === "string" ? companyDoorLogoSrc([{ logo: data.companyDeskLogo }]) : null;
        setCompanyDeskLogo(next);
      })
      .catch(() => {
        if (!cancelled) setCompanyDeskLogo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, viewingAs]);

  return (
    <div className="space-y-6">
      <DeskHero />
      <p className={`max-w-3xl text-sm leading-6 ${night ? "text-paper-cream/80" : "text-[#5b6f73]"}`}>
        Two doors, one home. Company desk is companies, then site, then jobs. Standalone is a quiet
        door for a one-off estimate, a change-order log, or a tool that is not tied to a client site.
      </p>
      <div className="desk-grid">
        {HOME_DOORS.map((door) => {
          const logo = door.key === "company" ? companyDeskLogo : null;
          return (
            <Link
              key={door.key}
              href={door.href}
              aria-label={door.label}
              className={
                night
                  ? `hud-tile block ${logo ? "company-desk-logo-door" : "px-4 py-5"}`
                  : `plant-card block ${logo ? "company-desk-logo-door" : "px-4 py-5"}`
              }
            >
              {logo ? (
                <span className="company-desk-logo-fill">
                  <img src={logo} alt="" />
                </span>
              ) : (
                <>
                  <p className={`font-mono text-[10px] tracking-[0.28em] ${night ? "text-steel-glow" : "text-steel"}`}>
                    {door.note.toUpperCase()}
                  </p>
                  <p className={`mt-2 font-display text-3xl tracking-[0.16em] ${night ? "text-paper-cream" : "text-[#163038]"}`}>
                    {door.label.toUpperCase()}
                  </p>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
