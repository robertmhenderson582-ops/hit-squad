"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HoldScreen } from "@/components/HoldScreen";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { canSeeRateVaultDoor } from "@/lib/desk-role";

export function RateVaultGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, status } = useSession();
  const lens = useLensUser();
  const allowed = canSeeRateVaultDoor(user, lens);

  useEffect(() => {
    if (status === "loading") return;
    if (!allowed) router.replace("/");
  }, [allowed, router, status]);

  if (status === "loading") {
    return <HoldScreen label="CHECKING DESK SESSION" />;
  }

  if (!allowed) {
    return <HoldScreen label="OPENING DESK" />;
  }

  return <>{children}</>;
}
