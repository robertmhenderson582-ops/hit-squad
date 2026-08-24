"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobList } from "@/components/JobList";

export default function CostPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="COST">
        <p className="mt-2 text-sm text-paper-cream/80">T&amp;M and outage cost tickets for the signed-in owner.</p>
        <JobList kind="t&m" />
      </DeskChrome>
    </AuthGate>
  );
}
