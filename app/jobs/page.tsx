"use client";

import { AuthGate } from "@/components/AuthGate";
import { CompanyModuleGate } from "@/components/CompanyModuleGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobsDesk } from "@/components/JobsDesk";
import { RateVaultOnlyRedirect } from "@/components/RateVaultOnlyRedirect";

export default function JobsPage() {
  return (
    <AuthGate require="authenticated">
      <RateVaultOnlyRedirect />
      <DeskChrome title="JOBS">
        <CompanyModuleGate module="jobs">
          <JobsDesk />
        </CompanyModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
