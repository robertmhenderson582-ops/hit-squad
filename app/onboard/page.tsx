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

  useEffect(() => {
    setBrand(controlCenterBrandForUser(lens ?? user, []));
    let cancelled = false;
    fetch("/api/desk/onboard", viewAsInit(desk?.viewAs))
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
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
      <OnboardDesk />
    </DeskChrome>
  );
}
