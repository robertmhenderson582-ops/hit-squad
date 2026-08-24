"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobList } from "@/components/JobList";

export default function EstimatesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="ESTIMATES">
        <p className="mt-2 text-sm text-paper-cream/80">Working estimates only. Draft figures stay on this desk.</p>
        <JobList kind="estimate" />
      </DeskChrome>
    </AuthGate>
  );
}
