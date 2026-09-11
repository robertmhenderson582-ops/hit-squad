"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { HiddenInboxRedirect } from "@/components/HiddenInboxRedirect";
import { TicketsDesk } from "@/components/TicketsDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function TicketsPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <HiddenInboxRedirect />
      <DeskChrome title="TICKETS">
        <TicketsDesk />
      </DeskChrome>
    </AuthGate>
  );
}
