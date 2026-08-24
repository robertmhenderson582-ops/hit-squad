"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobList } from "@/components/JobList";

export default function JobsPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="JOBS">
        <p className="mt-2 text-sm text-paper-cream/80">
          Outage and T&amp;M jobs loaded for this desk. Other users never see this board.
        </p>
        <JobList />
      </DeskChrome>
    </AuthGate>
  );
}
