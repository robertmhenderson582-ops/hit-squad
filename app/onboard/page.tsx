"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { OnboardDesk } from "@/components/OnboardDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import {
  controlCenterBrandForUser,
  parseControlCenterBrand,
  type ControlCenterBrand,
} from "@/lib/onboard-brand";
import { DISPATCH_DENIED } from "@/lib/module-access";
import { CONTROL_CENTER_CHROME } from "@/lib/onboard-pipeline";

export default function OnboardPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <OnboardFrame />
    </AuthGate>
  );
}

function OnboardFrame() {
  const { user } = useSession();
  const lens = useLensUser();
  const desk = useOwnerDesk();
  const [brand, setBrand] = useState<ControlCenterBrand>(() => controlCenterBrandForUser(lens ?? user, []));
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    setBrand(controlCenterBrandForUser(lens ?? user, []));
    setBlocked(null);
    let cancelled = false;
    fetch("/api/desk/onboard", viewAsInit(desk?.viewAs))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok && data.error === DISPATCH_DENIED) {
          setBlocked(DISPATCH_DENIED);
          return;
        }
        const next = parseControlCenterBrand(data.brand);
        if (next) setBrand(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [desk?.viewAs, lens?.email, lens?.id, user?.email, user?.id]);

  return (
    <DeskChrome title={brand.fallbackLabel || CONTROL_CENTER_CHROME} titleBrand={brand}>
      {blocked ? (
        <section className="plant-card px-5 py-5 text-[#5b6f73]">{blocked}</section>
      ) : (
        <OnboardDesk />
      )}
    </DeskChrome>
  );
}
