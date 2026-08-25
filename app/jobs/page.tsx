"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobsDesk } from "@/components/JobsDesk";
import { ModuleGate } from "@/components/ModuleGate";

export default function JobsPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="JOBS">
        <ModuleGate need="jobs">
          <JobsDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
