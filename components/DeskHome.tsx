"use client";

import { useEffect, useState } from "react";
import { DeskHero } from "@/components/DeskHero";
import { useDeskLens } from "@/components/OwnerDeskContext";
import { companyDoorLogoSrc } from "@/lib/desk-home";
import { viewAsInit } from "@/lib/desk-scope";
import { deskFetch } from "@/lib/estimate-vault-client";

export function DeskHome() {
  const { seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const [companyDeskLogo, setCompanyDeskLogo] = useState<string | null>(null);

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

  return <DeskHero logo={companyDeskLogo} />;
}
