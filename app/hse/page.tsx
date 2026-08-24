"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobList } from "@/components/JobList";

export default function HsePage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="HSE">
        <p className="mt-2 text-sm text-paper-cream/80">Permits, walkdowns, and open actions. Field trial only.</p>
        <JobList kind="hse" />
      </DeskChrome>
    </AuthGate>
  );
}
