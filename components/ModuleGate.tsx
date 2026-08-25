"use client";

import type { DeskCapability } from "@/lib/access";
import { hasCapability } from "@/lib/access";
import { useSession } from "@/components/SessionProvider";

export function ModuleGate({
  need,
  children,
}: {
  need: DeskCapability;
  children: React.ReactNode;
}) {
  const { user } = useSession();
  if (!hasCapability(user, need)) {
    return <p className="mt-4 text-paper-cream/80">Not on this seat.</p>;
  }
  return <>{children}</>;
}
