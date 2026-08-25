"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { TicketsDesk } from "@/components/TicketsDesk";

export default function TicketsPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="TICKETS">
        <TicketsDesk />
      </DeskChrome>
    </AuthGate>
  );
}
