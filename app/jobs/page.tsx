"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobsDesk } from "@/components/JobsDesk";

export default function JobsPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="JOBS">
        <JobsDesk />
      </DeskChrome>
    </AuthGate>
  );
}
